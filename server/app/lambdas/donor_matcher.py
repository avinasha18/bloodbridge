"""bin-donor-matcher

Called by the Step Functions state machine. Given a request_id and
optional override knobs, returns a ranked list of donors with their
reliability scores.
"""

from __future__ import annotations

import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.db.models import BloodRequest
from app.db.session import SessionLocal
from app.services.matcher import match_donors

logger = logging.getLogger(__name__)


def run(db: Session, request_id: str, radius_km: int | None = None, batch_size: int | None = None) -> Dict:
    req = db.query(BloodRequest).get(request_id)
    if not req:
        return {"request_id": request_id, "donor_count": 0, "donors": []}

    matches = match_donors(db, req, radius_km=radius_km, batch_size=batch_size)
    return {
        "request_id": req.id,
        "donor_count": len(matches),
        "donors": [m.model_dump() for m in matches],
        "urgency": req.urgency,
        "blood_group": req.blood_group,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(
            db,
            request_id=event["request_id"],
            radius_km=event.get("radius_km"),
            batch_size=event.get("batch_size"),
        )
    finally:
        db.close()
