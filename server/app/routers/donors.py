"""Donor management endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import Donor
from app.schemas.common import Page
from app.schemas.donor import DonorCreate, DonorRead, DonorScoreUpdate
from app.services.reliability_model import compute_overall_score
from app.services.reliability_service import (
    refresh_all_donor_scores,
    refresh_donor_score,
    sync_overall_scores,
    train_and_sync_db,
)

router = APIRouter(prefix="/donors", tags=["donors"])


@router.get("", response_model=Page[DonorRead])
def list_donors(
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    eligibility_status: Optional[str] = None,
    active_status: Optional[str] = Query(None, description="Active | Inactive"),
    min_donations: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Donor)
    if blood_group:
        q = q.filter(Donor.blood_group == blood_group)
    if city:
        q = q.filter(Donor.city == city)
    if eligibility_status:
        q = q.filter(Donor.eligibility_status == eligibility_status)
    if active_status:
        q = q.filter(Donor.user_donation_active_status == active_status)
    if min_donations is not None:
        q = q.filter(Donor.donations_till_date >= min_donations)
    if search:
        pattern = f"%{search.lower()}%"
        q = q.filter(
            (func.lower(Donor.name).like(pattern))
            | (func.lower(Donor.email).like(pattern))
            | (Donor.phone.like(f"%{search}%"))
        )

    total = q.count()
    items = (
        q.order_by(Donor.overall_score.desc(), Donor.reliability_score.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return Page[DonorRead](items=items, total=total, limit=limit, offset=offset)


@router.get("/at-risk", response_model=List[DonorRead])
def at_risk_donors(
    threshold: float = Query(3.0, gt=0, le=10),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Donors with calls_to_donations_ratio above threshold (being over-contacted)."""
    return (
        db.query(Donor)
        .filter(Donor.calls_to_donations_ratio.isnot(None))
        .filter(Donor.calls_to_donations_ratio > threshold)
        .order_by(Donor.calls_to_donations_ratio.desc())
        .limit(limit)
        .all()
    )


@router.get("/incomplete", response_model=List[DonorRead])
def incomplete_donors(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Donors with missing profile fields (e.g. no blood group). The
    coordinator can send each of these a profile-completion SMS link.
    """
    return (
        db.query(Donor)
        .filter(Donor.profile_complete.is_(False))
        .filter(Donor.phone.isnot(None))
        .order_by(Donor.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/{donor_id}", response_model=DonorRead)
def get_donor(donor_id: str, db: Session = Depends(get_db)):
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    return donor


@router.post("", response_model=DonorRead, status_code=201)
def create_donor(payload: DonorCreate, db: Session = Depends(get_db)):
    """Admin-only direct donor creation (used by the Blood Warriors admin form)."""
    if payload.phone:
        existing = db.query(Donor).filter_by(phone=payload.phone).first()
        if existing:
            raise HTTPException(status_code=409, detail="Phone already registered")
    donor = Donor(
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        blood_group=payload.blood_group,
        gender=payload.gender,
        latitude=payload.latitude,
        longitude=payload.longitude,
        city=payload.city,
        consent_given=payload.consent_given,
        preferred_channel=payload.preferred_channel or "sms",
        language_preference=payload.language_preference,
        eligibility_status="eligible",
        user_donation_active_status="Active",
        donor_type="Regular Donor",
        role="Emergency Donor",
        profile_complete=bool(
            payload.blood_group and payload.latitude is not None and payload.longitude is not None
        ),
    )
    db.add(donor)
    db.flush()
    refresh_donor_score(donor)
    db.commit()
    db.refresh(donor)
    return donor


@router.post("/reliability/train-and-sync")
def train_reliability_and_sync(db: Session = Depends(get_db)):
    """Retrain RandomForest from dataset.csv and write scores to all donors."""
    return train_and_sync_db(db)


@router.post("/reliability/refresh-all")
def refresh_all_reliability(db: Session = Depends(get_db)):
    """Rescore every donor with the currently loaded model."""
    return refresh_all_donor_scores(db)


@router.post("/reliability/sync-overall")
def sync_overall_reliability(db: Session = Depends(get_db)):
    """Recompute combined overall_score for every donor (ML + show-up)."""
    return sync_overall_scores(db)


@router.patch("/{donor_id}/score", response_model=DonorRead)
def update_score(donor_id: str, payload: DonorScoreUpdate, db: Session = Depends(get_db)):
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    if payload.recompute:
        refresh_donor_score(donor)
    elif payload.reliability_score is not None:
        donor.reliability_score = payload.reliability_score
        donor.overall_score = compute_overall_score(
            payload.reliability_score, float(donor.showup_rate or 0.5)
        )
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide reliability_score or set recompute=true",
        )
    db.commit()
    db.refresh(donor)
    return donor
