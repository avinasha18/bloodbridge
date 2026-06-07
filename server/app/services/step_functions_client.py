"""Step Functions / orchestrator client.

When `manual_outreach=True` (default), creating a request only moves it to
`matching` — the coordinator sends SMS from the admin UI.

When `manual_outreach=False`, the local simulator auto-texts donors in batches
with escalation (legacy demo mode).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    BloodRequest,
    EscalationEvent,
    FailureLog,
    OutreachLog,
)
from app.db.session import SessionLocal
from app.services.matcher import get_protocol_for, match_donors
from app.services.outreach_delivery import send_outreach_batch, _city

logger = logging.getLogger(__name__)

MAX_ESCALATIONS = 3


def _outreach_wait_seconds(req: BloodRequest, protocol) -> int:
    """How long to wait for donor YES before widening search.

    Production: hours from protocol (default 12h for urgent).
    Local quick demo: set OUTREACH_WAIT_DEMO_SECONDS=18 in .env.
    """
    demo = settings.outreach_wait_demo_seconds
    if demo is not None:
        return max(1, int(demo))

    base_h = float(
        protocol.escalation_wait_h
        if protocol and protocol.escalation_wait_h
        else settings.outreach_escalation_wait_hours_default
    )
    mult = {"critical": 0.5, "urgent": 1.0, "routine": 1.5}.get(
        (req.urgency or "routine").lower(), 1.0
    )
    return int(base_h * mult * 3600)


class OrchestratorClient:
    def __init__(self) -> None:
        self._client = None
        if not settings.use_aws_mocks and settings.step_functions_arn:
            try:
                from app.services.aws_boto import make_boto3_client

                self._client = make_boto3_client(
                    "stepfunctions",
                    settings.aws_region,
                    access_key_id=settings.aws_access_key_id or None,
                    secret_access_key=settings.aws_secret_access_key or None,
                    session_token=settings.aws_session_token or None,
                )
            except Exception as exc:
                logger.warning("Falling back to local orchestrator: %s", exc)

    def start_request_workflow(self, request_id: str) -> str:
        if self._client is not None and settings.step_functions_arn:
            resp = self._client.start_execution(
                stateMachineArn=settings.step_functions_arn,
                name=f"req-{request_id}-{int(time.time())}",
                input=json.dumps({"request_id": request_id}),
            )
            return resp.get("executionArn", "")
        t = threading.Thread(
            target=_local_orchestrator,
            args=(request_id,),
            daemon=True,
            name=f"bin-orch-{request_id[:8]}",
        )
        t.start()
        return f"local-thread:{t.name}"


_singleton: Optional[OrchestratorClient] = None


def get_orchestrator() -> OrchestratorClient:
    global _singleton
    if _singleton is None:
        _singleton = OrchestratorClient()
    return _singleton


def _local_orchestrator(request_id: str) -> None:
    if settings.manual_outreach:
        _local_orchestrator_match_only(request_id)
    else:
        _local_orchestrator_auto_outreach(request_id)


def _local_orchestrator_match_only(request_id: str) -> None:
    """Rank donors only — coordinator sends SMS manually from the UI."""
    db: Session = SessionLocal()
    try:
        req = db.query(BloodRequest).get(request_id)
        if not req:
            logger.warning("Orchestrator: request %s not found", request_id)
            return
        if req.status not in ("pending", "matching"):
            logger.info(
                "Orchestrator: request %s already %s, skipping", request_id, req.status
            )
            return
        req.status = "matching"
        db.commit()
        logger.info(
            "Request %s ready — coordinator sends SMS manually (batch=%s)",
            request_id,
            settings.outreach_batch_size,
        )
    finally:
        db.close()


def _local_orchestrator_auto_outreach(request_id: str) -> None:
    """Legacy: auto-send + escalate without coordinator action."""
    db: Session = SessionLocal()
    try:
        req = db.query(BloodRequest).get(request_id)
        if not req:
            logger.warning("Orchestrator: request %s not found", request_id)
            return
        if req.status not in ("pending", "matching"):
            logger.info(
                "Orchestrator: request %s already %s, skipping", request_id, req.status
            )
            return

        for level in range(MAX_ESCALATIONS + 1):
            req.escalation_level = level
            req.status = "matching"
            db.commit()

            protocol = get_protocol_for(db, req.blood_group, _city(req))
            radius = protocol.initial_radius_km + level * 10
            batch = protocol.initial_batch_size + level * 3

            exclude = [
                ol.donor_id
                for ol in db.query(OutreachLog).filter_by(request_id=req.id).all()
            ]
            matches = match_donors(
                db, req, radius_km=radius, batch_size=batch, exclude_donor_ids=exclude
            )
            if not matches:
                _log_failure(db, req, "no_donors", level)
                if level >= MAX_ESCALATIONS:
                    _mark_failed(db, req, "No eligible donors within max radius")
                    return
                _escalate(db, req, "no_eligible_donors", 0, radius)
                continue

            delivery = send_outreach_batch(db, req, matches, batch_number=level + 1)
            if delivery.sent_count == 0:
                logger.error(
                    "Outreach batch sent 0 SMS for request %s: %s",
                    request_id,
                    delivery.failed,
                )
                if level >= MAX_ESCALATIONS:
                    _mark_failed(
                        db,
                        req,
                        "SMS delivery failed — check AWS SNS permissions",
                    )
                    return
                _escalate(db, req, "sms_send_failed", 0, radius)
                continue

            req.status = "outreach_sent"
            db.commit()

            wait = _outreach_wait_seconds(req, protocol)
            logger.info(
                "Request %s outreach batch %s — waiting %s s (%.1f h) for donor replies",
                request_id,
                level + 1,
                wait,
                wait / 3600,
            )
            elapsed = 0
            slice_s = 1
            while elapsed < wait:
                time.sleep(slice_s)
                elapsed += slice_s
                db.refresh(req)
                if req.status == "reserved":
                    break

            db.refresh(req)
            if req.status in ("reserved", "confirmed", "fulfilled"):
                return

            if level >= MAX_ESCALATIONS:
                _log_failure(db, req, "all_declined_or_timeout", level)
                _mark_failed(db, req, "Exhausted all escalation levels")
                return
            _escalate(db, req, "timeout_or_decline", len(matches), radius)

        _mark_failed(db, req, "Exhausted all escalation levels")
    finally:
        db.close()


def _escalate(
    db: Session,
    req: BloodRequest,
    reason: str,
    donors_tried: int,
    radius: int,
) -> None:
    db.add(
        EscalationEvent(
            request_id=req.id,
            escalation_level=req.escalation_level + 1,
            trigger_reason=reason,
            donors_tried=donors_tried,
            expanded_radius_km=radius + 10,
        )
    )
    db.commit()


def _log_failure(
    db: Session, req: BloodRequest, failure_type: str, level: int
) -> None:
    db.add(
        FailureLog(
            request_id=req.id,
            blood_group=req.blood_group,
            city=_city(req),
            urgency=req.urgency,
            failure_type=failure_type,
            donors_contacted=db.query(OutreachLog)
            .filter_by(request_id=req.id)
            .count(),
            donors_responded=db.query(OutreachLog)
            .filter(
                OutreachLog.request_id == req.id, OutreachLog.response.isnot(None)
            )
            .count(),
            donors_accepted=db.query(OutreachLog)
            .filter_by(request_id=req.id, response="accept")
            .count(),
            resolution="escalated" if level < MAX_ESCALATIONS else "unresolved",
        )
    )
    db.commit()


def _mark_failed(db: Session, req: BloodRequest, reason: str) -> None:
    req.status = "failed"
    req.failed_at = datetime.utcnow()
    req.failure_reason = reason
    db.commit()
