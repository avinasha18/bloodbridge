"""Persist ML reliability scores to the database."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Donor
from app.services.reliability_model import (
    DEFAULT_MODEL_PATH,
    DEFAULT_SCORES_CSV_PATH,
    compute_overall_score,
    get_reliability_scorer,
    reset_reliability_scorer,
    train_model,
)

logger = logging.getLogger(__name__)


def ensure_overall_score_column() -> None:
    """Add overall_score to existing tables (create_all skips new columns)."""
    from sqlalchemy import inspect, text

    from app.db.session import engine

    insp = inspect(engine)
    if "donors" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("donors")}
    if "overall_score" in cols:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE donors "
                "ADD COLUMN overall_score NUMERIC(5, 4) DEFAULT 0.5"
            )
        )


def refresh_donor_score(donor: Donor, *, commit: bool = False, db: Optional[Session] = None) -> float:
    """Recompute ML reliability + combined overall score for one donor."""
    scorer = get_reliability_scorer()
    score = scorer.score(donor)
    donor.reliability_score = round(score, 4)
    donor.overall_score = compute_overall_score(score, float(donor.showup_rate or 0.5))
    if commit and db is not None:
        db.commit()
    return score


def refresh_all_donor_scores(db: Session, *, batch_size: int = 1000) -> dict[str, Any]:
    """Batch-rescore every donor using the loaded model."""
    scorer = get_reliability_scorer()
    if not scorer.is_loaded:
        return {"status": "error", "reason": "model_not_loaded"}

    updated = 0
    offset = 0
    while True:
        donors = (
            db.query(
                Donor.id,
                Donor.donations_till_date,
                Donor.cycle_of_donations,
                Donor.total_calls,
                Donor.calls_to_donations_ratio,
                Donor.eligibility_status,
                Donor.user_donation_active_status,
                Donor.showup_rate,
            )
            .order_by(Donor.id)
            .offset(offset)
            .limit(batch_size)
            .all()
        )
        if not donors:
            break

        rows: list[tuple[str, dict, float]] = []
        for row in donors:
            feature_row = {
                "donations_till_date": row.donations_till_date,
                "cycle_of_donations": row.cycle_of_donations,
                "total_calls": row.total_calls,
                "calls_to_donations_ratio": row.calls_to_donations_ratio,
                "eligibility_status": row.eligibility_status,
                "user_donation_active_status": row.user_donation_active_status,
            }
            rows.append((row.id, feature_row, float(row.showup_rate or 0.5)))

        scores = scorer.score_many([r for _, r, _ in rows])
        db.bulk_update_mappings(
            Donor,
            [
                {
                    "id": donor_id,
                    "reliability_score": round(score, 4),
                    "overall_score": compute_overall_score(score, showup),
                }
                for (donor_id, _, showup), score in zip(rows, scores)
            ],
        )
        db.commit()
        updated += len(rows)
        offset += batch_size

    return {"status": "ok", "updated": updated}


def import_scores_from_csv(
    db: Session,
    csv_path: Path | str = DEFAULT_SCORES_CSV_PATH,
    *,
    user_id_column: str = "user_id",
    score_column: str = "donor_reliability_score",
) -> dict[str, Any]:
    """Import precomputed scores (0–100 scale in CSV → 0–1 in DB)."""
    csv_path = Path(csv_path)
    if not csv_path.is_file():
        return {"status": "error", "reason": "csv_not_found", "path": str(csv_path)}

    df = pd.read_csv(csv_path)
    if user_id_column not in df.columns or score_column not in df.columns:
        return {
            "status": "error",
            "reason": "missing_columns",
            "columns": list(df.columns),
        }

    score_by_uid: dict[str, float] = {}
    for _, row in df.iterrows():
        uid = str(row[user_id_column]).strip()
        if not uid or uid.lower() == "nan":
            continue
        raw = float(row[score_column])
        score_by_uid[uid] = round(raw / 100.0 if raw > 1.0 else raw, 4)

    donors = (
        db.query(Donor)
        .filter(Donor.external_user_id.in_(list(score_by_uid.keys())))
        .all()
    )
    updated = 0
    for donor in donors:
        uid = donor.external_user_id
        if uid in score_by_uid:
            donor.reliability_score = score_by_uid[uid]
            donor.overall_score = compute_overall_score(
                score_by_uid[uid], float(donor.showup_rate or 0.5)
            )
            updated += 1

    db.commit()
    missing = len(score_by_uid) - updated
    return {"status": "ok", "updated": updated, "missing_donors": missing}


def sync_overall_scores(db: Session) -> dict[str, Any]:
    """Recompute overall_score for every donor from stored ML + show-up fields."""
    from sqlalchemy import text

    # Single UPDATE — avoids long idle-in-transaction sessions on large tables.
    result = db.execute(
        text(
            """
            UPDATE donors
            SET overall_score = ROUND(
                (COALESCE(reliability_score, 0.5) + COALESCE(showup_rate, 0.5)) / 2.0,
                4
            ),
            updated_at = now()
            """
        )
    )
    db.commit()
    updated = int(result.rowcount or 0)
    return {"status": "ok", "updated": updated}


def train_and_sync_db(
    db: Session,
    *,
    csv_path: Optional[Path | str] = None,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    scores_csv_path: Path | str = DEFAULT_SCORES_CSV_PATH,
) -> dict[str, Any]:
    """Train model from dataset, then import scores into donors table."""
    from app.services.reliability_model import DEFAULT_DATASET_PATH

    metrics = train_model(
        csv_path=csv_path or DEFAULT_DATASET_PATH,
        model_path=model_path,
        scores_csv_path=scores_csv_path,
    )
    reset_reliability_scorer()

    import_result = refresh_all_donor_scores(db)
    return {
        "training": metrics,
        "sync": import_result,
    }
