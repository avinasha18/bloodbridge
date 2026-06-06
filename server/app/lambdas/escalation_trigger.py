"""bin-escalation-trigger

Called by Step Functions when a wait period elapses without enough
confirmations. Expands the search, logs to `failure_logs`, and (for
critical urgency) parallel-sends SMS via SNS.
"""

from __future__ import annotations

import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.db.models import (
    BloodRequest,
    Donor,
    EscalationEvent,
    FailureLog,
    OutreachLog,
)
from app.db.session import SessionLocal
from app.services.sns_client import get_sns_client

logger = logging.getLogger(__name__)


def run(db: Session, request_id: str, reason: str = "timeout") -> Dict:
    req = db.query(BloodRequest).get(request_id)
    if not req:
        return {"status": "error", "reason": "request_not_found"}

    req.escalation_level += 1
    req.search_radius_km = min(req.search_radius_km + 10, 50)

    donors_tried = db.query(OutreachLog).filter_by(request_id=req.id).count()

    db.add(
        EscalationEvent(
            request_id=req.id,
            escalation_level=req.escalation_level,
            trigger_reason=reason,
            donors_tried=donors_tried,
            expanded_radius_km=req.search_radius_km,
        )
    )

    db.add(
        FailureLog(
            request_id=req.id,
            blood_group=req.blood_group,
            city=_city(req),
            urgency=req.urgency,
            failure_type=reason,
            donors_contacted=donors_tried,
            donors_responded=db.query(OutreachLog)
            .filter(OutreachLog.request_id == req.id, OutreachLog.response.isnot(None))
            .count(),
            donors_accepted=db.query(OutreachLog)
            .filter_by(request_id=req.id, response="accept")
            .count(),
            resolution="escalated",
        )
    )

    if req.urgency == "critical":
        _broadcast_critical_sms(db, req)

    db.commit()
    return {
        "request_id": req.id,
        "new_level": req.escalation_level,
        "new_radius_km": req.search_radius_km,
        "donors_tried": donors_tried,
    }


def _city(req: BloodRequest):
    if not req.hospital_name:
        return None
    parts = [p.strip() for p in req.hospital_name.split(",")]
    return parts[-1] if len(parts) > 1 else None


def _broadcast_critical_sms(db: Session, req: BloodRequest) -> None:
    sns = get_sns_client()
    seen = {
        ol.donor_id
        for ol in db.query(OutreachLog).filter_by(request_id=req.id, channel="sms").all()
    }
    candidates = (
        db.query(OutreachLog)
        .filter_by(request_id=req.id, channel="email")
        .order_by(OutreachLog.sent_at.asc())
        .limit(5)
        .all()
    )
    for ol in candidates:
        if ol.donor_id in seen:
            continue
        donor = db.query(Donor).get(ol.donor_id)
        if not donor or not donor.phone:
            continue
        msg = (
            f"URGENT: {req.blood_group} blood needed at "
            f"{req.hospital_name or 'a hospital'}. Reply YES to donate. -Blood Warriors"
        )
        sms_id = sns.send_sms(donor.phone, msg)
        db.add(
            OutreachLog(
                request_id=req.id,
                donor_id=donor.id,
                channel="sms",
                message_id=sms_id,
                batch_number=ol.batch_number,
            )
        )


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(db, event["request_id"], event.get("reason", "timeout"))
    finally:
        db.close()
