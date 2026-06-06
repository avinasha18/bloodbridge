"""Public, unauthenticated endpoints used by:

  - /donate landing page (donors browse open needs)
  - /track/{request_id} (patient view)
  - Patient self-registration form

These endpoints intentionally expose minimal patient PII (first name +
initial only, hospital area) so they are safe to share publicly.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field  # noqa: F401
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import (
    BloodRequest,
    Donor,
    OutreachLog,
    Patient,
    PatientNotification,
    ResponseToken,
)
from app.services.matcher import COMPATIBLE_DONORS
from app.services.patient_notify import notify_request_created
from app.services.reliability_service import refresh_donor_score
from app.services.reservation import record_yes
from app.services.sms_sender import (
    generate_token,
    send_outreach_sms,
    token_expiry_hours,
)
from app.services.step_functions_client import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["public"])


# ─── Schemas ────────────────────────────────────────────────────────────


class OpenNeed(BaseModel):
    request_id: str
    blood_group: str
    units_needed: int
    urgency: str
    hospital_name: Optional[str]
    hospital_city: Optional[str]
    patient_initial: Optional[str]
    patient_age_band: Optional[str] = None  # reserved for future
    required_by: Optional[datetime]
    created_at: datetime
    status: str
    compatible_groups: List[str]


class VolunteerSubmit(BaseModel):
    request_id: str
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=8)
    blood_group: str = Field(..., min_length=1)
    city: Optional[str] = "Hyderabad"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gender: Optional[str] = None
    consent_given: bool = True
    immediately_accept: bool = True


class VolunteerResult(BaseModel):
    status: str  # 'assigned' | 'standby' | 'recorded'
    request_id: str
    donor_id: str
    donor_name: Optional[str]
    standby_rank: Optional[int] = None
    detail: Optional[str] = None


class TrackedDonor(BaseModel):
    name: Optional[str]
    phone: Optional[str]
    blood_group: Optional[str]
    distance_km: Optional[float]
    accepted_at: Optional[datetime]


class TrackNotificationEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    title: str
    body: str
    sent_at: datetime
    delivery_error: Optional[str] = None


class TrackResult(BaseModel):
    request_id: str
    blood_group: str
    urgency: str
    status: str
    status_label: str
    status_detail: Optional[str] = None
    hospital_name: Optional[str]
    hospital_city: Optional[str]
    units_needed: int
    required_by: Optional[datetime]
    created_at: datetime
    reserved_at: Optional[datetime]
    confirmed_at: Optional[datetime]
    fulfilled_at: Optional[datetime]
    failed_at: Optional[datetime]
    failure_reason: Optional[str]
    assigned_donor: Optional[TrackedDonor]
    standby_donors: List[TrackedDonor] = []
    sms_to_patient: List[TrackNotificationEntry] = []
    donors_contacted: int = 0
    donors_accepted: int = 0
    donors_ranked: int = 0


STATUS_LABELS = {
    "pending": "Just received",
    "matching": "Donors identified",
    "outreach_sent": "Donors contacted",
    "reserved": "Donor confirmed",
    "confirmed": "Donor re-confirmed",
    "fulfilled": "Donation completed",
    "failed": "Could not arrange in time",
}


def _hospital_city(req: BloodRequest) -> Optional[str]:
    if not req.hospital_name:
        return None
    parts = [p.strip() for p in req.hospital_name.split(",")]
    return parts[-1] if len(parts) > 1 else None


def _patient_initial(patient: Optional[Patient]) -> Optional[str]:
    if not patient or not patient.name:
        return None
    parts = patient.name.strip().split()
    first = parts[0]
    last_initial = (parts[-1][:1] + ".") if len(parts) > 1 else ""
    return (first + (" " + last_initial if last_initial else "")).strip()


# ─── Landing page: open needs + volunteer ──────────────────────────────


@router.get("/public/open-needs", response_model=List[OpenNeed])
def list_open_needs(
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    urgency: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Active blood needs visible to any prospective donor (no auth)."""
    q = (
        db.query(BloodRequest)
        .filter(
            BloodRequest.status.in_(["pending", "matching", "outreach_sent"])
        )
        .order_by(BloodRequest.urgency.desc(), BloodRequest.created_at.desc())
    )
    if blood_group:
        q = q.filter(BloodRequest.blood_group == blood_group)
    if urgency:
        q = q.filter(BloodRequest.urgency == urgency)

    rows = q.limit(limit * 2).all()
    out: List[OpenNeed] = []
    for r in rows:
        hcity = _hospital_city(r)
        if city and hcity and hcity.lower() != city.lower():
            continue
        patient = db.query(Patient).get(r.patient_id) if r.patient_id else None
        out.append(
            OpenNeed(
                request_id=r.id,
                blood_group=r.blood_group,
                units_needed=r.units_needed,
                urgency=r.urgency,
                hospital_name=r.hospital_name,
                hospital_city=hcity,
                patient_initial=_patient_initial(patient),
                required_by=r.required_by,
                created_at=r.created_at,
                status=r.status,
                compatible_groups=COMPATIBLE_DONORS.get(r.blood_group, [r.blood_group]),
            )
        )
        if len(out) >= limit:
            break
    return out


@router.get("/public/open-needs/{request_id}", response_model=OpenNeed)
def get_open_need(request_id: str, db: Session = Depends(get_db)):
    r = db.query(BloodRequest).get(request_id)
    if not r:
        raise HTTPException(404, detail="Request not found")
    patient = db.query(Patient).get(r.patient_id) if r.patient_id else None
    return OpenNeed(
        request_id=r.id,
        blood_group=r.blood_group,
        units_needed=r.units_needed,
        urgency=r.urgency,
        hospital_name=r.hospital_name,
        hospital_city=_hospital_city(r),
        patient_initial=_patient_initial(patient),
        required_by=r.required_by,
        created_at=r.created_at,
        status=r.status,
        compatible_groups=COMPATIBLE_DONORS.get(r.blood_group, [r.blood_group]),
    )


@router.post("/public/volunteer", response_model=VolunteerResult)
def volunteer_for_request(payload: VolunteerSubmit, db: Session = Depends(get_db)):
    """A donor publicly volunteers for one specific request.

    Steps:
      1. Validate request still open + blood group compatible.
      2. Find-or-create donor by phone (auto-profile-complete).
      3. Log a synthetic outreach (so it appears in the request timeline).
      4. Mark response as 'accept' and route through `record_yes`
         (first YES wins → assigned, otherwise standby).
    """
    req = db.query(BloodRequest).get(payload.request_id)
    if not req:
        raise HTTPException(404, detail="Request not found")
    if req.status in ("fulfilled", "failed"):
        raise HTTPException(409, detail=f"Request is already {req.status}")

    compatible = set(COMPATIBLE_DONORS.get(req.blood_group, [req.blood_group]))
    if payload.blood_group not in compatible:
        raise HTTPException(
            400,
            detail=(
                f"Your blood group ({payload.blood_group}) is not compatible with "
                f"this request ({req.blood_group})."
            ),
        )

    donor = db.query(Donor).filter_by(phone=payload.phone).first()
    if donor:
        # Refresh missing fields the donor just provided
        if not donor.name:
            donor.name = payload.name
        if not donor.blood_group:
            donor.blood_group = payload.blood_group
        if not donor.city and payload.city:
            donor.city = payload.city
        if donor.latitude is None and payload.latitude is not None:
            donor.latitude = payload.latitude
        if donor.longitude is None and payload.longitude is not None:
            donor.longitude = payload.longitude
        donor.consent_given = donor.consent_given or payload.consent_given
        donor.is_active = True
        donor.eligibility_status = donor.eligibility_status or "eligible"
        donor.user_donation_active_status = donor.user_donation_active_status or "Active"
        donor.profile_complete = bool(
            donor.blood_group and donor.latitude is not None and donor.longitude is not None
        ) or donor.profile_complete
    else:
        donor = Donor(
            name=payload.name,
            phone=payload.phone,
            blood_group=payload.blood_group,
            city=payload.city or "Hyderabad",
            latitude=payload.latitude,
            longitude=payload.longitude,
            gender=payload.gender,
            donor_type="Self Volunteer",
            role="Emergency Donor",
            eligibility_status="eligible",
            user_donation_active_status="Active",
            consent_given=payload.consent_given,
            preferred_channel="sms",
            profile_complete=bool(
                payload.blood_group
                and payload.latitude is not None
                and payload.longitude is not None
            ),
        )
        db.add(donor)
        db.flush()
        try:
            refresh_donor_score(donor)
        except Exception:
            logger.exception("refresh_donor_score failed for new volunteer %s", donor.id)

    # Has this donor already been contacted for this request?
    log = (
        db.query(OutreachLog)
        .filter_by(request_id=req.id, donor_id=donor.id)
        .first()
    )
    if not log:
        # Send a confirmation/response SMS so we have a token + log row
        token_str: Optional[str] = None
        message_id: Optional[str] = None
        if donor.phone:
            try:
                sms = send_outreach_sms(
                    phone=donor.phone,
                    blood_group=req.blood_group,
                    hospital_name=req.hospital_name,
                    urgency=req.urgency,
                    units_needed=req.units_needed,
                )
                token_str = sms.token
                message_id = sms.message_id
            except Exception:
                logger.exception("SMS to volunteer failed; continuing without token")

        log = OutreachLog(
            request_id=req.id,
            donor_id=donor.id,
            channel="sms",
            message_id=message_id,
            message_kind="self_volunteer",
            batch_number=0,
        )
        db.add(log)
        db.flush()

        if token_str:
            db.add(
                ResponseToken(
                    token=token_str,
                    request_id=req.id,
                    donor_id=donor.id,
                    outreach_log_id=log.id,
                    expires_at=token_expiry_hours(),
                    purpose="outreach",
                )
            )

    db.commit()

    if not payload.immediately_accept:
        return VolunteerResult(
            status="recorded",
            request_id=req.id,
            donor_id=donor.id,
            donor_name=donor.name,
            detail="Saved. We'll reach out if we need you.",
        )

    # Run through the normal first-YES-wins reservation flow
    result = record_yes(db, log)
    db.commit()
    return VolunteerResult(
        status=result.get("status", "recorded"),
        request_id=req.id,
        donor_id=donor.id,
        donor_name=donor.name,
        standby_rank=result.get("standby_rank"),
        detail=(
            "You are the confirmed donor. Hospital details will be sent to your phone."
            if result.get("status") == "assigned"
            else "Thank you. Someone else has been confirmed; you are on standby."
        ),
    )


# ─── Patient tracking page ─────────────────────────────────────────────


@router.get("/public/track/{request_id}", response_model=TrackResult)
def track_request(request_id: str, db: Session = Depends(get_db)):
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(404, detail="Request not found")

    assigned_log = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "assigned",
        )
        .first()
    )
    assigned_donor = None
    if assigned_log:
        d = db.query(Donor).get(assigned_log.donor_id)
        if d:
            assigned_donor = TrackedDonor(
                name=d.name,
                phone=d.phone,
                blood_group=d.blood_group,
                distance_km=(
                    float(assigned_log.distance_km)
                    if assigned_log.distance_km is not None
                    else None
                ),
                accepted_at=assigned_log.responded_at,
            )

    standby_logs = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "standby",
        )
        .order_by(OutreachLog.standby_rank.asc())
        .limit(5)
        .all()
    )
    standby: List[TrackedDonor] = []
    for s in standby_logs:
        d = db.query(Donor).get(s.donor_id)
        if d:
            standby.append(
                TrackedDonor(
                    name=d.name,
                    phone=None,  # don't expose standby contact unless promoted
                    blood_group=d.blood_group,
                    distance_km=(
                        float(s.distance_km) if s.distance_km is not None else None
                    ),
                    accepted_at=s.responded_at,
                )
            )

    notes = (
        db.query(PatientNotification)
        .filter(PatientNotification.request_id == req.id)
        .order_by(PatientNotification.sent_at.desc())
        .limit(30)
        .all()
    )

    contacted = db.query(OutreachLog).filter_by(request_id=req.id).count()
    accepted = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.response == "accept",
        )
        .count()
    )

    # How many donors are ranked + ready for outreach (lightweight preview)
    ranked_count = 0
    try:
        from app.services.matcher import match_donors

        ranked_count = len(match_donors(db, req, batch_size=10))
    except Exception:
        ranked_count = 0

    status_detail = _status_detail(req.status, ranked_count, contacted, accepted)

    return TrackResult(
        request_id=req.id,
        blood_group=req.blood_group,
        urgency=req.urgency,
        status=req.status,
        status_label=STATUS_LABELS.get(req.status, req.status.title()),
        status_detail=status_detail,
        hospital_name=req.hospital_name,
        hospital_city=_hospital_city(req),
        units_needed=req.units_needed,
        required_by=req.required_by,
        created_at=req.created_at,
        reserved_at=req.reserved_at,
        confirmed_at=req.confirmed_at,
        fulfilled_at=req.fulfilled_at,
        failed_at=req.failed_at,
        failure_reason=req.failure_reason,
        assigned_donor=assigned_donor,
        standby_donors=standby,
        sms_to_patient=[TrackNotificationEntry.model_validate(n) for n in notes],
        donors_contacted=contacted,
        donors_accepted=accepted,
        donors_ranked=ranked_count,
    )


def _status_detail(status: str, ranked: int, contacted: int, accepted: int) -> Optional[str]:
    if status == "pending":
        return "Your request is in the queue. We'll start matching donors in a moment."
    if status == "matching":
        if ranked > 0:
            return (
                f"We identified {ranked} compatible donor"
                f"{'s' if ranked != 1 else ''} nearby. "
                "The coordinator is texting them now."
            )
        return "We're searching for compatible donors near your hospital."
    if status == "outreach_sent":
        return (
            f"{contacted} donor{'s' if contacted != 1 else ''} contacted. "
            "Waiting for the first YES."
        )
    if status == "reserved":
        return "A donor has accepted. We are coordinating with them."
    if status == "confirmed":
        return "Donor re-confirmed for the donation day. You'll get more updates here."
    if status == "fulfilled":
        return "Thank you — the donation is complete."
    if status == "failed":
        return "We could not find a donor in time. Please contact your hospital."
    return None


@router.get("/public/track-by-phone")
def track_by_phone(
    phone: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
):
    """Find a patient's recent requests by phone number (for the tracking page)."""
    patient = db.query(Patient).filter(Patient.phone == phone).first()
    if not patient:
        raise HTTPException(404, detail="No request found for that phone")
    reqs = (
        db.query(BloodRequest)
        .filter(BloodRequest.patient_id == patient.id)
        .order_by(BloodRequest.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "patient_id": patient.id,
        "patient_name": patient.name,
        "requests": [
            {
                "request_id": r.id,
                "blood_group": r.blood_group,
                "status": r.status,
                "status_label": STATUS_LABELS.get(r.status, r.status.title()),
                "created_at": r.created_at,
                "hospital_name": r.hospital_name,
            }
            for r in reqs
        ],
    }


# ─── Patient dashboard (cycle + history) ───────────────────────────────


class PatientHistoryRequest(BaseModel):
    request_id: str
    blood_group: str
    status: str
    status_label: str
    urgency: str
    hospital_name: Optional[str]
    units_needed: int
    created_at: datetime
    reserved_at: Optional[datetime]
    fulfilled_at: Optional[datetime]
    failed_at: Optional[datetime]
    donor_name: Optional[str]
    donor_phone: Optional[str]


class PatientDashboard(BaseModel):
    patient_id: str
    patient_name: Optional[str]
    blood_group: Optional[str]
    contact_name: Optional[str]
    contact_phone: Optional[str]
    relation_to_patient: Optional[str]
    hospital_name: Optional[str]
    hospital_city: Optional[str]
    last_transfusion_date: Optional[datetime] = None
    expected_next_transfusion_date: Optional[datetime] = None
    frequency_in_days: Optional[int] = None
    days_until_next: Optional[int] = None
    cycle_progress_pct: Optional[float] = None
    total_requests: int
    fulfilled_count: int
    active_request: Optional[PatientHistoryRequest] = None
    history: List[PatientHistoryRequest] = []
    suggested_action: Optional[str] = None


def _serialize_patient_request(db: Session, r: BloodRequest) -> PatientHistoryRequest:
    donor_name = None
    donor_phone = None
    if r.assigned_donor_id:
        d = db.query(Donor).get(r.assigned_donor_id)
        if d:
            donor_name = d.name
            donor_phone = d.phone
    return PatientHistoryRequest(
        request_id=r.id,
        blood_group=r.blood_group,
        status=r.status,
        status_label=STATUS_LABELS.get(r.status, r.status.title()),
        urgency=r.urgency,
        hospital_name=r.hospital_name,
        units_needed=r.units_needed,
        created_at=r.created_at,
        reserved_at=r.reserved_at,
        fulfilled_at=r.fulfilled_at,
        failed_at=r.failed_at,
        donor_name=donor_name,
        donor_phone=donor_phone,
    )


@router.get("/public/patient/by-phone", response_model=PatientDashboard)
def patient_dashboard_by_phone(
    phone: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(Patient.phone == phone).first()
    if not patient:
        raise HTTPException(404, detail="No patient registered with that phone")
    return _build_patient_dashboard(db, patient)


@router.get("/public/patient/{patient_id}", response_model=PatientDashboard)
def patient_dashboard_by_id(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).get(patient_id)
    if not patient:
        raise HTTPException(404, detail="Patient not found")
    return _build_patient_dashboard(db, patient)


def _build_patient_dashboard(db: Session, patient: Patient) -> PatientDashboard:
    from datetime import date, datetime as _dt

    reqs = (
        db.query(BloodRequest)
        .filter(BloodRequest.patient_id == patient.id)
        .order_by(BloodRequest.created_at.desc())
        .all()
    )
    history = [_serialize_patient_request(db, r) for r in reqs]

    active = None
    for h in history:
        if h.status in ("pending", "matching", "outreach_sent", "reserved", "confirmed"):
            active = h
            break

    fulfilled = sum(1 for h in history if h.status == "fulfilled")
    total = len(history)

    days_until = None
    cycle_pct = None
    if patient.expected_next_transfusion_date:
        today = date.today()
        delta = (patient.expected_next_transfusion_date - today).days
        days_until = delta
        if patient.frequency_in_days and patient.frequency_in_days > 0:
            elapsed = patient.frequency_in_days - max(delta, 0)
            cycle_pct = max(0.0, min(100.0, 100.0 * elapsed / patient.frequency_in_days))

    suggested = None
    if active:
        suggested = f"Your active request is at status: {active.status_label}."
    elif days_until is not None and days_until <= 3 and days_until >= 0:
        suggested = (
            f"Your next transfusion is in {days_until} day(s). "
            "We can start arranging donors now."
        )
    elif days_until is not None and days_until < 0:
        suggested = "Your scheduled transfusion date has passed. Please update it."
    elif total == 0:
        suggested = "Register your first blood need when you're ready."

    return PatientDashboard(
        patient_id=patient.id,
        patient_name=patient.name,
        blood_group=patient.blood_group,
        contact_name=patient.contact_name,
        contact_phone=patient.phone,
        relation_to_patient=patient.relation_to_patient,
        hospital_name=patient.hospital_name,
        hospital_city=patient.city,
        last_transfusion_date=(
            _dt.combine(patient.last_transfusion_date, _dt.min.time())
            if patient.last_transfusion_date else None
        ),
        expected_next_transfusion_date=(
            _dt.combine(patient.expected_next_transfusion_date, _dt.min.time())
            if patient.expected_next_transfusion_date else None
        ),
        frequency_in_days=patient.frequency_in_days,
        days_until_next=days_until,
        cycle_progress_pct=round(cycle_pct, 1) if cycle_pct is not None else None,
        total_requests=total,
        fulfilled_count=fulfilled,
        active_request=active,
        history=history[:30],
        suggested_action=suggested,
    )


# ─── Donor self-service dashboard ──────────────────────────────────────


class DonorDonationEntry(BaseModel):
    request_id: str
    blood_group: str
    hospital_name: Optional[str]
    donated_at: Optional[datetime]
    reserved_at: Optional[datetime]
    assignment_role: Optional[str]
    patient_initial: Optional[str]
    status: str


class DonorDashboard(BaseModel):
    donor_id: str
    name: Optional[str]
    blood_group: Optional[str]
    city: Optional[str]
    phone: Optional[str]
    reliability_score: float
    showup_rate: float
    overall_score: float
    donations_till_date: int
    total_accepts: int
    total_shows: int
    total_no_shows: int
    last_donation_date: Optional[datetime]
    next_eligible_date: Optional[datetime]
    days_until_eligible: Optional[int]
    eligible_now: bool
    eligibility_status: Optional[str]
    donation_history: List[DonorDonationEntry] = []
    open_compatible_needs: List[OpenNeed] = []
    badge: Optional[str] = None  # 'Bronze' | 'Silver' | 'Gold' | 'Platinum'


def _donor_badge(count: int) -> Optional[str]:
    if count >= 25:
        return "Platinum"
    if count >= 15:
        return "Gold"
    if count >= 5:
        return "Silver"
    if count >= 1:
        return "Bronze"
    return None


@router.get("/public/donor/by-phone", response_model=DonorDashboard)
def donor_dashboard_by_phone(
    phone: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
):
    donor = db.query(Donor).filter(Donor.phone == phone).first()
    if not donor:
        raise HTTPException(404, detail="No donor registered with that phone")
    return _build_donor_dashboard(db, donor)


@router.get("/public/donor/{donor_id}", response_model=DonorDashboard)
def donor_dashboard_by_id(donor_id: str, db: Session = Depends(get_db)):
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(404, detail="Donor not found")
    return _build_donor_dashboard(db, donor)


def _build_donor_dashboard(db: Session, donor: Donor) -> DonorDashboard:
    from datetime import date, datetime as _dt

    logs = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.donor_id == donor.id,
            OutreachLog.assignment_role.in_(["assigned", "donated", "released", "no_show"]),
        )
        .order_by(OutreachLog.sent_at.desc())
        .limit(50)
        .all()
    )
    history: List[DonorDonationEntry] = []
    for log in logs:
        req = db.query(BloodRequest).get(log.request_id)
        if not req:
            continue
        patient = db.query(Patient).get(req.patient_id) if req.patient_id else None
        initial = None
        if patient and patient.name:
            parts = patient.name.strip().split()
            initial = parts[0] + ((" " + parts[-1][:1] + ".") if len(parts) > 1 else "")
        history.append(
            DonorDonationEntry(
                request_id=req.id,
                blood_group=req.blood_group,
                hospital_name=req.hospital_name,
                donated_at=req.fulfilled_at,
                reserved_at=req.reserved_at,
                assignment_role=log.assignment_role,
                patient_initial=initial,
                status=req.status,
            )
        )

    # Open compatible needs for this donor (reuse the landing logic)
    compat_groups = []
    for need_bg, accepted_bgs in COMPATIBLE_DONORS.items():
        if donor.blood_group in accepted_bgs:
            compat_groups.append(need_bg)
    open_needs: List[OpenNeed] = []
    if compat_groups:
        rows = (
            db.query(BloodRequest)
            .filter(
                BloodRequest.status.in_(["pending", "matching", "outreach_sent"]),
                BloodRequest.blood_group.in_(compat_groups),
            )
            .order_by(BloodRequest.urgency.desc(), BloodRequest.created_at.desc())
            .limit(10)
            .all()
        )
        for r in rows:
            patient = db.query(Patient).get(r.patient_id) if r.patient_id else None
            open_needs.append(
                OpenNeed(
                    request_id=r.id,
                    blood_group=r.blood_group,
                    units_needed=r.units_needed,
                    urgency=r.urgency,
                    hospital_name=r.hospital_name,
                    hospital_city=_hospital_city(r),
                    patient_initial=_patient_initial(patient),
                    required_by=r.required_by,
                    created_at=r.created_at,
                    status=r.status,
                    compatible_groups=COMPATIBLE_DONORS.get(r.blood_group, [r.blood_group]),
                )
            )

    today = date.today()
    days_until_eligible = None
    eligible_now = donor.eligibility_status == "eligible"
    if donor.next_eligible_date:
        diff = (donor.next_eligible_date - today).days
        days_until_eligible = diff
        eligible_now = diff <= 0 and eligible_now

    badge = _donor_badge(donor.donations_till_date or 0)

    return DonorDashboard(
        donor_id=donor.id,
        name=donor.name,
        blood_group=donor.blood_group,
        city=donor.city,
        phone=donor.phone,
        reliability_score=float(donor.reliability_score or 0),
        showup_rate=float(donor.showup_rate or 0),
        overall_score=float(donor.overall_score or 0),
        donations_till_date=int(donor.donations_till_date or 0),
        total_accepts=int(donor.total_accepts or 0),
        total_shows=int(donor.total_shows or 0),
        total_no_shows=int(donor.total_no_shows or 0),
        last_donation_date=(
            _dt.combine(donor.last_donation_date, _dt.min.time())
            if donor.last_donation_date else None
        ),
        next_eligible_date=(
            _dt.combine(donor.next_eligible_date, _dt.min.time())
            if donor.next_eligible_date else None
        ),
        days_until_eligible=days_until_eligible,
        eligible_now=eligible_now,
        eligibility_status=donor.eligibility_status,
        donation_history=history,
        open_compatible_needs=open_needs,
        badge=badge,
    )


# ─── AI assistant (public, lightweight) ────────────────────────────────


class PublicAIQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=400)
    context: Optional[str] = None  # 'patient' | 'donor'
    request_id: Optional[str] = None
    donor_id: Optional[str] = None


class PublicAIAnswer(BaseModel):
    answer: str
    suggestions: List[str] = []


_DONOR_FAQ_PROMPTS = [
    "How often can I donate?",
    "What are the eligibility rules?",
    "How do I prepare before donating?",
    "What happens after I donate?",
]
_PATIENT_FAQ_PROMPTS = [
    "How does the matching work?",
    "When will I hear from a donor?",
    "What if no donor accepts?",
    "How do I update my hospital?",
]


@router.post("/public/ai/ask", response_model=PublicAIAnswer)
def public_ai_ask(payload: PublicAIQuery, db: Session = Depends(get_db)):
    """Lightweight Q&A for the public portals. Falls back to canned answers
    if Bedrock isn't available."""
    from app.services.bedrock_client import get_bedrock_client

    context_block = ""
    if payload.context == "patient" and payload.request_id:
        r = db.query(BloodRequest).get(payload.request_id)
        if r:
            context_block = (
                f"Patient context: blood request for {r.blood_group}, status={r.status}, "
                f"hospital={r.hospital_name}, urgency={r.urgency}, "
                f"created {r.created_at}."
            )
    elif payload.context == "donor" and payload.donor_id:
        d = db.query(Donor).get(payload.donor_id)
        if d:
            context_block = (
                f"Donor context: {d.blood_group}, {d.donations_till_date} past donations, "
                f"eligible={d.eligibility_status}, last donation={d.last_donation_date}."
            )

    suggestions = (
        _PATIENT_FAQ_PROMPTS if payload.context == "patient" else _DONOR_FAQ_PROMPTS
    )

    try:
        bedrock = get_bedrock_client()
        prompt = (
            "You are Blood Warriors' assistant for patients and voluntary blood donors "
            "in India. Answer briefly (2-4 short sentences). Be warm and clear.\n"
            f"{context_block}\n\nUser question: {payload.query}"
        )
        answer = bedrock._invoke_claude(prompt, max_tokens=300) or _fallback_answer(payload)
    except Exception:
        logger.exception("public AI ask failed; returning fallback")
        answer = _fallback_answer(payload)

    return PublicAIAnswer(answer=answer.strip(), suggestions=suggestions)


def _fallback_answer(payload: PublicAIQuery) -> str:
    q = (payload.query or "").lower()
    if "donate" in q and ("often" in q or "frequency" in q):
        return (
            "Most healthy adults can donate whole blood every 3 months. "
            "We'll only contact you when you're eligible again."
        )
    if "eligible" in q or "requirement" in q:
        return (
            "You need to be 18-65, weigh at least 50 kg, well-rested, and "
            "not have donated in the last 3 months."
        )
    if "prepare" in q or "before" in q:
        return (
            "Have a light meal 2 hours before, drink plenty of water, and "
            "carry a photo ID."
        )
    if "match" in q or "find donor" in q:
        return (
            "We rank donors by reliability, show-up rate, distance, and freshness, "
            "then text the top matches first."
        )
    if "no donor" in q or "what if" in q:
        return (
            "If no one accepts, the system widens the search radius and "
            "contacts more donors automatically."
        )
    return (
        "We're here to help. Try rephrasing or ask about eligibility, the "
        "matching process, or how SMS notifications work."
    )


# ─── Patient self-registration ─────────────────────────────────────────


class PatientRegisterSubmit(BaseModel):
    patient_name: str = Field(..., min_length=1)
    blood_group: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=8)
    contact_name: Optional[str] = None
    relation_to_patient: Optional[str] = "self"  # self | parent | spouse | friend | other
    units_needed: int = Field(1, ge=1, le=10)
    urgency: str = Field("urgent", pattern="^(critical|urgent|routine)$")
    hospital_name: str = Field(..., min_length=1)
    hospital_lat: Optional[float] = None
    hospital_lon: Optional[float] = None
    city: Optional[str] = "Hyderabad"
    required_by: Optional[datetime] = None
    notes: Optional[str] = None


class PatientRegisterResult(BaseModel):
    patient_id: str
    request_id: str
    track_url: str


@router.post("/public/patient-register", response_model=PatientRegisterResult)
def patient_self_register(
    payload: PatientRegisterSubmit, db: Session = Depends(get_db)
):
    """Patient (or attendant) submits a new request via the public form."""
    # Find or create a patient row keyed on phone
    patient = (
        db.query(Patient)
        .filter(Patient.phone == payload.phone)
        .first()
    )
    if not patient:
        patient = Patient(
            name=payload.patient_name,
            blood_group=payload.blood_group,
            phone=payload.phone,
            contact_name=payload.contact_name or payload.patient_name,
            relation_to_patient=payload.relation_to_patient,
            hospital_name=payload.hospital_name,
            hospital_lat=payload.hospital_lat,
            hospital_lon=payload.hospital_lon,
            city=payload.city,
            notifications_enabled=True,
            self_registered=True,
        )
        db.add(patient)
        db.flush()
    else:
        # Update info the patient just submitted
        patient.name = patient.name or payload.patient_name
        patient.blood_group = payload.blood_group
        patient.contact_name = payload.contact_name or patient.contact_name
        patient.relation_to_patient = (
            payload.relation_to_patient or patient.relation_to_patient
        )
        patient.hospital_name = payload.hospital_name
        patient.hospital_lat = payload.hospital_lat or patient.hospital_lat
        patient.hospital_lon = payload.hospital_lon or patient.hospital_lon
        patient.city = payload.city or patient.city
        patient.notifications_enabled = True
        patient.self_registered = True
        db.flush()

    req = BloodRequest(
        patient_id=patient.id,
        blood_group=payload.blood_group,
        units_needed=payload.units_needed,
        urgency=payload.urgency,
        required_by=payload.required_by,
        hospital_name=payload.hospital_name,
        hospital_lat=payload.hospital_lat,
        hospital_lon=payload.hospital_lon,
        notes=payload.notes,
        is_proactive=False,
        created_by="patient",
        status="pending",
    )
    db.add(req)
    db.flush()

    # Patient SMS: "Your request is being processed"
    try:
        notify_request_created(db, req)
    except Exception:
        logger.exception("patient_register: notify_request_created failed")

    db.commit()
    db.refresh(req)

    # Kick off the orchestrator
    get_orchestrator().start_request_workflow(req.id)

    # Build a public tracking URL
    from app.config import settings as app_settings

    base = app_settings.response_base_url.split("/respond")[0]
    track_url = f"{base}/track/{req.id}"

    return PatientRegisterResult(
        patient_id=patient.id,
        request_id=req.id,
        track_url=track_url,
    )
