"""Blood request endpoints."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import get_db
from app.db.models import BloodRequest, Donor, OutreachLog, Patient, ResponseToken
from app.schemas.common import Page, StatusUpdate
from app.schemas.donor import DonorMatchResult
from app.schemas.request import (
    BloodRequestCreate,
    BloodRequestRead,
    OutreachLogRead,
    RequestDetail,
    SmsTestLink,
    SmsTestLinksResponse,
    SmsTimelineEntry,
)
from app.services.sms_timeline import build_sms_timeline
from app.services.matcher import match_donors
from app.services.patient_notify import notify_request_created
from app.services.step_functions_client import get_orchestrator

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("", response_model=Page[BloodRequestRead])
def list_requests(
    status: Optional[str] = None,
    blood_group: Optional[str] = None,
    urgency: Optional[str] = None,
    is_proactive: Optional[bool] = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(BloodRequest)
    if status:
        q = q.filter(BloodRequest.status == status)
    if blood_group:
        q = q.filter(BloodRequest.blood_group == blood_group)
    if urgency:
        q = q.filter(BloodRequest.urgency == urgency)
    if is_proactive is not None:
        q = q.filter(BloodRequest.is_proactive.is_(is_proactive))
    total = q.count()
    items = q.order_by(BloodRequest.created_at.desc()).limit(limit).offset(offset).all()
    return Page[BloodRequestRead](items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=BloodRequestRead, status_code=201)
def create_request(payload: BloodRequestCreate, db: Session = Depends(get_db)):
    # If patient_id is provided, hydrate hospital info if not specified
    hospital_name = payload.hospital_name
    hospital_lat = payload.hospital_lat
    hospital_lon = payload.hospital_lon
    if payload.patient_id and not (hospital_name and hospital_lat and hospital_lon):
        patient = db.query(Patient).get(payload.patient_id)
        if patient:
            hospital_name = hospital_name or patient.hospital_name
            hospital_lat = hospital_lat or (
                float(patient.hospital_lat) if patient.hospital_lat else None
            )
            hospital_lon = hospital_lon or (
                float(patient.hospital_lon) if patient.hospital_lon else None
            )

    req = BloodRequest(
        patient_id=payload.patient_id,
        blood_group=payload.blood_group,
        units_needed=payload.units_needed,
        urgency=payload.urgency,
        required_by=payload.required_by,
        hospital_name=hospital_name,
        hospital_lat=hospital_lat,
        hospital_lon=hospital_lon,
        notes=payload.notes,
        is_proactive=payload.is_proactive,
        created_by=payload.created_by,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Automatic SMS to patient: "Your request is being processed"
    try:
        notify_request_created(db, req)
        db.commit()
    except Exception:
        db.rollback()

    # Kick off the orchestrator (Step Functions or local simulator)
    get_orchestrator().start_request_workflow(req.id)
    return req


@router.get("/{request_id}", response_model=RequestDetail)
def get_request(request_id: str, db: Session = Depends(get_db)):
    req = (
        db.query(BloodRequest)
        .options(joinedload(BloodRequest.outreach_logs).joinedload(OutreachLog.donor))
        .filter(BloodRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    timeline = build_sms_timeline(db, req)
    logs_sorted = sorted(
        req.outreach_logs,
        key=lambda x: x.sent_at or datetime.min,
        reverse=True,
    )

    enriched_logs = []
    for log in logs_sorted:
        donor = log.donor or db.query(Donor).get(log.donor_id)
        data = OutreachLogRead.model_validate(log).model_dump()
        data["donor_name"] = donor.name if donor else None
        data["donor_phone"] = donor.phone if donor else None
        data["message_kind"] = getattr(log, "message_kind", None) or "outreach_request"
        enriched_logs.append(OutreachLogRead(**data))

    return RequestDetail(
        **BloodRequestRead.model_validate(req).model_dump(),
        outreach_logs=enriched_logs,
        sms_timeline=[SmsTimelineEntry(**row) for row in timeline],
        escalations=req.escalations,
    )


@router.get("/{request_id}/sms-test-links", response_model=SmsTestLinksResponse)
def sms_test_links(request_id: str, db: Session = Depends(get_db)):
    """Return YES/NO tap URLs for local demo when SMS is mocked.

    In production with real SNS, donors open these links from their phone.
    Locally, coordinators click them here to simulate donor replies.
    """
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    tokens = (
        db.query(ResponseToken)
        .filter_by(request_id=request_id)
        .order_by(ResponseToken.created_at.asc())
        .all()
    )
    base = settings.response_base_url.split("?")[0]
    links: List[SmsTestLink] = []
    for t in tokens:
        donor = db.query(Donor).get(t.donor_id)
        links.append(
            SmsTestLink(
                token=t.token,
                purpose=t.purpose,
                consumed=t.consumed,
                consumed_action=t.consumed_action,
                donor_id=t.donor_id,
                donor_name=donor.name if donor else None,
                phone=donor.phone if donor else None,
                yes_url=f"{base}?token={t.token}&action=accept",
                no_url=f"{base}?token={t.token}&action=decline",
            )
        )
    return SmsTestLinksResponse(
        using_mocks=settings.sns_mocks_enabled,
        response_base_url=settings.response_base_url,
        links=links,
    )


@router.get("/{request_id}/matches", response_model=List[DonorMatchResult])
def preview_matches(
    request_id: str,
    radius_km: Optional[int] = None,
    batch_size: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Preview matched donors without sending outreach (for the admin UI)."""
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return match_donors(db, req, radius_km=radius_km, batch_size=batch_size)


@router.patch("/{request_id}/status", response_model=BloodRequestRead)
def update_status(request_id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = payload.status
    if payload.reason:
        req.failure_reason = payload.reason
    db.commit()
    db.refresh(req)
    return req


@router.post("/{request_id}/retry", response_model=BloodRequestRead)
def retry_request(request_id: str, db: Session = Depends(get_db)):
    """Reset a failed/stuck request to matching — coordinator sends SMS manually."""
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "matching"
    req.failed_at = None
    req.failure_reason = None
    db.commit()
    get_orchestrator().start_request_workflow(req.id)
    db.refresh(req)
    return req
