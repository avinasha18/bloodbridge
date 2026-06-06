"""Manual triggers for the scheduled / nightly jobs.

These wrap the same code Lambda runs in production. They exist so the demo
can fire jobs on demand (e.g. "Run proactive scheduler now") without
waiting for cron.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.lambdas import failure_analyzer, proactive_scheduler
from app.services.reliability_service import refresh_all_donor_scores, train_and_sync_db

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/proactive-scheduler/run")
def run_proactive_scheduler(db: Session = Depends(get_db)):
    """Create blood_requests for patients with upcoming transfusions."""
    return proactive_scheduler.run(db)


@router.post("/failure-analyzer/run")
def run_failure_analyzer(db: Session = Depends(get_db)):
    """Bedrock analysis of failures → updates system_protocols."""
    return failure_analyzer.run(db)


@router.post("/reliability/train-and-sync")
def run_reliability_train(db: Session = Depends(get_db)):
    """Retrain RandomForest from dataset.csv and sync all donor scores."""
    return train_and_sync_db(db)


@router.post("/reliability/refresh-all")
def run_reliability_refresh(db: Session = Depends(get_db)):
    """Rescore all donors with the currently loaded model."""
    return refresh_all_donor_scores(db)


@router.post("/transfusion-reminders/run")
def run_transfusion_reminders(db: Session = Depends(get_db)):
    """Send SMS reminders to patients whose next transfusion is in 1-3 days.

    Idempotent: only sends if a reminder hasn't been logged in the last 48h.
    """
    from datetime import date, datetime, timedelta

    from app.db.models import BloodRequest, Patient, PatientNotification
    from app.services.patient_notify import notify_transfusion_reminder

    today = date.today()
    horizon = today + timedelta(days=3)

    candidates = (
        db.query(Patient)
        .filter(
            Patient.expected_next_transfusion_date.isnot(None),
            Patient.expected_next_transfusion_date >= today,
            Patient.expected_next_transfusion_date <= horizon,
            Patient.notifications_enabled.is_(True),
            Patient.phone.isnot(None),
        )
        .all()
    )

    sent = []
    skipped = []
    for p in candidates:
        days = (p.expected_next_transfusion_date - today).days
        # Find an existing active request for this patient, else use the most recent
        recent = (
            db.query(BloodRequest)
            .filter(BloodRequest.patient_id == p.id)
            .order_by(BloodRequest.created_at.desc())
            .first()
        )
        if not recent:
            skipped.append({"patient_id": p.id, "reason": "no_request"})
            continue
        # Skip if a reminder was sent in the last 48 hours
        already = (
            db.query(PatientNotification)
            .filter(
                PatientNotification.patient_id == p.id,
                PatientNotification.kind == "transfusion_reminder",
                PatientNotification.sent_at >= datetime.utcnow() - timedelta(hours=48),
            )
            .first()
        )
        if already:
            skipped.append({"patient_id": p.id, "reason": "already_sent"})
            continue
        try:
            notify_transfusion_reminder(db, recent, days)
            sent.append({"patient_id": p.id, "phone": p.phone, "days": days})
        except Exception as exc:
            skipped.append({"patient_id": p.id, "reason": f"error: {exc}"})

    db.commit()
    return {
        "status": "ok",
        "candidates": len(candidates),
        "sent": len(sent),
        "skipped": len(skipped),
        "details": {"sent": sent, "skipped": skipped[:20]},
    }
