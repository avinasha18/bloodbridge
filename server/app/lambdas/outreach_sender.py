"""bin-outreach-sender

Renders the personalized email, persists a one-click response token,
sends via SES, and records an `outreach_logs` row.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, OutreachLog, ResponseToken
from app.db.session import SessionLocal
from app.services.bedrock_client import get_bedrock_client
from app.services.ses_sender import get_ses_client, token_expiry_hours

logger = logging.getLogger(__name__)


def run(
    db: Session,
    request_id: str,
    donor_ids: List[str],
    batch_number: int = 1,
    sf_task_token: Optional[str] = None,
) -> Dict:
    req = db.query(BloodRequest).get(request_id)
    if not req:
        return {"sent": 0, "failed": 0, "logs": []}

    ses = get_ses_client()
    bedrock = get_bedrock_client()

    sent = []
    failed = []
    for did in donor_ids:
        donor = db.query(Donor).get(did)
        if not donor or not donor.email:
            failed.append(did)
            continue

        ai_msg = bedrock.personalize_outreach(
            donor_name=donor.name or "friend",
            donor_donations=donor.donations_till_date,
            donor_type=donor.donor_type,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name or "the hospital",
            urgency=req.urgency,
        )
        email = ses.send_outreach(
            to_email=donor.email,
            to_name=donor.name,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name,
            urgency=req.urgency,
            units_needed=req.units_needed,
            required_by=req.required_by,
            donations_till_date=donor.donations_till_date,
            ai_message=ai_msg,
        )

        log = OutreachLog(
            request_id=req.id,
            donor_id=donor.id,
            channel="email",
            message_id=email.message_id,
            batch_number=batch_number,
        )
        db.add(log)
        db.flush()
        db.add(
            ResponseToken(
                token=email.token,
                request_id=req.id,
                donor_id=donor.id,
                outreach_log_id=log.id,
                sf_task_token=sf_task_token,
                expires_at=token_expiry_hours(),
            )
        )
        sent.append({"donor_id": did, "log_id": log.id, "token": email.token})

    db.commit()
    return {
        "sent": len(sent),
        "failed": len(failed),
        "logs": sent,
        "failed_donor_ids": failed,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(
            db,
            request_id=event["request_id"],
            donor_ids=event["donor_ids"],
            batch_number=event.get("batch_number", 1),
            sf_task_token=event.get("sf_task_token"),
        )
    finally:
        db.close()
