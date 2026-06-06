"""bin-response-handler

Called by API Gateway when a donor clicks YES/NO in an SES email.
Validates the response token (DynamoDB in prod / RDB locally), records
the response, and resumes the Step Functions execution via
`send_task_success`.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import BloodRequest, Donor, OutreachLog, ResponseToken
from app.db.session import SessionLocal
from app.services.ses_sender import get_ses_client

logger = logging.getLogger(__name__)


def run(db: Session, token: str, action: str) -> Dict:
    if action not in ("accept", "decline"):
        return {"status": "error", "reason": "invalid_action"}

    record = db.query(ResponseToken).filter_by(token=token).first()
    if not record:
        return {"status": "error", "reason": "token_not_found"}
    if record.consumed:
        return {"status": "already_consumed", "action": record.consumed_action}
    if record.expires_at < datetime.utcnow():
        return {"status": "expired"}

    log = db.query(OutreachLog).get(record.outreach_log_id)
    if log:
        log.response = action
        log.responded_at = datetime.utcnow()

    record.consumed = True
    record.consumed_action = action

    if action == "accept":
        donor = db.query(Donor).get(record.donor_id)
        req = db.query(BloodRequest).get(record.request_id)
        if donor and donor.email and req:
            get_ses_client().send_confirmation(
                to_email=donor.email,
                to_name=donor.name,
                blood_group=req.blood_group,
                hospital_name=req.hospital_name or "the hospital",
            )

    db.commit()

    # Resume Step Functions (no-op in mock mode)
    if record.sf_task_token and not settings.use_aws_mocks:
        try:
            import json

            from app.services.aws_boto import make_boto3_client

            sfn = make_boto3_client(
                "stepfunctions",
                settings.aws_region,
                access_key_id=settings.aws_access_key_id or None,
                secret_access_key=settings.aws_secret_access_key or None,
                session_token=settings.aws_session_token or None,
            )
            sfn.send_task_success(
                taskToken=record.sf_task_token,
                output=json.dumps(
                    {"action": action, "donor_id": record.donor_id, "request_id": record.request_id}
                ),
            )
        except Exception as exc:
            logger.warning("Failed to send_task_success: %s", exc)

    return {"status": "ok", "action": action, "request_id": record.request_id}


def handler(event, context):  # noqa: ARG001
    """API Gateway HTTP handler."""
    db = SessionLocal()
    try:
        params = event.get("queryStringParameters") or {}
        token = params.get("token", "")
        action = params.get("action", "")
        result = run(db, token, action)
        title = "Thank you!" if action == "accept" else "Noted, thank you."
        msg = (
            "Our team will reach out shortly with donation details."
            if action == "accept"
            else "We'll contact the next available donor."
        )
        status_code = 200 if result.get("status") == "ok" else 410
        body = f"<html><body style='text-align:center;padding:48px;font-family:sans-serif;'><h2>{title}</h2><p>{msg}</p></body></html>"
        return {
            "statusCode": status_code,
            "headers": {"Content-Type": "text/html"},
            "body": body,
        }
    finally:
        db.close()
