"""Donor request/response schemas."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DonorBase(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    # Note: stored as plain str (not EmailStr) because the seed/import
    # uses demo TLDs (.test/.local) that EmailStr rejects.
    email: Optional[str] = None
    blood_group: Optional[str] = None
    gender: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None


class DonorCreate(DonorBase):
    blood_group: str
    consent_given: bool = True
    preferred_channel: str = "email"
    language_preference: str = "en"


class DonorRead(DonorBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    donor_type: Optional[str] = None
    role: Optional[str] = None
    donations_till_date: int
    calls_to_donations_ratio: Optional[float] = None
    total_calls: int
    eligibility_status: Optional[str] = None
    last_donation_date: Optional[date] = None
    next_eligible_date: Optional[date] = None
    user_donation_active_status: Optional[str] = None
    inactive_trigger_comment: Optional[str] = None
    reliability_score: float
    showup_rate: float
    overall_score: float
    total_accepts: int
    total_shows: int
    total_no_shows: int
    profile_complete: bool
    is_active: bool
    consent_given: bool
    preferred_channel: str
    language_preference: str
    created_at: datetime


class DonorScoreUpdate(BaseModel):
    reliability_score: Optional[float] = Field(None, ge=0, le=1)
    recompute: bool = False


class DonorMatchResult(BaseModel):
    """A ranked donor returned by the matcher."""

    donor_id: str
    name: Optional[str] = None
    phone: Optional[str] = None
    blood_group: Optional[str] = None
    city: Optional[str] = None
    distance_km: float
    reliability_score: float
    showup_rate: float
    overall_score: float
    proximity_score: float
    freshness_score: float
    scarcity_score: float
    final_rank_score: float
    donations_till_date: int
    last_donation_date: Optional[date] = None
    explanation: Optional[str] = None
