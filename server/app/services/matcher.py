"""Donor matching engine.

Top-N outreach uses `final_rank_score`, derived primarily from the persisted
`overall_score` (50% ML reliability + 50% show-up rate) plus request context.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor, SystemProtocol
from app.schemas.donor import DonorMatchResult
from app.services.geo import haversine_km
from app.services.reliability_model import (
    DEFAULT_RELIABILITY_SCORE,
    compute_final_rank_score,
    compute_overall_score,
    get_reliability_scorer,
)

# Higher = rarer = stronger urgency multiplier in matching
BLOOD_SCARCITY_WEIGHTS = {
    "O Negative": 0.95,
    "B Negative": 0.90,
    "A Negative": 0.85,
    "AB Negative": 0.85,
    "O Positive": 0.40,
    "B Positive": 0.45,
    "A Positive": 0.50,
    "AB Positive": 0.55,
}

# Universal donors that can substitute for the requested group.
# Used only when fewer than `min_candidates` exact-match donors are found.
COMPATIBLE_DONORS = {
    "A Positive": ["A Positive", "A Negative", "O Positive", "O Negative"],
    "A Negative": ["A Negative", "O Negative"],
    "B Positive": ["B Positive", "B Negative", "O Positive", "O Negative"],
    "B Negative": ["B Negative", "O Negative"],
    "AB Positive": [
        "AB Positive", "AB Negative", "A Positive", "A Negative",
        "B Positive", "B Negative", "O Positive", "O Negative",
    ],
    "AB Negative": ["AB Negative", "A Negative", "B Negative", "O Negative"],
    "O Positive": ["O Positive", "O Negative"],
    "O Negative": ["O Negative"],
}


def _proximity_score(distance_km: float, radius_km: int) -> float:
    if distance_km == float("inf"):
        return 0.0
    if radius_km <= 0:
        return 0.0
    return max(0.0, 1 - (distance_km / max(radius_km, 1)))


def _freshness_score(last_donation: Optional[date]) -> float:
    if not last_donation:
        return 0.5  # Unknown last-donation: neutral
    days = (date.today() - last_donation).days
    if days < 0:
        return 0.5
    # 1.0 if very recent, 0.0 after 365 days
    return max(0.0, 1 - (min(days, 365) / 365))


def _scarcity_score(blood_group: str) -> float:
    return BLOOD_SCARCITY_WEIGHTS.get(blood_group, 0.5)


def get_protocol_for(
    db: Session, blood_group: str, city: Optional[str]
) -> SystemProtocol:
    """Resolve the active protocol (city-specific → blood-group fallback → default)."""
    q = db.query(SystemProtocol).filter(SystemProtocol.blood_group == blood_group)
    if city:
        match = q.filter(SystemProtocol.city == city).first()
        if match:
            return match
    match = q.first()
    if match:
        return match
    # Synthetic default if nothing seeded
    return SystemProtocol(
        blood_group=blood_group,
        city=city or "Default",
        initial_batch_size=5,
        initial_radius_km=10,
        escalation_wait_h=2.0,
        proactive_days_ahead=7,
    )


def score_donor_for_request(
    donor: Donor,
    request: BloodRequest,
    *,
    radius_km: int,
    scorer=None,
) -> DonorMatchResult:
    """Build a ranked match result for one donor + request (shared by matcher/resend)."""
    if scorer is None:
        scorer = get_reliability_scorer()

    distance = haversine_km(
        donor.latitude, donor.longitude, request.hospital_lat, request.hospital_lon
    )
    stored = float(donor.reliability_score or 0)
    if stored > 0 and stored != DEFAULT_RELIABILITY_SCORE:
        reliability = stored
    else:
        reliability = float(scorer.score(donor))
    showup = float(donor.showup_rate or 0.5)
    overall = float(donor.overall_score or 0)
    if overall <= 0 or overall == DEFAULT_RELIABILITY_SCORE:
        overall = compute_overall_score(reliability, showup)
    prox = _proximity_score(distance, radius_km)
    fresh = _freshness_score(donor.last_donation_date)
    scarcity = _scarcity_score(donor.blood_group or request.blood_group)
    final = compute_final_rank_score(
        overall,
        proximity=prox,
        freshness=fresh,
        scarcity=scarcity,
        urgency=request.urgency,
    )
    return DonorMatchResult(
        donor_id=donor.id,
        name=donor.name,
        phone=donor.phone,
        blood_group=donor.blood_group,
        city=donor.city,
        distance_km=round(distance if distance != float("inf") else -1, 2),
        reliability_score=round(reliability, 4),
        showup_rate=round(showup, 4),
        overall_score=round(overall, 4),
        proximity_score=round(prox, 4),
        freshness_score=round(fresh, 4),
        scarcity_score=round(scarcity, 4),
        final_rank_score=round(final, 4),
        donations_till_date=int(donor.donations_till_date or 0),
        last_donation_date=donor.last_donation_date,
    )


def match_donors(
    db: Session,
    request: BloodRequest,
    *,
    radius_km: Optional[int] = None,
    batch_size: Optional[int] = None,
    exclude_donor_ids: Optional[List[str]] = None,
) -> List[DonorMatchResult]:
    """Return the top-N ranked donors for a blood request.

    Honors current `system_protocols` for batch size and radius unless
    overridden (e.g. by an escalation step).
    """
    protocol = get_protocol_for(db, request.blood_group, _city_for_request(request))
    radius = radius_km or request.search_radius_km or protocol.initial_radius_km
    batch = batch_size or protocol.initial_batch_size

    exclude = set(exclude_donor_ids or [])
    candidates = _query_candidates(db, request.blood_group, exclude)
    if len(candidates) < batch:
        # Widen with compatible donors
        compat = COMPATIBLE_DONORS.get(request.blood_group, [])
        for bg in compat:
            if bg == request.blood_group:
                continue
            extra = _query_candidates(db, bg, exclude)
            candidates.extend(extra)

    scorer = get_reliability_scorer()

    ranked: List[Tuple[float, DonorMatchResult]] = []
    for donor in candidates:
        distance = haversine_km(
            donor.latitude, donor.longitude, request.hospital_lat, request.hospital_lon
        )
        # Hard filter: skip out-of-radius if coordinates known
        if distance != float("inf") and distance > radius:
            continue

        result = score_donor_for_request(donor, request, radius_km=radius, scorer=scorer)
        final = result.final_rank_score
        ranked.append((final, result))

    ranked.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in ranked[:batch]]


def _query_candidates(db: Session, blood_group: str, exclude: set) -> List[Donor]:
    q = db.query(Donor).filter(
        and_(
            Donor.blood_group == blood_group,
            Donor.eligibility_status == "eligible",
            Donor.is_active.is_(True),
            Donor.consent_given.is_(True),
            Donor.profile_complete.is_(True),
            Donor.phone.isnot(None),
        )
    )
    if exclude:
        q = q.filter(~Donor.id.in_(exclude))
    return q.limit(500).all()


def _city_for_request(request: BloodRequest) -> Optional[str]:
    # Heuristic: derive city from hospital name string, e.g. "Apollo, Hyderabad"
    if not request.hospital_name:
        return None
    parts = [p.strip() for p in request.hospital_name.split(",")]
    return parts[-1] if len(parts) > 1 else None
