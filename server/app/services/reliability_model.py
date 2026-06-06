"""Local RandomForest reliability scorer (no SageMaker).

Trains on `server/data/dataset.csv` using the feature set from the ML teammate:
  donations_till_date, frequency_in_days, cycle_of_donations, total_calls,
  calls_to_donations_ratio, donated_earlier, eligibility_status

Target: user_donation_active_status (Active=1, Inactive=0)
Output: P(Active) in [0, 1] — stored as `donors.reliability_score`.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Iterable, List, Optional, Sequence, Union

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

logger = logging.getLogger(__name__)

DEFAULT_RELIABILITY_SCORE = 0.5

FEATURE_COLUMNS = [
    "donations_till_date",
    "frequency_in_days",
    "cycle_of_donations",
    "total_calls",
    "calls_to_donations_ratio",
    "donated_earlier",
    "eligibility_status",
]

TARGET_COLUMN = "user_donation_active_status"

SERVER_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET_PATH = SERVER_ROOT / "data" / "dataset.csv"
DEFAULT_MODEL_PATH = SERVER_ROOT / "models" / "donor_reliability_model.pkl"
DEFAULT_SCORES_CSV_PATH = SERVER_ROOT / "models" / "donor_reliability_scores.csv"


def _normalize_donated_earlier(value: Any) -> Optional[str]:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    text = str(value).strip().lower()
    if text in {"yes", "true", "1", "y"}:
        return "Yes"
    if text in {"no", "false", "0", "n"}:
        return "No"
    return str(value)


def donor_to_feature_row(donor: Any) -> dict[str, Any]:
    """Map a Donor ORM object (or dict) to the model feature row."""
    if hasattr(donor, "__dict__") and not isinstance(donor, dict):
        get = lambda k, default=None: getattr(donor, k, default)
    else:
        get = lambda k, default=None: donor.get(k, default)

    donations = int(get("donations_till_date") or 0)
    donated_earlier = get("donated_earlier")
    if donated_earlier is None:
        donated_earlier = "Yes" if donations > 0 else "No"
    else:
        donated_earlier = _normalize_donated_earlier(donated_earlier)

    freq = get("frequency_in_days")
    if freq is not None:
        try:
            freq = float(freq)
            if np.isnan(freq):
                freq = np.nan
        except (TypeError, ValueError):
            freq = np.nan

    ratio = get("calls_to_donations_ratio")
    if ratio is not None:
        try:
            ratio = float(ratio)
        except (TypeError, ValueError):
            ratio = np.nan

    return {
        "donations_till_date": donations,
        "frequency_in_days": freq if freq is not None else np.nan,
        "cycle_of_donations": get("cycle_of_donations"),
        "total_calls": int(get("total_calls") or 0),
        "calls_to_donations_ratio": ratio if ratio is not None else np.nan,
        "donated_earlier": donated_earlier,
        "eligibility_status": get("eligibility_status") or "not eligible",
    }


def _build_preprocessor(
    X: pd.DataFrame,
) -> tuple[ColumnTransformer, list[str], list[str]]:
    categorical = X.select_dtypes(include=["object", "bool"]).columns.tolist()
    numerical = X.select_dtypes(include=["int64", "float64", "Int64"]).columns.tolist()

    preprocessor = ColumnTransformer(
        [
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median"))]),
                numerical,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical,
            ),
        ]
    )
    return preprocessor, numerical, categorical


def _build_pipeline(preprocessor: ColumnTransformer) -> Pipeline:
    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline([("preprocessor", preprocessor), ("model", model)])


def train_model(
    csv_path: Path | str = DEFAULT_DATASET_PATH,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    scores_csv_path: Path | str = DEFAULT_SCORES_CSV_PATH,
    *,
    test_size: float = 0.20,
    random_state: int = 42,
) -> dict[str, Any]:
    """Train the RandomForest pipeline and persist model + full-dataset scores."""
    csv_path = Path(csv_path)
    model_path = Path(model_path)
    scores_csv_path = Path(scores_csv_path)

    df = pd.read_csv(csv_path)
    df = df.dropna(subset=[TARGET_COLUMN])
    df[TARGET_COLUMN] = df[TARGET_COLUMN].map({"Active": 1, "Inactive": 0})

    features = [c for c in FEATURE_COLUMNS if c in df.columns]
    X = df[features].copy()
    y = df[TARGET_COLUMN]

    preprocessor, numerical, categorical = _build_preprocessor(X)
    pipeline = _build_pipeline(preprocessor)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, y_pred)),
        "roc_auc": float(roc_auc_score(y_test, y_prob)),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "classification_report": classification_report(y_test, y_pred, output_dict=True),
        "features_used": features,
        "train_rows": len(X_train),
        "test_rows": len(X_test),
    }

    reliability_scores = pipeline.predict_proba(X)[:, 1]
    results = df.copy()
    results["donor_reliability_score"] = (reliability_scores * 100).round(2)
    if "user_id" in df.columns:
        results["user_id"] = df["user_id"]

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "pipeline": pipeline,
            "feature_columns": features,
            "numerical_features": numerical,
            "categorical_features": categorical,
        },
        model_path,
    )
    results.to_csv(scores_csv_path, index=False)

    logger.info(
        "Reliability model trained: accuracy=%.3f roc_auc=%.3f → %s",
        metrics["accuracy"],
        metrics["roc_auc"],
        model_path,
    )
    return metrics


class ReliabilityScorer:
    """Loads the joblib pipeline and scores donors from ORM objects or dicts."""

    def __init__(self, model_path: Path | str = DEFAULT_MODEL_PATH) -> None:
        self.model_path = Path(model_path)
        self._artifact: Optional[dict[str, Any]] = None
        self._load()

    def _load(self) -> None:
        if not self.model_path.is_file():
            logger.warning("Reliability model not found at %s — using fallback", self.model_path)
            return
        try:
            self._artifact = joblib.load(self.model_path)
            logger.info("Loaded reliability model from %s", self.model_path)
        except Exception as exc:
            logger.warning("Failed to load reliability model: %s", exc)
            self._artifact = None

    @property
    def is_loaded(self) -> bool:
        return self._artifact is not None and "pipeline" in self._artifact

    @property
    def pipeline(self) -> Optional[Pipeline]:
        if not self._artifact:
            return None
        return self._artifact["pipeline"]

    @property
    def feature_columns(self) -> list[str]:
        if not self._artifact:
            return list(FEATURE_COLUMNS)
        return list(self._artifact.get("feature_columns") or FEATURE_COLUMNS)

    def score(self, donor: Any) -> float:
        """Return P(Active) in [0, 1]."""
        if not self.is_loaded:
            return DEFAULT_RELIABILITY_SCORE
        row = donor_to_feature_row(donor)
        X = pd.DataFrame([row])[self.feature_columns]
        try:
            prob = float(self.pipeline.predict_proba(X)[0, 1])
            return max(0.0, min(1.0, prob))
        except Exception as exc:
            logger.warning("Reliability scoring failed: %s", exc)
            return DEFAULT_RELIABILITY_SCORE

    def score_many(self, donors: Iterable[Any]) -> list[float]:
        donors_list = list(donors)
        if not donors_list or not self.is_loaded:
            return [DEFAULT_RELIABILITY_SCORE] * len(donors_list)

        rows = [donor_to_feature_row(d) for d in donors_list]
        X = pd.DataFrame(rows)[self.feature_columns]
        try:
            probs = self.pipeline.predict_proba(X)[:, 1]
            return [max(0.0, min(1.0, float(p))) for p in probs]
        except Exception as exc:
            logger.warning("Batch reliability scoring failed: %s", exc)
            return [DEFAULT_RELIABILITY_SCORE] * len(donors_list)


_scorer: Optional[ReliabilityScorer] = None


def get_reliability_scorer() -> ReliabilityScorer:
    global _scorer
    if _scorer is None:
        _scorer = ReliabilityScorer()
    return _scorer


def reset_reliability_scorer() -> None:
    """Force reload of the joblib model (e.g. after retraining)."""
    global _scorer
    _scorer = None


def compute_overall_score(ml_reliability: float, showup_rate: float) -> float:
    """Persisted donor quality: ML P(Active) + live show-up track record."""
    ml = max(0.0, min(1.0, float(ml_reliability or DEFAULT_RELIABILITY_SCORE)))
    show = max(0.0, min(1.0, float(showup_rate or DEFAULT_RELIABILITY_SCORE)))
    return round(0.50 * ml + 0.50 * show, 4)


def compute_final_rank_score(
    overall_score: float,
    *,
    proximity: float = 0.0,
    freshness: float = 0.0,
    scarcity: float = 0.0,
    urgency: str | None = None,
) -> float:
    """Request-specific rank used to pick the top-N donors for outreach."""
    overall = max(0.0, min(1.0, float(overall_score or DEFAULT_RELIABILITY_SCORE)))
    base = (
        0.60 * overall
        + 0.20 * max(0.0, min(1.0, proximity))
        + 0.10 * max(0.0, min(1.0, freshness))
        + 0.10 * max(0.0, min(1.0, scarcity))
    )
    mult = 1.0
    if urgency == "critical":
        mult = 1.10
    elif urgency == "urgent":
        mult = 1.05
    return round(base * mult, 4)


# Backward-compatible alias
combined_match_score = compute_final_rank_score
