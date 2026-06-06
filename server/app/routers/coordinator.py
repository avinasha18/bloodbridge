"""Coordinator-driven actions on an active blood request:

  POST /coordinator/requests/{id}/send-location      - SMS hospital details
  POST /coordinator/requests/{id}/send-pre-confirm   - day-before reminder
  POST /coordinator/requests/{id}/mark-donated       - close as fulfilled
  POST /coordinator/requests/{id}/mark-no-show       - lower showup, promote standby
  POST /coordinator/requests/{id}/promote-standby    - manual override

Donor-related coordinator actions live in `donors_admin.py`:
  POST /coordinator/donors/{id}/send-profile-link
  POST /coordinator/donors/self-register-invite
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import BloodRequest, Donor
from app.services import reservation
from app.services.outreach_delivery import admin_resend_outreach
from app.services.patient_notify import notify_location_shared
from app.services.sms_sender import send_location_sms
from app.services.sms_timeline import record_followup_sms

router = APIRouter(prefix="/coordinator", tags=["coordinator"])


class LocationSendIn(BaseModel):
    when: Optional[str] = None  # human-readable time, e.g. "Mon 9 Jun 10:00 AM"


class SimpleResult(BaseModel):
    status: str
    detail: Optional[str] = None
    data: Optional[dict] = None


class ResendSmsIn(BaseModel):
    batch_size: Optional[int] = None
    retry_no_reply: bool = False


@router.post("/requests/{request_id}/resend-sms", response_model=SimpleResult)
def resend_sms(
    request_id: str,
    payload: ResendSmsIn = ResendSmsIn(),
    db: Session = Depends(get_db),
):
    """Send (or retry) outreach SMS to top donors — use when automatic send failed."""
    result = admin_resend_outreach(
        db,
        request_id,
        batch_size=payload.batch_size,
        retry_no_reply=payload.retry_no_reply,
    )
    if result.get("status") == "error" or result.get("sent_count", 0) == 0:
        failed = result.get("failed") or []
        err = (
            failed[0].get("error")
            if failed
            else result.get("detail") or result.get("reason")
        )
        raise HTTPException(status_code=400, detail=err or "SMS send failed")
    sent = result.get("sent_count", 0)
    failed = result.get("failed_count", 0)
    phones = ", ".join(
        s.get("phone") or "?" for s in (result.get("sent") or [])[:3]
    )
    detail = f"Sent {sent} SMS to {phones}" if phones else f"Sent {sent} SMS"
    if failed:
        detail += f", {failed} failed"
    return SimpleResult(status="sent", detail=detail, data=result)


@router.post("/requests/{request_id}/send-location", response_model=SimpleResult)
def send_location(
    request_id: str,
    payload: LocationSendIn = LocationSendIn(),
    db: Session = Depends(get_db),
):
    req = db.query(BloodRequest).get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not req.assigned_donor_id:
        raise HTTPException(status_code=400, detail="No assigned donor")
    donor = db.query(Donor).get(req.assigned_donor_id)
    if not donor or not donor.phone:
        raise HTTPException(status_code=400, detail="Assigned donor has no phone")
    if req.hospital_lat is None or req.hospital_lon is None:
        raise HTTPException(status_code=400, detail="Hospital coordinates missing")

    sms = send_location_sms(
        phone=donor.phone,
        hospital_name=req.hospital_name or "the hospital",
        hospital_lat=float(req.hospital_lat),
        hospital_lon=float(req.hospital_lon),
        when=payload.when,
    )
    record_followup_sms(
        db,
        request_id=req.id,
        donor_id=donor.id,
        message_kind="location",
        message_id=sms.message_id,
    )
    req.location_sent_at = datetime.utcnow()
    db.commit()
    # Inform the patient that the donor now has the hospital address
    try:
        notify_location_shared(db, req, donor)
        db.commit()
    except Exception:
        db.rollback()
    return SimpleResult(
        status="sent",
        detail=f"Location SMS sent to {donor.name or donor.phone}",
        data={"message_id": sms.message_id, "phone": donor.phone},
    )


@router.post("/requests/{request_id}/send-pre-confirm", response_model=SimpleResult)
def send_pre_confirm(request_id: str, db: Session = Depends(get_db)):
    result = reservation.send_pre_confirmation(db, request_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("reason"))
    return SimpleResult(status=result["status"], data=result)


@router.post("/requests/{request_id}/mark-donated", response_model=SimpleResult)
def mark_donated(request_id: str, db: Session = Depends(get_db)):
    result = reservation.coordinator_marks_donated(db, request_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("reason"))
    return SimpleResult(status="fulfilled", data=result)


@router.post("/requests/{request_id}/mark-no-show", response_model=SimpleResult)
def mark_no_show(request_id: str, db: Session = Depends(get_db)):
    result = reservation.coordinator_marks_no_show(db, request_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("reason"))
    if result.get("status") == "failed_no_standby":
        raise HTTPException(status_code=400, detail=result.get("reason"))
    detail = _promotion_detail(result)
    return SimpleResult(status=result["status"], detail=detail, data=result)


def _promotion_detail(result: dict) -> str:
    status = result.get("status")
    if status == "promoted":
        name = result.get("donor_name") or result.get("donor_id", "")[:8]
        phone = result.get("phone") or ""
        return f"Backup donor {name} promoted — SMS sent{f' to {phone}' if phone else ''}."
    if status == "next_donors_contacted":
        n = result.get("sent_count", 0)
        return f"No standby available — SMS sent to {n} next donor(s)."
    if status == "failed_no_standby":
        return result.get("reason") or "No backup donors left to contact."
    if status == "error" and result.get("reason") == "sms_failed":
        return result.get("detail") or "Promotion SMS failed."
    return "Donor marked as no-show."


@router.post("/requests/{request_id}/promote-standby", response_model=SimpleResult)
def promote_standby(request_id: str, db: Session = Depends(get_db)):
    result = reservation.promote_next_standby(db, request_id, reason="coordinator_override")
    if result.get("status") == "error":
        raise HTTPException(
            status_code=400,
            detail=result.get("detail") or result.get("reason"),
        )
    if result.get("status") == "failed_no_standby":
        raise HTTPException(status_code=400, detail=result.get("reason"))
    return SimpleResult(
        status=result["status"],
        detail=_promotion_detail(result),
        data=result,
    )
