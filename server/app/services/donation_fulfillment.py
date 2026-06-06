"""Auto-match confirmed donors and send hospital location on WhatsApp immediately.

When a donor replies YES (blood outreach or engagement), we:
  1. Assign them to the nearest open compatible request (if not already assigned)
  2. Send hospital name, suggested visit time, and Google Maps link on WhatsApp
  3. Log the location message and notify the patient
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, time
from typing import Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, OutreachLog
from app.services.geo import haversine_km
from app.services.matcher import COMPATIBLE_DONORS
from app.services.patient_notify import notify_location_shared
from app.services.sms_sender import render_location_sms
from app.services.sms_timeline import record_followup_sms
from app.services.twilio_whatsapp import send_whatsapp

logger = logging.getLogger(__name__)

OPEN_STATUSES = ("pending", "matching", "outreach_sent")


def _compatible_need_groups(donor_blood: str) -> list[str]:
    groups: list[str] = []
    for need, donors in COMPATIBLE_DONORS.items():
        if donor_blood in donors:
            groups.append(need)
    return groups


def find_nearest_open_request(db: Session, donor: Donor) -> Optional[BloodRequest]:
    """Nearest open blood request this donor can satisfy (no assigned donor yet)."""
    if not donor.blood_group:
        return None
    need_groups = _compatible_need_groups(donor.blood_group)
    if not need_groups:
        return None

    rows = (
        db.query(BloodRequest)
        .filter(
            BloodRequest.status.in_(OPEN_STATUSES),
            BloodRequest.blood_group.in_(need_groups),
            BloodRequest.assigned_donor_id.is_(None),
        )
        .order_by(BloodRequest.urgency.desc(), BloodRequest.created_at.desc())
        .all()
    )
    if not rows:
        return None

    d_lat = float(donor.latitude) if donor.latitude is not None else None
    d_lon = float(donor.longitude) if donor.longitude is not None else None

    best: Optional[BloodRequest] = None
    best_score = float("inf")
    urgency_bonus = {"critical": -30.0, "urgent": -15.0, "routine": 0.0}

    for req in rows:
        if (
            d_lat is not None
            and d_lon is not None
            and req.hospital_lat is not None
            and req.hospital_lon is not None
        ):
            dist = haversine_km(
                d_lat, d_lon, float(req.hospital_lat), float(req.hospital_lon)
            )
        else:
            dist = 25.0
        score = dist + urgency_bonus.get(req.urgency or "routine", 0.0)
        if score < best_score:
            best_score = score
            best = req
    return best


def suggested_visit_datetime(req: BloodRequest) -> Tuple[datetime, str]:
    """Pick visit slot: use required_by if soon enough, else tomorrow 10:00."""
    now = datetime.utcnow()
    if req.required_by:
        visit = req.required_by
        if getattr(visit, "tzinfo", None):
            visit = visit.replace(tzinfo=None)
        if visit < now + timedelta(hours=3):
            visit = datetime.combine(date.today() + timedelta(days=1), time(10, 0))
    else:
        visit = datetime.combine(date.today() + timedelta(days=1), time(10, 0))
    when_str = visit.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")
    return visit, when_str


def _build_location_body(
    hospital_name: str,
    lat: float,
    lon: float,
    when: str,
    *,
    blood_group: Optional[str] = None,
) -> str:
    core = render_location_sms(hospital_name, lat, lon, when)
    headline = "✅ You're confirmed to donate!"
    if blood_group:
        headline += f" ({blood_group})"
    return (
        f"{headline}\n\n"
        f"{core}\n\n"
        "Please reach 15 min early with a valid photo ID. "
        "Reply CANCEL if you can't make it."
    )


def send_location_whatsapp(
    *,
    phone: str,
    hospital_name: str,
    hospital_lat: float,
    hospital_lon: float,
    when: str,
    blood_group: Optional[str] = None,
) -> Dict:
    body = _build_location_body(
        hospital_name, hospital_lat, hospital_lon, when, blood_group=blood_group
    )
    result = send_whatsapp(phone, body, kind="donation_location")
    return {
        "message_id": result.message_id,
        "body": body,
        "delivery_phone": result.to_phone,
        "redirected": result.redirected,
    }


def _send_location_for_request(
    db: Session,
    donor: Donor,
    req: BloodRequest,
) -> Dict:
    """Send location WhatsApp + audit log. Caller handles commit."""
    if req.hospital_lat is None or req.hospital_lon is None:
        return {"location_sent": False, "reason": "missing_coordinates"}

    visit_dt, when_str = suggested_visit_datetime(req)
    maps_url = (
        f"https://www.google.com/maps/search/?api=1"
        f"&query={req.hospital_lat},{req.hospital_lon}"
    )

    if not donor.phone:
        return {"location_sent": False, "reason": "no_phone"}

    wa = send_location_whatsapp(
        phone=donor.phone,
        hospital_name=req.hospital_name or "Blood donation center",
        hospital_lat=float(req.hospital_lat),
        hospital_lon=float(req.hospital_lon),
        when=when_str,
        blood_group=req.blood_group,
    )
    record_followup_sms(
        db,
        request_id=req.id,
        donor_id=donor.id,
        message_kind="location",
        message_id=wa.get("message_id"),
    )
    req.location_sent_at = datetime.utcnow()
    if not req.required_by or req.required_by < visit_dt:
        req.required_by = visit_dt

    return {
        "location_sent": True,
        "request_id": req.id,
        "hospital_name": req.hospital_name,
        "when": when_str,
        "scheduled_for": visit_dt.isoformat(),
        "maps_url": maps_url,
        "message_id": wa.get("message_id"),
    }


def auto_fulfill_confirmation(
    db: Session,
    donor: Donor,
    *,
    request: Optional[BloodRequest] = None,
    outreach_log: Optional[OutreachLog] = None,
    assignment_status: Optional[str] = None,
    commit: bool = True,
) -> Dict:
    """After WhatsApp YES: assign if needed and send hospital location immediately."""
    from app.services import reservation

    outcome: Dict = {
        "fulfilled": False,
        "location_sent": False,
        "request_id": None,
        "hospital_name": None,
        "when": None,
        "maps_url": None,
        "assignment_status": assignment_status,
        "reason": None,
    }

    if assignment_status == "standby":
        outcome["reason"] = "standby_no_location"
        return outcome

    req = request
    log = outreach_log

    if req is None:
        req = find_nearest_open_request(db, donor)
        if req is None:
            outcome["reason"] = "no_open_request"
            return outcome

        log = OutreachLog(
            request_id=req.id,
            donor_id=donor.id,
            channel="whatsapp",
            message_kind="engagement_confirm",
            sent_at=datetime.utcnow(),
            response="accept",
            responded_at=datetime.utcnow(),
        )
        db.add(log)
        db.flush()

        assign = reservation._assign_primary_donor(
            db, req, donor, log, notify=False
        )
        outcome["assignment_status"] = assign.get("status")
        if assign.get("status") != "assigned":
            outcome["reason"] = "assignment_failed"
            return outcome
    else:
        req = db.query(BloodRequest).get(req.id)
        if not req:
            outcome["reason"] = "request_not_found"
            return outcome
        if req.assigned_donor_id != donor.id:
            outcome["reason"] = "not_assigned"
            return outcome

    if req.location_sent_at:
        visit_dt, when_str = suggested_visit_datetime(req)
        maps_url = (
            f"https://www.google.com/maps/search/?api=1"
            f"&query={req.hospital_lat},{req.hospital_lon}"
        )
        outcome.update(
            {
                "fulfilled": True,
                "location_sent": False,
                "request_id": req.id,
                "hospital_name": req.hospital_name,
                "when": when_str,
                "maps_url": maps_url,
                "reason": "already_sent",
            }
        )
        return outcome

    loc = _send_location_for_request(db, donor, req)
    outcome.update(loc)
    outcome["fulfilled"] = loc.get("location_sent", False)

    if loc.get("location_sent"):
        try:
            notify_location_shared(db, req, donor)
        except Exception:
            logger.exception(
                "notify_location_shared failed req=%s donor=%s", req.id, donor.id
            )
        if commit:
            db.commit()
        else:
            db.flush()

    return outcome


def no_match_reply_text(donor: Donor) -> str:
    bg = donor.blood_group or "your blood type"
    return (
        f"Thank you — we've marked you as ready to donate! "
        f"No urgent {bg} need is open near you right now. "
        "We'll WhatsApp you within hours when someone needs you. "
        "Reply YES anytime when you're available."
    )
