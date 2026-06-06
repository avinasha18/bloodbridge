"""Analytics aggregation queries for the admin dashboard."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, List

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db.models import (
    BloodRequest,
    Donor,
    FailureLog,
    OutreachLog,
    Patient,
)

CRITICAL_THRESHOLD = {
    "O Negative": 150,
    "B Negative": 100,
    "A Negative": 60,
    "AB Negative": 30,
}


def dashboard_metrics(db: Session) -> Dict:
    today = date.today()
    seven_days = today + timedelta(days=7)

    total_donors = db.query(func.count(Donor.id)).scalar() or 0
    eligible_donors = (
        db.query(func.count(Donor.id))
        .filter(Donor.eligibility_status == "eligible")
        .scalar()
        or 0
    )
    active_donors = (
        db.query(func.count(Donor.id))
        .filter(Donor.user_donation_active_status == "Active")
        .scalar()
        or 0
    )
    at_risk_donors = (
        db.query(func.count(Donor.id))
        .filter(Donor.calls_to_donations_ratio > 3.0)
        .scalar()
        or 0
    )
    total_patients = db.query(func.count(Patient.id)).scalar() or 0
    upcoming = (
        db.query(func.count(Patient.id))
        .filter(
            Patient.expected_next_transfusion_date.isnot(None),
            Patient.expected_next_transfusion_date >= today,
            Patient.expected_next_transfusion_date <= seven_days,
        )
        .scalar()
        or 0
    )
    active_requests = (
        db.query(func.count(BloodRequest.id))
        .filter(BloodRequest.status.in_(["pending", "matching", "outreach_sent"]))
        .scalar()
        or 0
    )
    requests_today = (
        db.query(func.count(BloodRequest.id))
        .filter(func.date(BloodRequest.created_at) == today)
        .scalar()
        or 0
    )
    fulfilled_today = (
        db.query(func.count(BloodRequest.id))
        .filter(
            BloodRequest.status == "fulfilled",
            func.date(BloodRequest.fulfilled_at) == today,
        )
        .scalar()
        or 0
    )

    # Avg fulfillment hours over the last 7 days
    cutoff = datetime.utcnow() - timedelta(days=7)
    fulfillment_rows = (
        db.query(BloodRequest.created_at, BloodRequest.fulfilled_at)
        .filter(
            BloodRequest.status == "fulfilled",
            BloodRequest.fulfilled_at.isnot(None),
            BloodRequest.fulfilled_at >= cutoff,
        )
        .all()
    )
    avg_hours = None
    if fulfillment_rows:
        deltas = [
            (f - c).total_seconds() / 3600
            for c, f in fulfillment_rows
            if c and f and f > c
        ]
        if deltas:
            avg_hours = round(sum(deltas) / len(deltas), 2)

    # Response rate over last 7 days
    sent_recent = (
        db.query(func.count(OutreachLog.id))
        .filter(OutreachLog.sent_at >= cutoff)
        .scalar()
        or 0
    )
    responded_recent = (
        db.query(func.count(OutreachLog.id))
        .filter(OutreachLog.sent_at >= cutoff, OutreachLog.response.isnot(None))
        .scalar()
        or 0
    )
    response_rate = round(responded_recent / sent_recent, 4) if sent_recent else None

    blood_supply = blood_group_supply(db)
    critical_shortages = [
        bg for bg, count in blood_supply.items() if count < CRITICAL_THRESHOLD.get(bg, 50)
    ]

    return {
        "total_donors": total_donors,
        "eligible_donors": eligible_donors,
        "active_donors": active_donors,
        "at_risk_donors": at_risk_donors,
        "total_patients": total_patients,
        "upcoming_transfusions_7d": upcoming,
        "active_requests": active_requests,
        "requests_today": requests_today,
        "fulfilled_today": fulfilled_today,
        "avg_fulfillment_hours": avg_hours,
        "response_rate_7d": response_rate,
        "blood_supply": blood_supply,
        "critical_shortages": critical_shortages,
    }


def blood_group_supply(db: Session) -> Dict[str, int]:
    rows = (
        db.query(Donor.blood_group, func.count(Donor.id))
        .filter(Donor.eligibility_status == "eligible")
        .group_by(Donor.blood_group)
        .all()
    )
    return {bg or "Unknown": int(c) for bg, c in rows}


def reliability_distribution(db: Session) -> List[Dict]:
    buckets = [
        ("high", "0.70-1.00", 0.70, 1.01),
        ("medium", "0.40-0.70", 0.40, 0.70),
        ("low", "0.00-0.40", 0.0, 0.40),
    ]
    out = []
    for name, label, lo, hi in buckets:
        c = (
            db.query(func.count(Donor.id))
            .filter(Donor.reliability_score >= lo, Donor.reliability_score < hi)
            .scalar()
            or 0
        )
        out.append({"bucket": name, "range": label, "count": int(c)})
    return out


def failure_trends(db: Session, days: int = 14) -> List[Dict]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(FailureLog.logged_at).label("date"),
            FailureLog.blood_group,
            FailureLog.city,
            func.count(FailureLog.id).label("count"),
        )
        .filter(FailureLog.logged_at >= cutoff)
        .group_by(func.date(FailureLog.logged_at), FailureLog.blood_group, FailureLog.city)
        .order_by(func.date(FailureLog.logged_at))
        .all()
    )
    return [
        {
            "date": str(r.date),
            "blood_group": r.blood_group or "Unknown",
            "city": r.city or "Unknown",
            "failure_count": int(r.count),
        }
        for r in rows
    ]


def heatmap_points(db: Session, blood_group: str | None = None) -> List[Dict]:
    q = db.query(Donor.latitude, Donor.longitude, Donor.blood_group).filter(
        Donor.latitude.isnot(None),
        Donor.longitude.isnot(None),
        Donor.eligibility_status == "eligible",
    )
    if blood_group:
        q = q.filter(Donor.blood_group == blood_group)
    return [
        {"lat": float(lat), "lon": float(lon), "blood_group": bg, "weight": 1}
        for lat, lon, bg in q.limit(2000).all()
    ]


def response_rate_trend(db: Session, days: int = 7) -> List[Dict]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(OutreachLog.sent_at).label("date"),
            func.count(OutreachLog.id).label("sent"),
            func.sum(
                case((OutreachLog.response.isnot(None), 1), else_=0)
            ).label("responded"),
            func.sum(
                case((OutreachLog.response == "accept", 1), else_=0)
            ).label("accepted"),
        )
        .filter(OutreachLog.sent_at >= cutoff)
        .group_by(func.date(OutreachLog.sent_at))
        .order_by(func.date(OutreachLog.sent_at))
        .all()
    )
    return [
        {
            "date": str(r.date),
            "sent": int(r.sent or 0),
            "responded": int(r.responded or 0),
            "accepted": int(r.accepted or 0),
            "response_rate": round((r.responded or 0) / r.sent, 4) if r.sent else 0,
            "accept_rate": round((r.accepted or 0) / r.sent, 4) if r.sent else 0,
        }
        for r in rows
    ]
