"""bin-proactive-scheduler

Runs daily at 6 AM IST (EventBridge cron). For every patient whose
expected_next_transfusion_date falls inside [today + (days_ahead - 1),
today + days_ahead], creates a `blood_request(is_proactive=TRUE)` if one
isn't already open for that cycle, then kicks off the orchestrator.

This is the blueprint's blue-ocean move: act 5–7 days before the
emergency window, not after.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Dict

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Patient, SystemProtocol
from app.db.session import SessionLocal
from app.services.step_functions_client import get_orchestrator

logger = logging.getLogger(__name__)


def run(db: Session, days_ahead_default: int = 7) -> Dict:
    today = date.today()
    target_date_upper = today + timedelta(days=days_ahead_default)

    # Window: patients whose next transfusion is within the next N days
    patients = (
        db.query(Patient)
        .filter(
            Patient.expected_next_transfusion_date.isnot(None),
            Patient.expected_next_transfusion_date >= today,
            Patient.expected_next_transfusion_date <= target_date_upper,
        )
        .all()
    )

    created = []
    skipped = []
    for p in patients:
        # Use blood-group / city protocol for the proactive window
        protocol = (
            db.query(SystemProtocol)
            .filter(
                SystemProtocol.blood_group == p.blood_group,
                SystemProtocol.city == (p.city or "Default"),
            )
            .first()
        )
        if not protocol:
            protocol = (
                db.query(SystemProtocol)
                .filter(SystemProtocol.blood_group == p.blood_group)
                .first()
            )
        days_ahead = protocol.proactive_days_ahead if protocol else days_ahead_default
        target_window_end = today + timedelta(days=days_ahead)
        if p.expected_next_transfusion_date > target_window_end:
            continue

        existing = (
            db.query(BloodRequest)
            .filter(
                and_(
                    BloodRequest.patient_id == p.id,
                    BloodRequest.is_proactive.is_(True),
                    BloodRequest.status.in_(
                        ["pending", "matching", "outreach_sent", "confirmed", "fulfilled"]
                    ),
                )
            )
            .first()
        )
        if existing:
            skipped.append(p.id)
            continue

        req = BloodRequest(
            patient_id=p.id,
            blood_group=p.blood_group,
            units_needed=p.quantity_required or 1,
            urgency="routine",
            required_by=None,
            hospital_name=p.hospital_name,
            hospital_lat=float(p.hospital_lat) if p.hospital_lat else None,
            hospital_lon=float(p.hospital_lon) if p.hospital_lon else None,
            is_proactive=True,
            created_by="system",
            status="pending",
            notes=(
                f"Proactive request: scheduled transfusion on "
                f"{p.expected_next_transfusion_date.isoformat()}"
            ),
        )
        db.add(req)
        db.commit()
        db.refresh(req)
        get_orchestrator().start_request_workflow(req.id)
        created.append(req.id)

    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created_request_ids": created,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(db)
    finally:
        db.close()
