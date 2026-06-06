"""bin-confirmation-sender

Sends a confirmation email to the donor + a notification to the patient
coordinator after a YES response.
"""

from __future__ import annotations

import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, Patient
from app.db.session import SessionLocal
from app.services.ses_sender import get_ses_client

logger = logging.getLogger(__name__)


def run(db: Session, request_id: str, donor_id: str) -> Dict:
    req = db.query(BloodRequest).get(request_id)
    donor = db.query(Donor).get(donor_id)
    if not req or not donor:
        return {"status": "error", "reason": "not_found"}

    ses = get_ses_client()
    donor_msg_id = None
    if donor.email:
        donor_msg_id = ses.send_confirmation(
            to_email=donor.email,
            to_name=donor.name,
            blood_group=req.blood_group,
            hospital_name=req.hospital_name or "the hospital",
        )

    coordinator_msg_id = None
    if req.patient_id:
        patient = db.query(Patient).get(req.patient_id)
        if patient and patient.coordinator_email:
            coordinator_msg_id = ses._send(
                patient.coordinator_email,
                f"Donor confirmed: {donor.name or donor.email} for {req.blood_group}",
                f"<p>{donor.name or donor.email} ({donor.phone or 'no phone'}) confirmed donation for "
                f"{req.blood_group} at {req.hospital_name}.</p>",
                f"{donor.name or donor.email} confirmed donation for {req.blood_group} at {req.hospital_name}.",
            )

    return {
        "donor_message_id": donor_msg_id,
        "coordinator_message_id": coordinator_msg_id,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(db, event["request_id"], event["donor_id"])
    finally:
        db.close()
