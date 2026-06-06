"""Patient endpoints."""

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import BloodRequest, Patient, PatientNotification
from app.schemas.common import Page
from app.schemas.patient import (
    PatientCreate,
    PatientNotificationRead,
    PatientRead,
    UpcomingTransfusion,
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=Page[PatientRead])
def list_patients(
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Patient)
    if blood_group:
        q = q.filter(Patient.blood_group == blood_group)
    if city:
        q = q.filter(Patient.city == city)
    if search:
        pattern = f"%{search.lower()}%"
        q = q.filter(
            (func.lower(Patient.name).like(pattern))
            | (func.lower(Patient.hospital_name).like(pattern))
        )
    total = q.count()
    items = q.order_by(Patient.expected_next_transfusion_date.asc()).limit(limit).offset(offset).all()
    return Page[PatientRead](items=items, total=total, limit=limit, offset=offset)


@router.get("/upcoming", response_model=List[UpcomingTransfusion])
def upcoming_transfusions(
    days_ahead: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    rows = (
        db.query(Patient)
        .filter(
            Patient.expected_next_transfusion_date.isnot(None),
            Patient.expected_next_transfusion_date >= today,
            Patient.expected_next_transfusion_date <= cutoff,
        )
        .order_by(Patient.expected_next_transfusion_date.asc())
        .all()
    )

    # Has a proactive request already been created in this cycle?
    out: List[UpcomingTransfusion] = []
    for p in rows:
        proactive_exists = (
            db.query(BloodRequest.id)
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
            is not None
        )
        days_until = (p.expected_next_transfusion_date - today).days
        out.append(
            UpcomingTransfusion(
                patient_id=p.id,
                name=p.name,
                blood_group=p.blood_group,
                hospital_name=p.hospital_name,
                expected_next_transfusion_date=p.expected_next_transfusion_date,
                days_until=days_until,
                proactive_request_created=proactive_exists,
            )
        )
    return out


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).get(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("", response_model=PatientRead, status_code=201)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(**payload.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get(
    "/{patient_id}/notifications",
    response_model=List[PatientNotificationRead],
)
def list_patient_notifications(
    patient_id: str,
    db: Session = Depends(get_db),
):
    return (
        db.query(PatientNotification)
        .filter(PatientNotification.patient_id == patient_id)
        .order_by(PatientNotification.sent_at.desc())
        .limit(100)
        .all()
    )


@router.get(
    "/by-request/{request_id}/notifications",
    response_model=List[PatientNotificationRead],
)
def list_request_patient_notifications(
    request_id: str,
    db: Session = Depends(get_db),
):
    """Patient SMS log for a single blood request — shown on the coordinator UI."""
    return (
        db.query(PatientNotification)
        .filter(PatientNotification.request_id == request_id)
        .order_by(PatientNotification.sent_at.desc())
        .all()
    )
