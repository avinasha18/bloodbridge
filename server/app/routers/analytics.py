"""Analytics endpoints — dashboard, heatmap, reliability, failures."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import ProtocolUpdateLog
from app.schemas.request import (
    DashboardMetrics,
    FailureTrend,
    HeatmapPoint,
    ReliabilityBucket,
)
from app.services import analytics as svc

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardMetrics)
def dashboard(db: Session = Depends(get_db)):
    return svc.dashboard_metrics(db)


@router.get("/heatmap", response_model=List[HeatmapPoint])
def heatmap(blood_group: Optional[str] = None, db: Session = Depends(get_db)):
    return svc.heatmap_points(db, blood_group)


@router.get("/reliability", response_model=List[ReliabilityBucket])
def reliability(db: Session = Depends(get_db)):
    return svc.reliability_distribution(db)


@router.get("/failures", response_model=List[FailureTrend])
def failures(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db)):
    return svc.failure_trends(db, days)


@router.get("/response-trend")
def response_trend(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db)):
    return svc.response_rate_trend(db, days)


@router.get("/protocol-updates")
def protocol_updates(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = (
        db.query(ProtocolUpdateLog)
        .order_by(ProtocolUpdateLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "blood_group": r.blood_group,
            "city": r.city,
            "previous": r.previous_state,
            "new": r.new_state,
            "rationale": r.rationale,
            "updated_by": r.updated_by,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
