"""Reserve / Standby workflow service.

Implements the user-specified flow:

  - First donor to reply YES wins → request.status = 'reserved',
    that donor receives "You are confirmed for this donation",
    OutreachLog.assignment_role = 'assigned', standby_rank = 0.

  - Subsequent YES responses receive "A donor has already been assigned.
    You have been placed on standby.", OutreachLog.assignment_role =
    'standby', standby_rank = 1, 2, ... in arrival order.

  - When the assigned donor later cancels (via the day-before
    re-confirmation SMS or a manual coordinator action), the lowest-rank
    standby is auto-promoted: their assignment_role flips to 'assigned'
    and a fresh outreach token is created so they can re-confirm.

  - If no standby is available, request transitions to 'failed' with a
    hospital-arrangement-needed reason.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.db.models import (
    BloodRequest,
    Donor,
    OutreachLog,
    ResponseToken,
)
from app.services.patient_notify import (
    notify_donor_assigned,
    notify_donor_confirmed,
    notify_donor_donated,
    notify_request_failed,
)
from app.services.reliability_service import refresh_donor_score
from app.services.sms_sender import (
    generate_token,
    send_assigned_confirmation,
    send_pre_confirmation_sms,
    send_standby_notice,
    send_standby_promotion,
    token_expiry_hours,
)
from app.services.sms_timeline import record_followup_sms

logger = logging.getLogger(__name__)


def _assign_primary_donor(
    db: Session,
    req: BloodRequest,
    donor: Donor,
    log: OutreachLog,
    *,
    notify: bool = True,
) -> Dict:
    """Mark donor as assigned and move request to reserved."""
    log.assignment_role = "assigned"
    log.standby_rank = 0
    req.assigned_donor_id = donor.id
    req.status = "reserved"
    req.reserved_at = datetime.utcnow()
    db.flush()

    if notify and donor.phone:
        from app.services.i18n import detect_language

        donor_lang = detect_language(
            latitude=float(donor.latitude) if donor.latitude is not None else None,
            longitude=float(donor.longitude) if donor.longitude is not None else None,
            city=donor.city,
            explicit=donor.language_preference,
        )
        sms = send_assigned_confirmation(
            phone=donor.phone,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name,
            lang=donor_lang,
        )
        record_followup_sms(
            db,
            request_id=req.id,
            donor_id=donor.id,
            message_kind="assigned_confirmation",
            message_id=sms.message_id,
        )
        db.flush()

    if notify:
        try:
            notify_donor_assigned(db, req, donor)
            db.flush()
        except Exception:
            db.rollback()
            logger.exception("notify_donor_assigned failed req=%s", req.id)

    return {
        "status": "assigned",
        "request_id": req.id,
        "donor_id": donor.id,
    }


def record_intentional_volunteer(db: Session, log: OutreachLog) -> Dict:
    """Web 'I'll donate' — assign directly when open (priority over SMS queue).

    Intentional volunteers skip reliability ranking. If another donor is
    already assigned, this donor is placed on standby.
    """
    req = db.query(BloodRequest).get(log.request_id)
    donor = db.query(Donor).get(log.donor_id)
    if not req or not donor:
        return {"status": "error", "reason": "not_found"}

    if req.status in ("fulfilled", "failed"):
        return {"status": "error", "reason": f"request_{req.status}"}

    if log.assignment_role == "assigned" and req.assigned_donor_id == donor.id:
        return {"status": "assigned", "request_id": req.id, "donor_id": donor.id}

    log.response = "accept"
    log.responded_at = datetime.utcnow()
    if not log.message_kind:
        log.message_kind = "self_volunteer"
    donor.total_accepts = (donor.total_accepts or 0) + 1

    existing_assigned = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "assigned",
            OutreachLog.donor_id != donor.id,
        )
        .first()
    )

    if existing_assigned is None:
        return _assign_primary_donor(db, req, donor, log)

    next_rank = _next_standby_rank(db, req.id)
    log.assignment_role = "standby"
    log.standby_rank = next_rank
    db.commit()
    if donor.phone:
        from app.services.i18n import detect_language

        donor_lang = detect_language(
            latitude=float(donor.latitude) if donor.latitude is not None else None,
            longitude=float(donor.longitude) if donor.longitude is not None else None,
            city=donor.city,
            explicit=donor.language_preference,
        )
        sms = send_standby_notice(
            phone=donor.phone,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name,
            lang=donor_lang,
        )
        record_followup_sms(
            db,
            request_id=req.id,
            donor_id=donor.id,
            message_kind="standby_notice",
            message_id=sms.message_id,
        )
        db.commit()
    return {
        "status": "standby",
        "request_id": req.id,
        "donor_id": donor.id,
        "standby_rank": next_rank,
    }


def record_yes(db: Session, log: OutreachLog) -> Dict:
    """Process a YES from `log`. Returns event metadata."""
    req = db.query(BloodRequest).get(log.request_id)
    donor = db.query(Donor).get(log.donor_id)
    if not req or not donor:
        return {"status": "error", "reason": "not_found"}

    log.response = "accept"
    log.responded_at = datetime.utcnow()
    donor.total_accepts = (donor.total_accepts or 0) + 1

    # Has anyone else already been assigned for this request?
    existing_assigned = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "assigned",
        )
        .first()
    )

    if existing_assigned is None:
        result = _assign_primary_donor(db, req, donor, log)
        db.commit()
        return result

    # Standby
    next_rank = _next_standby_rank(db, req.id)
    log.assignment_role = "standby"
    log.standby_rank = next_rank
    db.commit()
    if donor.phone:
        from app.services.i18n import detect_language

        donor_lang = detect_language(
            latitude=float(donor.latitude) if donor.latitude is not None else None,
            longitude=float(donor.longitude) if donor.longitude is not None else None,
            city=donor.city,
            explicit=donor.language_preference,
        )
        sms = send_standby_notice(
            phone=donor.phone,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name,
            lang=donor_lang,
        )
        record_followup_sms(
            db,
            request_id=req.id,
            donor_id=donor.id,
            message_kind="standby_notice",
            message_id=sms.message_id,
        )
        db.commit()
    return {
        "status": "standby",
        "request_id": req.id,
        "donor_id": donor.id,
        "standby_rank": next_rank,
    }


def record_no(db: Session, log: OutreachLog) -> Dict:
    """Record a NO response. If this NO is from the currently-assigned
    donor, immediately promote the next standby.
    """
    req = db.query(BloodRequest).get(log.request_id)
    if not req:
        return {"status": "error", "reason": "request_not_found"}

    log.response = "decline"
    log.responded_at = datetime.utcnow()

    was_assigned = log.assignment_role == "assigned"
    log.assignment_role = "declined"
    db.commit()

    if was_assigned and req.status in ("reserved", "confirmed"):
        promotion = promote_next_standby(db, req.id, reason="assigned_declined")
        return {"status": "assigned_declined", **promotion}

    return {"status": "declined", "request_id": req.id, "donor_id": log.donor_id}


def promote_next_standby(
    db: Session,
    request_id: str,
    reason: str = "manual_promotion",
) -> Dict:
    """Promote the next standby donor, or SMS the next ranked donors if none on standby."""
    req = db.query(BloodRequest).get(request_id)
    if not req:
        return {"status": "error", "reason": "request_not_found"}

    # Release any currently-assigned donor so a backup can take over.
    for prior in (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "assigned",
        )
        .all()
    ):
        prior.assignment_role = "released"

    req.assigned_donor_id = None
    req.confirmed_at = None
    req.pre_confirm_sent_at = None
    req.pre_confirm_response = None
    db.flush()

    standby = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "standby",
            OutreachLog.response == "accept",
        )
        .order_by(OutreachLog.standby_rank.asc())
        .first()
    )

    if standby:
        donor = db.query(Donor).get(standby.donor_id)
        if donor and donor.phone:
            standby.assignment_role = "assigned"
            standby.standby_rank = 0
            req.assigned_donor_id = donor.id
            req.status = "reserved"
            req.reserved_at = datetime.utcnow()
            db.flush()

            try:
                sms = send_standby_promotion(
                    phone=donor.phone,
                    blood_group=req.blood_group,
                    hospital_name=req.hospital_name,
                )
                promo_log = record_followup_sms(
                    db,
                    request_id=req.id,
                    donor_id=donor.id,
                    message_kind="standby_promotion",
                    message_id=sms.message_id,
                )
                if sms.token:
                    db.add(
                        ResponseToken(
                            token=sms.token,
                            request_id=req.id,
                            donor_id=donor.id,
                            outreach_log_id=promo_log.id,
                            expires_at=token_expiry_hours(12),
                            purpose="outreach",
                        )
                    )
                db.commit()
                return {
                    "status": "promoted",
                    "request_id": req.id,
                    "donor_id": donor.id,
                    "donor_name": donor.name,
                    "phone": donor.phone,
                    "message_id": sms.message_id,
                }
            except Exception as exc:
                logger.exception(
                    "Standby promotion SMS failed for donor %s", donor.id
                )
                db.commit()
                return {
                    "status": "error",
                    "reason": "sms_failed",
                    "detail": str(exc),
                    "donor_id": donor.id,
                }

    db.commit()

    # No standby (or standby had no phone) — text the next best donors not yet contacted.
    from app.services.outreach_delivery import admin_resend_outreach

    outreach = admin_resend_outreach(db, request_id)
    if outreach.get("sent_count", 0) > 0:
        return {
            "status": "next_donors_contacted",
            "request_id": req.id,
            "sent_count": outreach["sent_count"],
            "sent": outreach.get("sent", []),
            "reason": reason,
        }

    req.status = "failed"
    req.failed_at = datetime.utcnow()
    req.failure_reason = (
        f"No backup donor available ({reason}). "
        "All nearby eligible donors were already texted."
    )
    db.commit()
    try:
        notify_request_failed(db, req, reason=reason)
        db.commit()
    except Exception:
        db.rollback()
    return {
        "status": "failed_no_standby",
        "request_id": req.id,
        "reason": req.failure_reason,
    }


def send_pre_confirmation(db: Session, request_id: str) -> Dict:
    """Day-before re-confirmation. Sends an SMS to the assigned donor
    asking them to re-confirm. Caller (cron job or coordinator) decides
    the timing.
    """
    req = db.query(BloodRequest).get(request_id)
    if not req or req.status != "reserved":
        return {"status": "error", "reason": "request_not_reserved"}

    assigned_log = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.request_id == req.id,
            OutreachLog.assignment_role == "assigned",
        )
        .first()
    )
    if not assigned_log:
        return {"status": "error", "reason": "no_assigned_donor"}

    donor = db.query(Donor).get(assigned_log.donor_id)
    if not donor or not donor.phone:
        return {"status": "error", "reason": "donor_no_phone"}

    sms = send_pre_confirmation_sms(
        phone=donor.phone,
        blood_group=req.blood_group,
        hospital_name=req.hospital_name,
    )
    pre_log = record_followup_sms(
        db,
        request_id=req.id,
        donor_id=donor.id,
        message_kind="pre_confirmation",
        message_id=sms.message_id,
    )
    assigned_log.confirmation_sent_at = datetime.utcnow()
    req.pre_confirm_sent_at = datetime.utcnow()
    db.add(
        ResponseToken(
            token=sms.token,
            request_id=req.id,
            donor_id=donor.id,
            outreach_log_id=pre_log.id,
            expires_at=token_expiry_hours(36),
            purpose="confirmation",
        )
    )
    db.commit()
    return {"status": "sent", "donor_id": donor.id, "token": sms.token}


def record_pre_confirmation_response(
    db: Session, log: OutreachLog, action: str
) -> Dict:
    """Handle the day-before re-confirmation YES/NO."""
    req = db.query(BloodRequest).get(log.request_id)
    if not req:
        return {"status": "error", "reason": "request_not_found"}

    log.confirmation_response = "confirmed" if action == "accept" else "cancelled"
    log.confirmation_response_at = datetime.utcnow()
    req.pre_confirm_response = log.confirmation_response

    if action == "accept":
        req.status = "confirmed"
        req.confirmed_at = datetime.utcnow()
        db.commit()
        donor = db.query(Donor).get(log.donor_id)
        if donor:
            try:
                notify_donor_confirmed(db, req, donor)
                db.commit()
            except Exception:
                db.rollback()
        return {"status": "confirmed", "request_id": req.id}

    # NO from assigned donor → promote next standby
    db.commit()
    promotion = promote_next_standby(db, req.id, reason="pre_confirm_cancelled")
    return {"status": "cancelled", **promotion}


def coordinator_marks_no_show(db: Session, request_id: str) -> Dict:
    """Called when the assigned donor didn't show up at the hospital."""
    req = db.query(BloodRequest).get(request_id)
    if not req or not req.assigned_donor_id:
        return {"status": "error", "reason": "no_assigned_donor"}
    donor = db.query(Donor).get(req.assigned_donor_id)
    if donor:
        donor.total_no_shows = (donor.total_no_shows or 0) + 1
        if donor.total_accepts > 0:
            donor.showup_rate = round(
                (donor.total_accepts - donor.total_no_shows) / donor.total_accepts, 4
            )
        refresh_donor_score(donor)
    log = (
        db.query(OutreachLog)
        .filter_by(request_id=req.id, donor_id=req.assigned_donor_id)
        .first()
    )
    if log:
        log.assignment_role = "no_show"
    db.commit()
    return promote_next_standby(db, req.id, reason="no_show")


def coordinator_marks_donated(db: Session, request_id: str) -> Dict:
    """Called when the donor actually donated. Closes the request."""
    req = db.query(BloodRequest).get(request_id)
    if not req or not req.assigned_donor_id:
        return {"status": "error", "reason": "no_assigned_donor"}
    donor = db.query(Donor).get(req.assigned_donor_id)
    if donor:
        donor.total_shows = (donor.total_shows or 0) + 1
        donor.donations_till_date = (donor.donations_till_date or 0) + 1
        donor.last_donation_date = datetime.utcnow().date()
        if donor.total_accepts > 0:
            donor.showup_rate = round(
                (donor.total_shows) / donor.total_accepts, 4
            )
        refresh_donor_score(donor)
    log = (
        db.query(OutreachLog)
        .filter_by(request_id=req.id, donor_id=req.assigned_donor_id)
        .first()
    )
    if log:
        log.assignment_role = "donated"
    req.status = "fulfilled"
    req.fulfilled_at = datetime.utcnow()
    db.commit()
    if donor:
        try:
            notify_donor_donated(db, req, donor)
            db.commit()
        except Exception:
            db.rollback()
    return {"status": "fulfilled", "request_id": req.id, "donor_id": req.assigned_donor_id}


def _next_standby_rank(db: Session, request_id: str) -> int:
    from sqlalchemy import func

    max_rank = (
        db.query(func.max(OutreachLog.standby_rank))
        .filter(
            OutreachLog.request_id == request_id,
            OutreachLog.assignment_role == "standby",
        )
        .scalar()
    )
    return (max_rank or 0) + 1
