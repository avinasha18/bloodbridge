"""Reliability scoring — delegates to the local RandomForest model.

SageMaker is no longer required. The matcher and score updater use
`get_reliability_scorer()` from `reliability_model`.
"""

from __future__ import annotations

from app.services.reliability_model import (
    DEFAULT_RELIABILITY_SCORE,
    get_reliability_scorer,
)


def get_sagemaker_client():
    """Backward-compatible alias — returns the local ML scorer."""
    return get_reliability_scorer()


# Re-export for existing imports
__all__ = ["DEFAULT_RELIABILITY_SCORE", "get_reliability_scorer", "get_sagemaker_client"]
