"""Send one real test SMS via AWS SNS.

Usage (from server/ with venv active):
  python scripts/send_test_sms.py +917386223111
  python scripts/send_test_sms.py   # defaults to first DEMO phone

Requires in .env:
  SNS_USE_MOCKS=false
  AWS credentials configured (aws configure / env vars)
  Phone verified in SNS SMS sandbox (if account is still in sandbox)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.services.sns_client import get_sns_client

DEFAULT_PHONE = "+917386223111"


def main() -> None:
    phone = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PHONE
    if settings.sns_mocks_enabled:
        print("ERROR: SNS_USE_MOCKS is still true — set SNS_USE_MOCKS=false in .env")
        sys.exit(1)

    body = (
        "BloodBridge test SMS. If you received this, AWS SNS is working. "
        "-Blood Warriors"
    )
    print(f"Region: {settings.aws_region}")
    print(f"Sending to {phone} …")
    msg_id = get_sns_client().send_sms(phone, body)
    print(f"OK — MessageId: {msg_id}")
    print("\nIf nothing arrives within 1–2 min:")
    print("  1. AWS Console → SNS → Text messaging → verify this number (sandbox)")
    print("  2. Check SMS spend limit is > $0")
    print("  3. India: may need DLT-approved sender ID / template")


if __name__ == "__main__":
    main()
