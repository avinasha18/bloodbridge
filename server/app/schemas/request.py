"""Blood request, outreach, escalation, and analytics schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class BloodRequestCreate(BaseModel):
    patient_id: Optional[str] = None
    blood_group: str
    units_needed: int = 1
    urgency: str = Field("routine", pattern="^(critical|urgent|routine)$")
    required_by: Optional[datetime] = None
    hospital_name: Optional[str] = None
    hospital_lat: Optional[float] = None
    hospital_lon: Optional[float] = None
    notes: Optional[str] = None
    created_by: str = "coordinator"
    is_proactive: bool = False


class BloodRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: Optional[str]
    blood_group: str
    units_needed: int
    urgency: str
    required_by: Optional[datetime]
    hospital_name: Optional[str]
    hospital_lat: Optional[float]
    hospital_lon: Optional[float]
    status: str
    assigned_donor_id: Optional[str]
    escalation_level: int
    search_radius_km: int
    is_proactive: bool
    created_by: str
    notes: Optional[str]
    created_at: datetime
    reserved_at: Optional[datetime]
    confirmed_at: Optional[datetime]
    fulfilled_at: Optional[datetime]
    failed_at: Optional[datetime]
    failure_reason: Optional[str]
    location_sent_at: Optional[datetime]
    pre_confirm_sent_at: Optional[datetime]
    pre_confirm_response: Optional[str]


class SmsTimelineEntry(BaseModel):
    id: str
    message_kind: str
    title: str
    donor_id: Optional[str] = None
    donor_name: Optional[str] = None
    donor_phone: Optional[str] = None
    sent_at: datetime
    responded_at: Optional[datetime] = None
    response_label: Optional[str] = None
    distance_km: Optional[float] = None
    batch_number: int = 0


class OutreachLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    request_id: str
    donor_id: str
    channel: str
    message_id: Optional[str]
    sent_at: datetime
    responded_at: Optional[datetime]
    response: Optional[str]
    decline_reason: Optional[str]
    batch_number: int
    rank_score: Optional[float]
    distance_km: Optional[float]
    reliability_score_snapshot: Optional[float]
    showup_rate_snapshot: Optional[float] = None
    assignment_role: Optional[str] = None
    standby_rank: int = 0
    confirmation_sent_at: Optional[datetime] = None
    confirmation_response: Optional[str] = None
    confirmation_response_at: Optional[datetime] = None
    message_kind: Optional[str] = "outreach_request"
    donor_name: Optional[str] = None
    donor_phone: Optional[str] = None


class EscalationEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    request_id: str
    escalation_level: int
    trigger_reason: str
    donors_tried: int
    expanded_radius_km: Optional[int]
    triggered_at: datetime
    resolved: bool


class RequestDetail(BloodRequestRead):
    """Request + full contact history + escalations."""

    outreach_logs: List[OutreachLogRead] = []
    sms_timeline: List[SmsTimelineEntry] = []
    escalations: List[EscalationEventRead] = []


class SmsTestLink(BaseModel):
    """Clickable YES/NO URLs for local demo (mock SMS mode)."""

    token: str
    purpose: str
    consumed: bool
    consumed_action: Optional[str] = None
    donor_id: str
    donor_name: Optional[str] = None
    phone: Optional[str] = None
    yes_url: str
    no_url: str


class SmsTestLinksResponse(BaseModel):
    using_mocks: bool
    response_base_url: str
    links: List[SmsTestLink]


class DashboardMetrics(BaseModel):
    total_donors: int
    eligible_donors: int
    active_donors: int
    at_risk_donors: int
    total_patients: int
    upcoming_transfusions_7d: int
    active_requests: int
    requests_today: int
    fulfilled_today: int
    avg_fulfillment_hours: Optional[float]
    response_rate_7d: Optional[float]
    blood_supply: dict  # blood_group -> eligible count
    critical_shortages: List[str]


class HeatmapPoint(BaseModel):
    lat: float
    lon: float
    blood_group: str
    weight: int = 1


class ReliabilityBucket(BaseModel):
    bucket: str  # "high", "medium", "low"
    range: str  # "0.7-1.0" etc.
    count: int


class FailureTrend(BaseModel):
    date: str
    blood_group: str
    city: str
    failure_count: int


class ProtocolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    blood_group: str
    city: str
    initial_batch_size: int
    initial_radius_km: int
    escalation_wait_h: float
    proactive_days_ahead: int
    last_updated_by: str
    last_updated_at: datetime
    update_reason: Optional[str]
