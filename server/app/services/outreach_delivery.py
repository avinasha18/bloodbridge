"""Admin + orchestrator outreach SMS delivery."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import BloodRequest, Donor, OutreachLog, ResponseToken
from app.services.matcher import get_protocol_for, match_donors, score_donor_for_request
from app.services.sms_sender import send_outreach_sms, token_expiry_hours

logger = logging.getLogger(__name__)


@dataclass
class OutreachBatchResult:
    sent: List[Dict] = field(default_factory=list)
    failed: List[Dict] = field(default_factory=list)

    @property
    def sent_count(self) -> int:
        return len(self.sent)

    @property
    def failed_count(self) -> int:
        return len(self.failed)


def _city(req: BloodRequest) -> Optional[str]:
    if not req.hospital_name:
        return None
    parts = [p.strip() for p in req.hospital_name.split(",")]
    return parts[-1] if len(parts) > 1 else None


def pick_unique_phone_matches(
    db: Session,
    matches,
    limit: int,
) -> List:
    """Top-N donors with distinct phone numbers (demo seed reuses 2 numbers)."""
    picked = []
    seen_phones: set[str] = set()
    for m in matches:
        donor = db.query(Donor).get(m.donor_id)
        phone = (donor.phone if donor else None) or getattr(m, "phone", None)
        if not phone or phone in seen_phones:
            continue
        seen_phones.add(phone)
        picked.append(m)
        if len(picked) >= limit:
            break
    return picked


def send_outreach_batch(
    db: Session,
    req: BloodRequest,
    matches,
    batch_number: int,
) -> OutreachBatchResult:
    """Send SMS to matched donors; continue on per-donor SNS failures."""
    result = OutreachBatchResult()
    delay = max(0.0, float(settings.sms_send_delay_seconds or 0))
    sent_this_batch = 0

    for m in matches:
        donor = db.query(Donor).get(m.donor_id)
        if not donor or not donor.phone:
            result.failed.append(
                {
                    "donor_id": m.donor_id,
                    "name": m.name,
                    "phone": None,
                    "error": "missing phone",
                }
            )
            continue
        try:
            if sent_this_batch > 0 and delay:
                time.sleep(delay)
            from app.services.i18n import detect_language

            lang = detect_language(
                latitude=float(donor.latitude) if donor.latitude is not None else None,
                longitude=float(donor.longitude) if donor.longitude is not None else None,
                city=donor.city,
                explicit=donor.language_preference,
            )
            sms = send_outreach_sms(
                phone=donor.phone,
                blood_group=req.blood_group,
                hospital_name=req.hospital_name,
                urgency=req.urgency,
                units_needed=req.units_needed,
                lang=lang,
            )
            log = OutreachLog(
                request_id=req.id,
                donor_id=donor.id,
                channel="sms",
                message_id=sms.message_id,
                message_kind="outreach_request",
                batch_number=batch_number,
                rank_score=m.final_rank_score,
                distance_km=max(m.distance_km, 0),
                reliability_score_snapshot=m.reliability_score,
                showup_rate_snapshot=m.showup_rate,
            )
            db.add(log)
            db.flush()
            if sms.token:
                db.add(
                    ResponseToken(
                        token=sms.token,
                        request_id=req.id,
                        donor_id=donor.id,
                        outreach_log_id=log.id,
                        expires_at=token_expiry_hours(),
                        purpose="outreach",
                    )
                )
            result.sent.append(
                {
                    "donor_id": donor.id,
                    "name": donor.name,
                    "phone": donor.phone,
                    "message_id": sms.message_id,
                }
            )
            sent_this_batch += 1
            logger.info(
                "Outreach SMS sent request=%s donor=%s phone=%s msg=%s",
                req.id,
                donor.id,
                donor.phone,
                sms.message_id,
            )
        except Exception as exc:
            logger.exception(
                "Outreach SMS failed for donor %s (%s)", donor.id, donor.phone
            )
            result.failed.append(
                {
                    "donor_id": donor.id,
                    "name": donor.name,
                    "phone": donor.phone,
                    "error": str(exc),
                }
            )
    db.commit()
    return result


def admin_resend_outreach(
    db: Session,
    request_id: str,
    *,
    batch_size: Optional[int] = None,
    retry_no_reply: bool = False,
) -> Dict:
    """Coordinator-triggered SMS resend for failed or missing outreach."""
    req = db.query(BloodRequest).get(request_id)
    if not req:
        return {"status": "error", "reason": "request_not_found"}

    if req.status == "fulfilled":
        return {"status": "error", "reason": "request_already_fulfilled"}

    logs = db.query(OutreachLog).filter_by(request_id=req.id).all()
    contacted = {ol.donor_id for ol in logs}
    no_reply_ids = {ol.donor_id for ol in logs if not ol.response}

    protocol = get_protocol_for(db, req.blood_group, _city(req))
    radius = req.search_radius_km or protocol.initial_radius_km
    batch = batch_size if batch_size is not None else settings.outreach_batch_size

    if retry_no_reply and no_reply_ids:
        donors = (
            db.query(Donor)
            .filter(Donor.id.in_(no_reply_ids))
            .all()
        )
        matches = []
        for donor in donors:
            if not donor.phone:
                continue
            result = score_donor_for_request(donor, req, radius_km=radius)
            if result.distance_km >= 0 and result.distance_km > radius:
                continue
            matches.append(result)
        matches.sort(key=lambda m: m.final_rank_score, reverse=True)
        matches = pick_unique_phone_matches(db, matches, batch)
        exclude_note = "retry_no_reply"
    else:
        exclude = list(contacted)
        # Over-fetch so we can skip duplicate demo phone numbers.
        raw = match_donors(
            db,
            req,
            radius_km=radius,
            batch_size=max(batch * 8, 16),
            exclude_donor_ids=exclude,
        )
        matches = pick_unique_phone_matches(db, raw, batch)
        exclude_note = "new_donors_only"

    if not matches:
        return {
            "status": "error",
            "reason": "no_donors_to_contact",
            "detail": "All matched donors were already texted or none eligible nearby.",
        }

    batch_number = max((ol.batch_number for ol in logs), default=0) + 1
    delivery = send_outreach_batch(db, req, matches, batch_number=batch_number)

    if delivery.sent_count > 0:
        req.status = "outreach_sent"
        req.failed_at = None
        req.failure_reason = None
        db.commit()

    return {
        "status": "ok" if delivery.sent_count > 0 else "error",
        "mode": exclude_note,
        "sent_count": delivery.sent_count,
        "failed_count": delivery.failed_count,
        "sent": delivery.sent,
        "failed": delivery.failed,
        "request_status": req.status,
    }
