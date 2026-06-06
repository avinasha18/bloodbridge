"""After a request closes, refresh the donor's ML reliability score.

`showup_rate` is updated separately in reservation.py when coordinators
mark donated / no-show. This job only re-runs the RandomForest on updated
donation history features.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Dict

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor
from app.db.session import SessionLocal
from app.services.reliability_service import refresh_donor_score

logger = logging.getLogger(__name__)


def run(db: Session, request_id: str) -> Dict:
    req = db.query(BloodRequest).get(request_id)
    if not req or not req.assigned_donor_id:
        return {"status": "noop", "reason": "no_assigned_donor"}

    donor = db.query(Donor).get(req.assigned_donor_id)
    if not donor:
        return {"status": "noop", "reason": "donor_missing"}

    if req.status == "fulfilled":
        donor.donations_till_date = (donor.donations_till_date or 0) + 1
        donor.last_donation_date = date.today()
        donor.eligibility_status = "not eligible"
    elif req.status == "failed":
        donor.total_calls = (donor.total_calls or 0) + 1

    new_score = refresh_donor_score(donor)

    db.commit()
    return {
        "donor_id": donor.id,
        "new_score": round(new_score, 4),
        "donations_till_date": donor.donations_till_date,
        "last_donation_date": donor.last_donation_date.isoformat() if donor.last_donation_date else None,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(db, event["request_id"])
    finally:
        db.close()
