#!/usr/bin/env python3
"""Sync four outreach sample profiles (one per segment) to coordinator test phones.

Usage (from server/):
  python scripts/setup_engagement_demo.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_ROOT))

from app.db.session import SessionLocal
from app.services.donor_engagement import prepare_outreach_samples


def main() -> None:
    db = SessionLocal()
    try:
        result = prepare_outreach_samples(db)
        print(json.dumps(result, indent=2, default=str))
    finally:
        db.close()


if __name__ == "__main__":
    main()
