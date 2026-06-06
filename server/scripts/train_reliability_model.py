#!/usr/bin/env python3
"""Train the donor reliability RandomForest and sync scores to Postgres.

Usage (from server/):
  python scripts/train_reliability_model.py
  python scripts/train_reliability_model.py --no-db-sync
  python scripts/train_reliability_model.py --import-only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_ROOT))

from app.db.session import SessionLocal
from app.services.reliability_model import (
    DEFAULT_DATASET_PATH,
    DEFAULT_MODEL_PATH,
    DEFAULT_SCORES_CSV_PATH,
    train_model,
)
from app.services.reliability_service import import_scores_from_csv, train_and_sync_db


def main() -> None:
    parser = argparse.ArgumentParser(description="Train donor reliability model.")
    parser.add_argument("--csv", default=str(DEFAULT_DATASET_PATH))
    parser.add_argument("--model", default=str(DEFAULT_MODEL_PATH))
    parser.add_argument("--scores-csv", default=str(DEFAULT_SCORES_CSV_PATH))
    parser.add_argument("--no-db-sync", action="store_true", help="Train only; skip DB import")
    parser.add_argument(
        "--import-only",
        action="store_true",
        help="Import existing donor_reliability_scores.csv into DB",
    )
    args = parser.parse_args()

    if args.import_only:
        db = SessionLocal()
        try:
            result = import_scores_from_csv(db, args.scores_csv)
            print(json.dumps(result, indent=2))
        finally:
            db.close()
        return

    if args.no_db_sync:
        metrics = train_model(
            csv_path=args.csv,
            model_path=args.model,
            scores_csv_path=args.scores_csv,
        )
        print(json.dumps(metrics, indent=2, default=str))
        return

    db = SessionLocal()
    try:
        result = train_and_sync_db(
            db,
            csv_path=args.csv,
            model_path=args.model,
            scores_csv_path=args.scores_csv,
        )
        print(json.dumps(result, indent=2, default=str))
    finally:
        db.close()


if __name__ == "__main__":
    main()
