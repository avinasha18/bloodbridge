"""AWS SNS SMS delivery diagnostics for coordinators."""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


def get_sms_diagnostics() -> dict[str, Any]:
    """Return SNS sandbox status, verified numbers, and spend limit."""
    if settings.sns_mocks_enabled:
        return {
            "mode": "mock",
            "delivers_to_phone": False,
            "sandbox": False,
            "verified_phones": [],
            "monthly_spend_limit_usd": None,
            "demo_donor_phones": settings.demo_donor_phones_list,
            "override_phone": settings.sms_override_phone or None,
            "hint": "SNS_USE_MOCKS=true — SMS are logged to server/outbox/, not sent to phones.",
        }

    try:
        from app.services.aws_boto import make_boto3_client

        sns = make_boto3_client(
            "sns",
            settings.aws_region,
            access_key_id=settings.aws_access_key_id or None,
            secret_access_key=settings.aws_secret_access_key or None,
            session_token=settings.aws_session_token or None,
        )
        attrs = sns.get_sms_attributes()
        a = attrs.get("attributes") or {}
        sandbox = sns.get_sms_sandbox_account_status()
        in_sandbox = bool(sandbox.get("IsInSandbox"))

        verified: list[str] = []
        if in_sandbox:
            resp = sns.list_sms_sandbox_phone_numbers()
            verified = [
                row["PhoneNumber"]
                for row in resp.get("PhoneNumbers", [])
                if row.get("Status") == "Verified"
            ]

        limit = a.get("MonthlySpendLimit")
        hint_parts = []
        if in_sandbox:
            hint_parts.append(
                "AWS SNS is in SANDBOX — SMS only arrive on verified numbers listed below."
            )
        if limit == "1":
            hint_parts.append(
                "Monthly SMS spend limit is $1 — raise it in AWS SNS console if sends stop."
            )
        if settings.sms_override_phone:
            hint_parts.append(
                f"All SMS redirected to {settings.sms_override_phone} (SMS_OVERRIDE_PHONE)."
            )
        else:
            hint_parts.append(
                "Outreach texts demo donor phones from seed data, not your personal number "
                "unless that donor phone matches yours."
            )

        return {
            "mode": "aws_sns",
            "delivers_to_phone": True,
            "sandbox": in_sandbox,
            "verified_phones": verified,
            "monthly_spend_limit_usd": limit,
            "demo_donor_phones": settings.demo_donor_phones_list,
            "override_phone": settings.sms_override_phone or None,
            "hint": " ".join(hint_parts),
        }
    except Exception as exc:
        logger.warning("SMS diagnostics failed: %s", exc)
        return {
            "mode": "error",
            "delivers_to_phone": False,
            "sandbox": None,
            "verified_phones": [],
            "error": str(exc),
            "demo_donor_phones": settings.demo_donor_phones_list,
            "override_phone": settings.sms_override_phone or None,
            "hint": "Could not reach AWS SNS — check AWS credentials in server/.env",
        }
