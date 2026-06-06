"""System protocols endpoints (matching parameters per blood_group + city)."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import SystemProtocol
from app.schemas.request import ProtocolRead

router = APIRouter(prefix="/protocols", tags=["protocols"])


class ProtocolUpdate(BaseModel):
    initial_batch_size: int | None = None
    initial_radius_km: int | None = None
    escalation_wait_h: float | None = None
    proactive_days_ahead: int | None = None
    update_reason: str | None = None


@router.get("", response_model=List[ProtocolRead])
def list_protocols(db: Session = Depends(get_db)):
    return db.query(SystemProtocol).order_by(SystemProtocol.blood_group).all()


@router.patch("/{protocol_id}", response_model=ProtocolRead)
def update_protocol(
    protocol_id: str, payload: ProtocolUpdate, db: Session = Depends(get_db)
):
    p = db.query(SystemProtocol).get(protocol_id)
    if not p:
        raise HTTPException(status_code=404, detail="Protocol not found")
    if payload.initial_batch_size is not None:
        p.initial_batch_size = payload.initial_batch_size
    if payload.initial_radius_km is not None:
        p.initial_radius_km = payload.initial_radius_km
    if payload.escalation_wait_h is not None:
        p.escalation_wait_h = payload.escalation_wait_h
    if payload.proactive_days_ahead is not None:
        p.proactive_days_ahead = payload.proactive_days_ahead
    if payload.update_reason:
        p.update_reason = payload.update_reason
    p.last_updated_by = "admin"
    db.commit()
    db.refresh(p)
    return p
