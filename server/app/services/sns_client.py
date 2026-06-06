"""SNS SMS for critical escalations.

In mock mode, "SMS" sends are appended to outbox/sms_log.jsonl.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

SMS_LOG = Path(__file__).resolve().parent.parent.parent / "outbox" / "sms_log.jsonl"


class SNSClient:
    def __init__(self) -> None:
        self._client = None
        if not settings.sns_mocks_enabled:
            try:
                from app.services.aws_boto import make_boto3_client

                self._client = make_boto3_client(
                    "sns",
                    settings.aws_region,
                    access_key_id=settings.aws_access_key_id or None,
                    secret_access_key=settings.aws_secret_access_key or None,
                    session_token=settings.aws_session_token or None,
                )
            except Exception as exc:
                logger.warning("Falling back to mock SNS: %s", exc)

    def send_sms(self, phone: str, message: str) -> str:
        dest = phone
        if settings.sms_override_phone:
            dest = settings.sms_override_phone.strip()
            if dest != phone:
                logger.info("SMS override: %s → %s", phone, dest)
        if self._client is None:
            return self._mock(dest, message)
        resp = self._client.publish(
            PhoneNumber=dest,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"}
            },
        )
        msg_id = resp.get("MessageId", "sns-unknown")
        logger.info("SNS publish OK → %s (id=%s, %d chars)", dest, msg_id, len(message))
        return msg_id

    def _mock(self, phone: str, message: str) -> str:
        SMS_LOG.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "phone": phone,
            "message": message,
        }
        with SMS_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        logger.info("[MOCK SNS] %s -> %s", phone, message[:80])
        return f"mock-sms-{datetime.utcnow().timestamp()}"


_singleton: Optional[SNSClient] = None


def get_sns_client() -> SNSClient:
    global _singleton
    if _singleton is None:
        _singleton = SNSClient()
    return _singleton
