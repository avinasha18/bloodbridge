"""AI endpoints (Bedrock-powered explanations + admin chat)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import BloodRequest, Donor
from app.schemas.ai import (
    MatchExplainRequest,
    MatchExplainResponse,
    MatchExplanation,
    NLQueryRequest,
    NLQueryResponse,
    ReactivateDraftRequest,
    ReactivateDraftResponse,
)
from app.services import analytics as analytics_svc
from app.services.bedrock_client import get_bedrock_client
from app.services.matcher import match_donors

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/match-explain", response_model=MatchExplainResponse)
def match_explain(payload: MatchExplainRequest, db: Session = Depends(get_db)):
    req = db.query(BloodRequest).get(payload.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    matches = match_donors(db, req, batch_size=payload.top_n)
    if not matches:
        return MatchExplainResponse(
            request_id=req.id,
            summary="No eligible donors found in the current search radius.",
            donors=[],
        )

    bedrock = get_bedrock_client()
    req_summary = (
        f"{req.blood_group} needed at {req.hospital_name or 'unknown hospital'}, "
        f"urgency={req.urgency}, units={req.units_needed}"
    )

    explanations = []
    for idx, m in enumerate(matches, start=1):
        donor_summary = (
            f"reliability={m.reliability_score:.2f}, distance={m.distance_km}km, "
            f"past_donations={m.donations_till_date}, blood_group={m.blood_group}, "
            f"final_rank={m.final_rank_score:.3f}"
        )
        text = bedrock.explain_match(
            request_summary=req_summary,
            donor_summary=donor_summary,
            rank=idx,
        )
        explanations.append(
            MatchExplanation(donor_id=m.donor_id, explanation=text, rank=idx)
        )

    top = matches[0]
    summary = (
        f"Top candidate has a reliability score of {top.reliability_score:.2f} and is "
        f"{top.distance_km}km away with {top.donations_till_date} past donations. "
        f"The next {min(len(matches), 5) - 1} candidates are ranked by a weighted "
        "blend of reliability, proximity, freshness, and blood-type scarcity."
    )

    return MatchExplainResponse(
        request_id=req.id,
        summary=summary,
        donors=explanations,
    )


@router.post("/query", response_model=NLQueryResponse)
def nl_query(payload: NLQueryRequest, db: Session = Depends(get_db)):
    metrics = analytics_svc.dashboard_metrics(db)
    db_summary = {
        **metrics["blood_supply"],
        "upcoming_7d": metrics["upcoming_transfusions_7d"],
        "at_risk": metrics["at_risk_donors"],
        "active_requests": metrics["active_requests"],
        "fulfilled_today": metrics["fulfilled_today"],
        "critical_shortages": metrics["critical_shortages"],
    }
    result = get_bedrock_client().nl_query(payload.query, db_summary)
    return NLQueryResponse(
        query=payload.query,
        intent=result["intent"],
        answer=result["answer"],
        data=result.get("data"),
    )


@router.post("/reactivate-draft", response_model=ReactivateDraftResponse)
def reactivate_draft(payload: ReactivateDraftRequest, db: Session = Depends(get_db)):
    donor = db.query(Donor).get(payload.donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    draft = get_bedrock_client().reactivation_draft(donor)
    return ReactivateDraftResponse(
        donor_id=donor.id, subject=draft["subject"], body=draft["body"]
    )
