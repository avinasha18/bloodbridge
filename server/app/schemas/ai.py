"""AI / Bedrock related schemas."""

from typing import List, Optional

from pydantic import BaseModel


class MatchExplainRequest(BaseModel):
    request_id: str
    top_n: int = 5


class MatchExplanation(BaseModel):
    donor_id: str
    explanation: str
    rank: int


class MatchExplainResponse(BaseModel):
    request_id: str
    summary: str
    donors: List[MatchExplanation]


class NLQueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None


class NLQueryResponse(BaseModel):
    query: str
    intent: str
    answer: str
    data: Optional[dict] = None
    sql: Optional[str] = None


class ReactivateDraftRequest(BaseModel):
    donor_id: str


class ReactivateDraftResponse(BaseModel):
    donor_id: str
    subject: str
    body: str
