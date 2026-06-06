"""bin-failure-analyzer

Runs daily at 2 AM (EventBridge cron). For each (blood_group, city) that
has failed requests in the last 7 days, asks Bedrock to propose updated
matching parameters, then writes them to `system_protocols` plus a
`protocol_update_logs` row for audit.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Dict, List

from sqlalchemy.orm import Session

from app.db.models import (
    FailureLog,
    ProtocolUpdateLog,
    SystemProtocol,
)
from app.db.session import SessionLocal
from app.services.bedrock_client import get_bedrock_client

logger = logging.getLogger(__name__)


def run(db: Session, lookback_days: int = 7) -> Dict:
    cutoff = datetime.utcnow() - timedelta(days=lookback_days)
    failures = db.query(FailureLog).filter(FailureLog.logged_at >= cutoff).all()

    grouped = defaultdict(list)
    for f in failures:
        key = (f.blood_group or "Unknown", f.city or "Default")
        grouped[key].append(f)

    bedrock = get_bedrock_client()
    updates: List[Dict] = []

    for (blood_group, city), entries in grouped.items():
        if blood_group == "Unknown":
            continue
        protocol = (
            db.query(SystemProtocol)
            .filter(SystemProtocol.blood_group == blood_group, SystemProtocol.city == city)
            .first()
        )
        if not protocol:
            protocol = (
                db.query(SystemProtocol)
                .filter(SystemProtocol.blood_group == blood_group)
                .first()
            )
        if not protocol:
            continue

        prev_state = {
            "initial_batch_size": protocol.initial_batch_size,
            "initial_radius_km": protocol.initial_radius_km,
            "proactive_days_ahead": protocol.proactive_days_ahead,
        }

        failure_types = Counter(e.failure_type or "unknown" for e in entries)
        avg_contacted = (
            sum((e.donors_contacted or 0) for e in entries) / max(len(entries), 1)
        )
        summary = {
            "count": len(entries),
            "top_failure_type": failure_types.most_common(1)[0][0],
            "avg_donors_to_success": round(avg_contacted, 2),
            "failure_types": dict(failure_types),
        }
        suggestion = bedrock.suggest_protocol_update(
            blood_group=blood_group,
            city=city,
            failures_summary=summary,
            current_protocol=prev_state,
        )

        new_batch = int(suggestion.get("batch_size", protocol.initial_batch_size))
        new_radius = int(suggestion.get("radius_km", protocol.initial_radius_km))
        new_days = int(suggestion.get("proactive_days_ahead", protocol.proactive_days_ahead))

        if (
            new_batch == protocol.initial_batch_size
            and new_radius == protocol.initial_radius_km
            and new_days == protocol.proactive_days_ahead
        ):
            continue

        protocol.initial_batch_size = new_batch
        protocol.initial_radius_km = new_radius
        protocol.proactive_days_ahead = new_days
        protocol.last_updated_by = "bedrock-analyzer"
        protocol.update_reason = suggestion.get("rationale")

        new_state = {
            "initial_batch_size": new_batch,
            "initial_radius_km": new_radius,
            "proactive_days_ahead": new_days,
        }

        db.add(
            ProtocolUpdateLog(
                blood_group=blood_group,
                city=city,
                previous_state=prev_state,
                new_state=new_state,
                rationale=suggestion.get("rationale"),
                updated_by="bedrock-analyzer",
            )
        )

        updates.append(
            {
                "blood_group": blood_group,
                "city": city,
                "previous": prev_state,
                "new": new_state,
                "rationale": suggestion.get("rationale"),
            }
        )

    db.commit()
    return {
        "lookback_days": lookback_days,
        "groups_analyzed": len(grouped),
        "updates_applied": updates,
    }


def handler(event, context):  # noqa: ARG001
    db = SessionLocal()
    try:
        return run(db, lookback_days=event.get("lookback_days", 7) if event else 7)
    finally:
        db.close()
