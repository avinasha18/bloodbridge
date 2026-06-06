"""Automatic SMS updates to the patient (or attendant) about their request.

Hooked from:
  - requests.create_request          → request_created
  - reservation.record_yes (1st YES) → donor_assigned
  - coordinator send_location        → location_shared
  - reservation.coordinator_marks_donated → donor_donated
  - reservation.promote_next_standby fallback → request_failed
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import BloodRequest, Donor, Patient, PatientNotification
from app.services.i18n import detect_language, render as i18n_render
from app.services.sms_sender import _send  # internal helper handles SNS + outbox

logger = logging.getLogger(__name__)


# ─── Public link helper (track page URL) ────────────────────────────────


def _track_link(request_id: str) -> str:
    base = settings.response_base_url.split("/respond")[0]
    return f"{base}/track/{request_id}"


def _patient_lang(patient: Patient, request: BloodRequest) -> str:
    return detect_language(
        latitude=float(request.hospital_lat) if request.hospital_lat is not None else None,
        longitude=float(request.hospital_lon) if request.hospital_lon is not None else None,
        city=patient.city or _hospital_city_of(request),
    )


def _hospital_city_of(req: BloodRequest) -> Optional[str]:
    if not req.hospital_name:
        return None
    parts = [p.strip() for p in req.hospital_name.split(",")]
    return parts[-1] if len(parts) > 1 else None


# ─── Core helper ─────────────────────────────────────────────────────────


def _notify(
    db: Session,
    *,
    patient: Optional[Patient],
    request: BloodRequest,
    kind: str,
    title: str,
    body: str,
) -> Optional[PatientNotification]:
    phone = patient.phone if patient else None
    if not patient or not phone or not patient.notifications_enabled:
        logger.info(
            "Skip patient SMS [%s] req=%s: no phone or notifications disabled",
            kind,
            request.id,
        )
        # still log in-DB so coordinator UI shows what would have been sent
        note = PatientNotification(
            patient_id=patient.id if patient else None,
            request_id=request.id,
            phone=phone,
            kind=kind,
            title=title,
            body=body,
            delivery_error="no_phone_or_disabled",
            sent_at=datetime.utcnow(),
        )
        db.add(note)
        db.flush()
        return note

    try:
        sms = _send(phone, body, kind=f"patient_{kind}")
        note = PatientNotification(
            patient_id=patient.id,
            request_id=request.id,
            phone=phone,
            kind=kind,
            title=title,
            body=body,
            message_id=sms.message_id,
            sent_at=datetime.utcnow(),
        )
        db.add(note)
        db.flush()
        logger.info("Patient SMS [%s] req=%s phone=%s msg=%s", kind, request.id, phone, sms.message_id)
        return note
    except Exception as exc:
        logger.exception("Patient SMS failed [%s] req=%s", kind, request.id)
        note = PatientNotification(
            patient_id=patient.id,
            request_id=request.id,
            phone=phone,
            kind=kind,
            title=title,
            body=body,
            delivery_error=str(exc),
            sent_at=datetime.utcnow(),
        )
        db.add(note)
        db.flush()
        return note


def _hospital_short(req: BloodRequest) -> str:
    name = req.hospital_name or "the hospital"
    return name.split(",")[0]


# ─── Event hooks ─────────────────────────────────────────────────────────


def _patient_render(kind: str, patient: Patient, request: BloodRequest, **kwargs) -> str:
    lang = _patient_lang(patient, request)
    base_kwargs = {
        "blood_group": request.blood_group,
        "hospital": _hospital_short(request),
        "link": _track_link(request.id),
    }
    base_kwargs.update(kwargs)
    return i18n_render(kind, lang, **base_kwargs)


def notify_request_created(db: Session, request: BloodRequest) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render("patient_request_created", patient, request)
    _notify(
        db,
        patient=patient,
        request=request,
        kind="request_created",
        title="Request received",
        body=body,
    )


def notify_donor_assigned(db: Session, request: BloodRequest, donor: Donor) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    phone_part = f" ({donor.phone})" if donor.phone else ""
    body = _patient_render(
        "patient_donor_assigned",
        patient,
        request,
        donor_name=donor.name or "A donor",
        phone_part=phone_part,
    )
    _notify(
        db,
        patient=patient,
        request=request,
        kind="donor_assigned",
        title=f"Donor assigned: {donor.name or donor.id[:8]}",
        body=body,
    )


def notify_donor_confirmed(db: Session, request: BloodRequest, donor: Donor) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render(
        "patient_donor_confirmed",
        patient,
        request,
        donor_name=donor.name or "Your donor",
    )
    _notify(
        db,
        patient=patient,
        request=request,
        kind="donor_confirmed",
        title="Donor re-confirmed",
        body=body,
    )


def notify_location_shared(db: Session, request: BloodRequest, donor: Donor) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render(
        "patient_location_shared",
        patient,
        request,
        donor_name=donor.name or "Your donor",
    )
    _notify(
        db,
        patient=patient,
        request=request,
        kind="location_shared",
        title="Hospital address sent to donor",
        body=body,
    )


def notify_donor_donated(db: Session, request: BloodRequest, donor: Donor) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render(
        "patient_donor_donated",
        patient,
        request,
        donor_name=donor.name or "The donor",
    )
    _notify(
        db,
        patient=patient,
        request=request,
        kind="donor_donated",
        title="Donation complete",
        body=body,
    )


def notify_request_failed(db: Session, request: BloodRequest, reason: Optional[str] = None) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render(
        "patient_request_failed",
        patient,
        request,
        reason=reason or "",
    )
    if reason:
        body = body + f" ({reason})"
    _notify(
        db,
        patient=patient,
        request=request,
        kind="request_failed",
        title="Could not arrange donor in time",
        body=body[:300],
    )


def notify_transfusion_reminder(
    db: Session, request: BloodRequest, days: int
) -> None:
    patient = db.query(Patient).get(request.patient_id) if request.patient_id else None
    if not patient:
        return
    body = _patient_render(
        "patient_transfusion_reminder",
        patient,
        request,
        days=days,
    )
    _notify(
        db,
        patient=patient,
        request=request,
        kind="transfusion_reminder",
        title=f"Next transfusion in {days} day{'s' if days != 1 else ''}",
        body=body,
    )
