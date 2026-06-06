"""Donor Engagement & Retention Agent — coordinator endpoints + Twilio webhook."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings

from app.db import get_db
from app.db.models import Donor, DonorEngagementLog
from app.services.donor_engagement import (
    SEGMENTS,
    analyze_donor,
    build_engagement_plan,
    cadence_ok,
    outreach_sample_profiles,
    run_engagement_agent,
    segment_counts,
    send_engagement,
    prepare_outreach_samples,
)
from app.services.whatsapp_replies import handle_whatsapp_reply, send_reply_ack
from app.services.twilio_whatsapp import parse_twilio_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/donor-engagement", tags=["donor-engagement"])


# ─── Schemas ────────────────────────────────────────────────────────────


class EngagementPlan(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    donor_id: str
    donor_name: Optional[str]
    phone: Optional[str]
    segment: str
    reason: str
    days_since_last_donation: Optional[int]
    days_since_registration: int
    eligible_now: bool
    last_engagement_at: Optional[datetime]
    cadence_ok: bool
    min_gap_days: int
    message: str
    message_body: Optional[str] = None
    native_headline: Optional[str] = None
    native_lang: Optional[str] = None
    native_lang_label: Optional[str] = None
    region_name: Optional[str] = None
    rationale: Optional[str] = None
    channel: str = "whatsapp"


class EngagementSendRequest(BaseModel):
    force: bool = False
    channel: str = "whatsapp"
    custom_message: Optional[str] = None


class EngagementSendResult(EngagementPlan):
    status: str
    message_id: Optional[str] = None
    delivery_error: Optional[str] = None
    delivery_phone: Optional[str] = None
    intended_phone: Optional[str] = None
    redirected: bool = False


class EngagementLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    donor_id: str
    segment: str
    channel: str
    message: str
    rationale: Optional[str]
    status: str
    message_id: Optional[str]
    delivery_error: Optional[str]
    sent_at: datetime


class BatchRunRequest(BaseModel):
    limit: int = 25
    segments: Optional[List[str]] = None  # subset of SEGMENTS
    dry_run: bool = True


class SegmentSummary(BaseModel):
    new: int = 0
    active: int = 0
    at_risk: int = 0
    dormant: int = 0


# ─── Endpoints ─────────────────────────────────────────────────────────


@router.get("/summary")
def engagement_summary(db: Session = Depends(get_db)):
    """Counts by segment across all active donors (fast — no N+1 queries)."""
    counts = segment_counts(db)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    last_run = (
        db.query(DonorEngagementLog)
        .order_by(DonorEngagementLog.sent_at.desc())
        .first()
    )
    sent_today = (
        db.query(func.count(DonorEngagementLog.id))
        .filter(
            DonorEngagementLog.channel == "whatsapp",
            DonorEngagementLog.sent_at >= today_start,
            DonorEngagementLog.status.notin_(["preview", "failed"]),
        )
        .scalar()
    ) or 0

    return {
        "total_scanned": sum(counts.values()),
        "segments": counts,
        "sent_today": int(sent_today),
        "last_sent_at": last_run.sent_at if last_run else None,
        "whatsapp_override": settings.sms_override_phone or None,
        "twilio_webhook_url": _twilio_webhook_hint(),
    }


def _twilio_webhook_hint() -> str:
    base = settings.response_base_url.rstrip("/")
    # response_base_url is often .../respond — strip to host root if needed
    if base.endswith("/respond"):
        base = base[: -len("/respond")]
    return f"{base}/api/donor-engagement/twilio/webhook"


@router.get("/recent")
def recent_outreach(
    limit: int = Query(15, ge=1, le=100),
    offset: int = Query(0, ge=0),
    donor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Recent WhatsApp sends + inbound replies with donor name."""
    q = (
        db.query(DonorEngagementLog, Donor.name, Donor.phone)
        .outerjoin(Donor, Donor.id == DonorEngagementLog.donor_id)
        .filter(DonorEngagementLog.channel.in_(["whatsapp", "whatsapp_inbound"]))
    )
    if donor_id:
        q = q.filter(DonorEngagementLog.donor_id == donor_id)

    total = q.count()
    rows = (
        q.order_by(DonorEngagementLog.sent_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = []
    for log, donor_name, donor_phone in rows:
        items.append(
            {
                "id": log.id,
                "donor_id": log.donor_id,
                "donor_name": donor_name,
                "donor_phone": donor_phone,
                "segment": log.segment,
                "status": log.status,
                "message_id": log.message_id,
                "message_preview": (log.message or "")[:120],
                "message": log.message or "",
                "sent_at": log.sent_at,
                "delivery_error": log.delivery_error,
                "channel": log.channel,
            }
        )
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/prepare-samples")
def prepare_samples(db: Session = Depends(get_db)):
    """Align four sample donor profiles (one per segment) with coordinator test phones."""
    return prepare_outreach_samples(db)


@router.get("/sample-profiles")
def list_sample_profiles(db: Session = Depends(get_db)):
    """Quick links: one donor per engagement segment."""
    return {"profiles": outreach_sample_profiles(db)}


@router.get("/donors/{donor_id}/plan", response_model=EngagementPlan)
def preview_plan(donor_id: str, db: Session = Depends(get_db)):
    """Generate (but DO NOT send) an engagement plan for one donor."""
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(404, detail="Donor not found")
    plan = build_engagement_plan(db, donor)
    return plan


@router.post("/donors/{donor_id}/send", response_model=EngagementSendResult)
def send_plan(
    donor_id: str,
    payload: EngagementSendRequest,
    db: Session = Depends(get_db),
):
    """Generate + send the engagement message via WhatsApp."""
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(404, detail="Donor not found")
    result = send_engagement(
        db,
        donor,
        force=payload.force,
        custom_message=payload.custom_message,
        channel=payload.channel,
    )
    return result


@router.get("/donors/{donor_id}/history", response_model=List[EngagementLogRead])
def donor_history(
    donor_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(DonorEngagementLog)
        .filter(DonorEngagementLog.donor_id == donor_id)
        .order_by(DonorEngagementLog.sent_at.desc())
        .limit(limit)
        .all()
    )
    return rows


@router.post("/run")
def run_batch(payload: BatchRunRequest, db: Session = Depends(get_db)):
    """Run the engagement agent across the donor base.

    `dry_run=True` (default) — only previews plans, never sends.
    Cadence guard prevents spamming the same donor.
    """
    return run_engagement_agent(
        db,
        limit=payload.limit,
        segments=payload.segments,
        dry_run=payload.dry_run,
    )


# ─── Twilio inbound webhook (donor replies on WhatsApp) ────────────────


@router.post("/twilio/webhook", response_class=PlainTextResponse)
async def twilio_webhook(request: Request, db: Session = Depends(get_db)):
    """Twilio WhatsApp inbound webhook.

    Configure in Twilio Console → Messaging → WhatsApp Sandbox →
    "When a message comes in":
      https://YOUR-PUBLIC-URL/api/donor-engagement/twilio/webhook

    YES  → confirm open blood request OR mark donor ready (engagement)
    NO   → decline request OR pause engagement outreach
    STOP → unsubscribe (consent_given=false)
    """
    form = dict(await request.form())
    parsed = parse_twilio_webhook(form)

    result = handle_whatsapp_reply(
        db,
        from_phone=parsed["from"],
        body=parsed["message"],
        message_sid=parsed["message_sid"],
        profile_name=parsed.get("profile_name") or "",
    )

    logger.info(
        "WhatsApp inbound %s → intent=%s context=%s donor=%s",
        parsed["from"],
        result.get("intent"),
        result.get("context"),
        result.get("donor_id"),
    )

    twiml = "<?xml version='1.0' encoding='UTF-8'?><Response></Response>"
    try:
        send_reply_ack(parsed["from"], result.get("reply_text"))
    except Exception:
        logger.exception("Failed to send WhatsApp reply ack")

    return Response(content=twiml, media_type="application/xml")
