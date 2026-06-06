"""Process inbound Twilio WhatsApp replies (YES / NO / STOP / MAYBE).

Priority:
  1. Open blood-request outreach (OutreachLog with no response) → record_yes / record_no
  2. Recent engagement WhatsApp (DonorEngagementLog) → update reply status on donor profile
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, DonorEngagementLog, OutreachLog
from app.services import reservation
from app.services.donation_fulfillment import auto_fulfill_confirmation, no_match_reply_text
from app.services.twilio_whatsapp import classify_response, send_whatsapp

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str) -> str:
    p = (phone or "").strip().replace("whatsapp:", "").replace(" ", "")
    if not p.startswith("+"):
        digits = re.sub(r"\D", "", p)
        if len(digits) == 10:
            return "+91" + digits
        if len(digits) > 10:
            return "+" + digits
    return p


def find_donor_by_phone(db: Session, phone: str) -> Optional[Donor]:
    target = _normalize_phone(phone)
    target_tail = re.sub(r"\D", "", target)[-10:]
    if not target_tail:
        return None

    candidates = (
        db.query(Donor)
        .filter(Donor.phone.isnot(None))
        .order_by(Donor.updated_at.desc())
        .limit(500)
        .all()
    )
    for d in candidates:
        raw = _normalize_phone(d.phone or "")
        if raw == target:
            return d
        if re.sub(r"\D", "", raw)[-10:] == target_tail:
            return d
    return None


def _pending_outreach(db: Session, donor_id: str) -> Optional[OutreachLog]:
    """Most recent SMS/blood-request outreach awaiting a response."""
    return (
        db.query(OutreachLog)
        .filter(
            OutreachLog.donor_id == donor_id,
            OutreachLog.response.is_(None),
            OutreachLog.sent_at >= datetime.utcnow() - timedelta(days=14),
        )
        .order_by(OutreachLog.sent_at.desc())
        .first()
    )


def _latest_engagement_outbound(db: Session, donor_id: str) -> Optional[DonorEngagementLog]:
    return (
        db.query(DonorEngagementLog)
        .filter(
            DonorEngagementLog.donor_id == donor_id,
            DonorEngagementLog.channel == "whatsapp",
            DonorEngagementLog.generated_by == "bedrock",
        )
        .order_by(DonorEngagementLog.sent_at.desc())
        .first()
    )


def _ack_message(
    intent: Optional[str],
    *,
    context: str,
    fulfillment: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    if intent == "STOP":
        return (
            "You've been unsubscribed from Blood Warriors messages. "
            "Reply START to opt back in."
        )
    if intent == "CONFIRMED" and fulfillment and fulfillment.get("location_sent"):
        hospital = fulfillment.get("hospital_name") or "the hospital"
        when = fulfillment.get("when") or "soon"
        return (
            f"You're all set! Visit {hospital} on {when}. "
            "Check the message above for the map link."
        )
    if intent == "CONFIRMED" and fulfillment and fulfillment.get("reason") == "no_open_request":
        return None  # no_match_reply_text sent separately if needed
    if intent == "CONFIRMED" and context == "outreach":
        return (
            "Thank you! You're confirmed for this blood need. "
            "Our coordinator will share hospital details shortly."
        )
    if intent == "CONFIRMED":
        return (
            "Thank you! We've noted you're ready to donate. "
            "A coordinator will match you to the next open need."
        )
    if intent == "DECLINED" and context == "outreach":
        return "Got it — marked unavailable for this request. Thank you for responding."
    if intent == "DECLINED":
        return "Understood. We'll contact you less often. Reply YES anytime when you're ready."
    if intent == "MAYBE":
        return "Thanks — we'll follow up later. Reply YES when you're ready to donate."
    return (
        "Reply YES if you're ready to donate, NO if not available, "
        "or STOP to unsubscribe."
    )


def handle_whatsapp_reply(
    db: Session,
    *,
    from_phone: str,
    body: str,
    message_sid: str = "",
    profile_name: str = "",
) -> Dict[str, Any]:
    """Classify reply, update DB status, return summary for logging/UI."""
    intent = classify_response(body)
    donor = find_donor_by_phone(db, from_phone)

    result: Dict[str, Any] = {
        "from_phone": _normalize_phone(from_phone),
        "message": body,
        "intent": intent,
        "donor_id": donor.id if donor else None,
        "donor_name": donor.name if donor else profile_name or None,
        "context": None,
        "outreach_updated": False,
        "engagement_updated": False,
        "request_id": None,
        "assignment_status": None,
    }

    # Inbound audit row (always)
    inbound = DonorEngagementLog(
        donor_id=donor.id if donor else "unknown",
        segment="reply",
        channel="whatsapp_inbound",
        message=(body or "").strip() or "(empty)",
        rationale=f"WhatsApp reply → {intent or 'unknown'}",
        message_id=message_sid or None,
        status=(intent or "unknown").lower(),
        generated_by="donor",
        sent_at=datetime.utcnow(),
    )
    db.add(inbound)

    if not donor:
        db.commit()
        result["reply_text"] = _ack_message(intent, context="engagement")
        return result

    # START re-subscribe
    if body and body.strip().upper() in {"START", "UNSTOP", "SUBSCRIBE"}:
        donor.consent_given = True
        db.commit()
        result["intent"] = "START"
        result["reply_text"] = "Welcome back! You're subscribed to Blood Warriors updates again."
        return result

    if intent == "STOP":
        donor.consent_given = False
        db.commit()
        result["reply_text"] = _ack_message("STOP", context="engagement")
        return result

    pending = _pending_outreach(db, donor.id)
    if pending and intent in ("CONFIRMED", "DECLINED"):
        result["context"] = "outreach"
        result["request_id"] = pending.request_id
        fulfillment = None
        if intent == "CONFIRMED":
            out = reservation.record_yes(db, pending)
            result["assignment_status"] = out.get("status")
            result["outreach_updated"] = True
            if out.get("status") == "assigned":
                req = db.query(BloodRequest).get(pending.request_id)
                fulfillment = auto_fulfill_confirmation(
                    db,
                    donor,
                    request=req,
                    outreach_log=pending,
                    assignment_status="assigned",
                    commit=True,
                )
                result["fulfillment"] = fulfillment
        else:
            reservation.record_no(db, pending)
            result["outreach_updated"] = True
        # Mirror on latest engagement outbound if any
        eng = _latest_engagement_outbound(db, donor.id)
        if eng:
            eng.status = "confirmed" if intent == "CONFIRMED" else "declined"
            eng.rationale = (eng.rationale or "") + f" · WhatsApp reply: {intent}"
            if fulfillment and fulfillment.get("request_id"):
                eng.rationale += f" · location sent req={fulfillment['request_id']}"
        db.commit()
        result["reply_text"] = _ack_message(
            intent, context="outreach", fulfillment=fulfillment
        )
        return result

    # Engagement-only reply (retention agent)
    if intent in ("CONFIRMED", "DECLINED", "MAYBE"):
        result["context"] = "engagement"
        eng = _latest_engagement_outbound(db, donor.id)
        if eng:
            status_map = {
                "CONFIRMED": "confirmed",
                "DECLINED": "declined",
                "MAYBE": "maybe",
            }
            eng.status = status_map[intent]
            eng.rationale = (eng.rationale or "") + f" · Donor replied {body.strip().upper()}"
            result["engagement_updated"] = True

        fulfillment = None
        if intent == "CONFIRMED":
            donor.user_donation_active_status = "Active"
            donor.last_contacted_date = datetime.utcnow().date()
            fulfillment = auto_fulfill_confirmation(
                db, donor, commit=False
            )
            result["fulfillment"] = fulfillment
            if eng and fulfillment and fulfillment.get("request_id"):
                eng.rationale = (
                    (eng.rationale or "")
                    + f" · Auto-matched req={fulfillment['request_id']}"
                )
        elif intent == "DECLINED":
            donor.user_donation_active_status = "Inactive"
            donor.inactive_trigger_comment = "Declined via WhatsApp engagement reply"

        db.commit()
        if intent == "CONFIRMED" and fulfillment:
            if fulfillment.get("location_sent"):
                result["reply_text"] = _ack_message(
                    intent, context="engagement", fulfillment=fulfillment
                )
            elif fulfillment.get("reason") == "no_open_request":
                result["reply_text"] = no_match_reply_text(donor)
            else:
                result["reply_text"] = _ack_message(intent, context="engagement")
        else:
            result["reply_text"] = _ack_message(intent, context="engagement")
        return result

    db.commit()
    result["reply_text"] = _ack_message(None, context="engagement")
    return result


def send_reply_ack(to_phone: str, text: Optional[str]) -> None:
    if text:
        send_whatsapp(to_phone, text, kind="engagement_reply_ack")
