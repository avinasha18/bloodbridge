"""Build a clear SMS timeline for the admin UI + log follow-up texts."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, OutreachLog

# Plain-language labels for coordinators
SMS_KIND_LABELS = {
    "outreach_request": "Blood need — reply YES or NO",
    "assigned_confirmation": "Thank you — you are the main donor",
    "standby_notice": "On backup list (someone else assigned first)",
    "standby_promotion": "Promoted from backup — can you still donate?",
    "location": "Hospital address + Google Maps link",
    "pre_confirmation": "Day-before reminder — still coming?",
}


def ensure_message_kind_column() -> None:
    """Add message_kind to existing RDS tables (create_all skips new columns)."""
    from sqlalchemy import text

    from app.db.session import engine

    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE outreach_logs "
                "ADD COLUMN IF NOT EXISTS message_kind VARCHAR(40) "
                "DEFAULT 'outreach_request'"
            )
        )


def record_followup_sms(
    db: Session,
    *,
    request_id: str,
    donor_id: str,
    message_kind: str,
    message_id: Optional[str],
    sent_at: Optional[datetime] = None,
) -> OutreachLog:
    """Log coordinator / system follow-up SMS (location, confirmation, etc.)."""
    log = OutreachLog(
        request_id=request_id,
        donor_id=donor_id,
        channel="sms",
        message_id=message_id,
        message_kind=message_kind,
        batch_number=0,
        sent_at=sent_at or datetime.utcnow(),
    )
    db.add(log)
    db.flush()
    return log


def _donor_label(donor: Optional[Donor]) -> tuple[Optional[str], Optional[str]]:
    if not donor:
        return None, None
    return donor.name, donor.phone


def _response_label(log: OutreachLog, kind: str) -> Optional[str]:
    if kind == "outreach_request":
        if log.response == "accept":
            if log.assignment_role == "assigned":
                return "Donor replied YES — assigned as main donor"
            if log.assignment_role == "standby":
                rank = log.standby_rank or "?"
                return f"Donor replied YES — on backup list (#{rank})"
            return "Donor replied YES"
        if log.response == "decline":
            return "Donor replied NO"
        return "Waiting for donor to reply"
    if kind == "pre_confirmation":
        if log.confirmation_response == "confirmed":
            return "Donor confirmed for donation day"
        if log.confirmation_response == "cancelled":
            return "Donor cancelled before donation"
        return "Waiting for day-before reply"
    if kind in ("location", "assigned_confirmation", "standby_notice", "standby_promotion"):
        return "Delivered to donor's phone"
    return None


def build_sms_timeline(db: Session, req: BloodRequest) -> List[dict]:
    """SMS history for one blood need only — one outreach row per donor (latest)."""
    items: List[dict] = []
    has_location_log = False

    logs = [log for log in req.outreach_logs if log.request_id == req.id]

    # Keep only the latest initial outreach per donor (escalation/reminders
    # can create multiple outreach_request rows for the same person).
    outreach_by_donor: dict[str, OutreachLog] = {}
    follow_up_logs: list[OutreachLog] = []
    for log in logs:
        kind = getattr(log, "message_kind", None) or "outreach_request"
        if kind == "outreach_request":
            prev = outreach_by_donor.get(log.donor_id)
            if prev is None or (log.sent_at or datetime.min) > (prev.sent_at or datetime.min):
                outreach_by_donor[log.donor_id] = log
        else:
            follow_up_logs.append(log)

    display_logs = list(outreach_by_donor.values()) + follow_up_logs

    for log in display_logs:
        donor = log.donor or db.query(Donor).get(log.donor_id)
        kind = getattr(log, "message_kind", None) or "outreach_request"
        if kind == "location":
            has_location_log = True
        name, phone = _donor_label(donor)
        batch = int(log.batch_number or 0)
        title = SMS_KIND_LABELS.get(kind, kind.replace("_", " ").title())
        if kind == "outreach_request" and batch > 1:
            title = f"{title} (wider search · batch {batch})"
        items.append(
            {
                "id": log.id,
                "message_kind": kind,
                "title": title,
                "donor_id": log.donor_id,
                "donor_name": name,
                "donor_phone": phone,
                "sent_at": log.sent_at,
                "responded_at": log.responded_at,
                "response_label": _response_label(log, kind),
                "distance_km": float(log.distance_km) if log.distance_km is not None else None,
                "batch_number": batch,
            }
        )
        # Legacy: day-before SMS tracked on the original outreach row
        if (
            kind == "outreach_request"
            and log.confirmation_sent_at
            and not any(
                getattr(l, "message_kind", None) == "pre_confirmation"
                and l.donor_id == log.donor_id
                for l in logs
            )
        ):
            items.append(
                {
                    "id": f"legacy-preconfirm-{log.id}",
                    "message_kind": "pre_confirmation",
                    "title": SMS_KIND_LABELS["pre_confirmation"],
                    "donor_id": log.donor_id,
                    "donor_name": name,
                    "donor_phone": phone,
                    "sent_at": log.confirmation_sent_at,
                    "responded_at": log.confirmation_response_at,
                    "response_label": _response_label(log, "pre_confirmation"),
                    "distance_km": None,
                    "batch_number": 0,
                }
            )

    # Older requests: location was sent but never logged as its own row
    if req.location_sent_at and not has_location_log and req.assigned_donor_id:
        donor = db.query(Donor).get(req.assigned_donor_id)
        name, phone = _donor_label(donor)
        items.append(
            {
                "id": f"legacy-location-{req.id}",
                "message_kind": "location",
                "title": SMS_KIND_LABELS["location"],
                "donor_id": req.assigned_donor_id,
                "donor_name": name,
                "donor_phone": phone,
                "sent_at": req.location_sent_at,
                "responded_at": None,
                "response_label": "Delivered to donor's phone",
                "distance_km": None,
                "batch_number": 0,
            }
        )

    items.sort(key=lambda x: x["sent_at"] or datetime.min, reverse=True)
    return items
