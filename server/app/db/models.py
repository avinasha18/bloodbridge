"""SQLAlchemy ORM models mirroring the BIN data design.

These mirror the schema described in the architecture blueprint. They are
deliberately portable: UUID PKs use string-encoded UUIDs so the same models
run on SQLite (local) and PostgreSQL (RDS).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Donor(Base):
    __tablename__ = "donors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    external_user_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    gender: Mapped[Optional[str]] = mapped_column(String(30))

    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))
    city: Mapped[Optional[str]] = mapped_column(String(100), index=True)

    donor_type: Mapped[Optional[str]] = mapped_column(String(40))
    role: Mapped[Optional[str]] = mapped_column(String(40))
    donations_till_date: Mapped[int] = mapped_column(Integer, default=0)
    calls_to_donations_ratio: Mapped[Optional[float]] = mapped_column(Numeric(6, 2))
    cycle_of_donations: Mapped[Optional[int]] = mapped_column(Integer)
    total_calls: Mapped[int] = mapped_column(Integer, default=0)

    eligibility_status: Mapped[Optional[str]] = mapped_column(String(30), index=True)
    last_donation_date: Mapped[Optional[date]] = mapped_column(Date)
    next_eligible_date: Mapped[Optional[date]] = mapped_column(Date)

    last_contacted_date: Mapped[Optional[date]] = mapped_column(Date)
    user_donation_active_status: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    inactive_trigger_comment: Mapped[Optional[str]] = mapped_column(Text)

    reliability_score: Mapped[float] = mapped_column(Numeric(5, 4), default=0.5)
    # ML reliability + show-up rate — primary donor quality signal for ranking
    overall_score: Mapped[float] = mapped_column(Numeric(5, 4), default=0.5)

    # ──── Show-up metrics (the real operational signal) ────
    # showup_rate = total_shows / total_accepts when total_accepts > 0
    # i.e. of the times this donor said YES, how often did they actually donate?
    showup_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.85)
    total_accepts: Mapped[int] = mapped_column(Integer, default=0)
    total_shows: Mapped[int] = mapped_column(Integer, default=0)
    total_no_shows: Mapped[int] = mapped_column(Integer, default=0)

    # Set to False if blood_group / location / phone missing — used to
    # route coordinator "complete profile" SMS link to this donor.
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_channel: Mapped[str] = mapped_column(String(10), default="sms")
    language_preference: Mapped[str] = mapped_column(String(5), default="en")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    outreach_logs: Mapped[list["OutreachLog"]] = relationship(back_populates="donor")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    external_bridge_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    blood_group: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    bridge_gender: Mapped[Optional[str]] = mapped_column(String(30))

    # Patient (or attendant) contact — receives status SMS updates
    phone: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255))
    relation_to_patient: Mapped[Optional[str]] = mapped_column(String(40))
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    self_registered: Mapped[bool] = mapped_column(Boolean, default=False)

    hospital_name: Mapped[Optional[str]] = mapped_column(String(255))
    hospital_lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))
    hospital_lon: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))
    city: Mapped[Optional[str]] = mapped_column(String(100), index=True)

    coordinator_name: Mapped[Optional[str]] = mapped_column(String(255))
    coordinator_phone: Mapped[Optional[str]] = mapped_column(String(20))
    coordinator_email: Mapped[Optional[str]] = mapped_column(String(255))

    quantity_required: Mapped[int] = mapped_column(Integer, default=1)
    last_transfusion_date: Mapped[Optional[date]] = mapped_column(Date)
    expected_next_transfusion_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    frequency_in_days: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    blood_requests: Mapped[list["BloodRequest"]] = relationship(back_populates="patient")
    notifications: Mapped[list["PatientNotification"]] = relationship(back_populates="patient")


class PatientNotification(Base):
    """SMS sent to a patient about their blood request status."""

    __tablename__ = "patient_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("blood_requests.id"), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    # request_created | donor_assigned | donor_confirmed | donor_donated | request_failed | location_shared
    kind: Mapped[str] = mapped_column(String(40), index=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    message_id: Mapped[Optional[str]] = mapped_column(String(255))
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    delivery_error: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped[Optional[Patient]] = relationship(back_populates="notifications")


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    blood_group: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    units_needed: Mapped[int] = mapped_column(Integer, default=1)
    urgency: Mapped[str] = mapped_column(String(20), default="routine", index=True)
    required_by: Mapped[Optional[datetime]] = mapped_column(DateTime)

    hospital_name: Mapped[Optional[str]] = mapped_column(String(255))
    hospital_lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))
    hospital_lon: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))

    # Status lifecycle:
    #   pending → matching → outreach_sent → reserved (1st YES wins)
    #   → confirmed (day-before re-confirm) → fulfilled
    # Side-paths: standby_promote (assigned cancelled) → reserved | failed
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)

    assigned_donor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("donors.id"))
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    search_radius_km: Mapped[int] = mapped_column(Integer, default=10)

    is_proactive: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_by: Mapped[str] = mapped_column(String(50), default="coordinator")

    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Coordinator workflow timestamps
    location_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    pre_confirm_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    pre_confirm_response: Mapped[Optional[str]] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    reserved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    fulfilled_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    failed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped[Optional[Patient]] = relationship(back_populates="blood_requests")
    outreach_logs: Mapped[list["OutreachLog"]] = relationship(back_populates="request")
    escalations: Mapped[list["EscalationEvent"]] = relationship(back_populates="request")


class OutreachLog(Base):
    __tablename__ = "outreach_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("blood_requests.id"), index=True)
    donor_id: Mapped[str] = mapped_column(String(36), ForeignKey("donors.id"), index=True)

    channel: Mapped[str] = mapped_column(String(10), default="sms")
    message_id: Mapped[Optional[str]] = mapped_column(String(255))
    # outreach_request | location | assigned_confirmation | standby_notice | ...
    message_kind: Mapped[Optional[str]] = mapped_column(String(40), default="outreach_request")

    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    response: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    decline_reason: Mapped[Optional[str]] = mapped_column(Text)

    sf_task_token: Mapped[Optional[str]] = mapped_column(Text)
    batch_number: Mapped[int] = mapped_column(Integer, default=1)

    rank_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 4))
    distance_km: Mapped[Optional[float]] = mapped_column(Numeric(6, 2))
    reliability_score_snapshot: Mapped[Optional[float]] = mapped_column(Numeric(5, 4))
    showup_rate_snapshot: Mapped[Optional[float]] = mapped_column(Numeric(5, 4))

    # ──── Reserved / Standby flow ────
    # When the first donor replies YES, they become 'assigned' with
    # standby_rank=0. Subsequent YES responses become 'standby' with rank 1+.
    # If the assigned donor later cancels, the lowest-rank standby is
    # promoted to assigned.
    assignment_role: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    # 'assigned' | 'standby' | 'declined' | 'released' | 'no_show' | 'donated'
    standby_rank: Mapped[int] = mapped_column(Integer, default=0)

    # Day-before re-confirmation
    confirmation_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    confirmation_response: Mapped[Optional[str]] = mapped_column(String(20))
    # 'confirmed' | 'cancelled' | None
    confirmation_response_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    donor: Mapped[Donor] = relationship(back_populates="outreach_logs")
    request: Mapped[BloodRequest] = relationship(back_populates="outreach_logs")


class EscalationEvent(Base):
    __tablename__ = "escalation_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("blood_requests.id"), index=True)
    escalation_level: Mapped[int] = mapped_column(Integer)
    trigger_reason: Mapped[str] = mapped_column(String(100))
    donors_tried: Mapped[int] = mapped_column(Integer, default=0)
    expanded_radius_km: Mapped[Optional[int]] = mapped_column(Integer)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    request: Mapped[BloodRequest] = relationship(back_populates="escalations")


class FailureLog(Base):
    __tablename__ = "failure_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("blood_requests.id"))
    blood_group: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    urgency: Mapped[Optional[str]] = mapped_column(String(20))
    failure_type: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    donors_contacted: Mapped[int] = mapped_column(Integer, default=0)
    donors_responded: Mapped[int] = mapped_column(Integer, default=0)
    donors_accepted: Mapped[int] = mapped_column(Integer, default=0)
    avg_response_time_h: Mapped[Optional[float]] = mapped_column(Numeric(6, 2))
    resolution: Mapped[Optional[str]] = mapped_column(String(50))
    logged_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SystemProtocol(Base):
    __tablename__ = "system_protocols"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    blood_group: Mapped[str] = mapped_column(String(20), index=True)
    city: Mapped[str] = mapped_column(String(100), index=True)
    initial_batch_size: Mapped[int] = mapped_column(Integer, default=5)
    initial_radius_km: Mapped[int] = mapped_column(Integer, default=10)
    escalation_wait_h: Mapped[float] = mapped_column(Numeric(4, 1), default=2.0)
    proactive_days_ahead: Mapped[int] = mapped_column(Integer, default=7)
    last_updated_by: Mapped[str] = mapped_column(String(50), default="system")
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    update_reason: Mapped[Optional[str]] = mapped_column(Text)


class ProtocolUpdateLog(Base):
    """Audit trail of self-improvement engine updates to system protocols."""

    __tablename__ = "protocol_update_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    blood_group: Mapped[str] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(100))
    previous_state: Mapped[dict] = mapped_column(JSON)
    new_state: Mapped[dict] = mapped_column(JSON)
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    updated_by: Mapped[str] = mapped_column(String(50), default="bedrock-analyzer")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ResponseToken(Base):
    """Local stand-in for the `bin-response-tokens` DynamoDB table.

    Persists token → request/donor mapping for one-tap SMS responses.
    Also reused for the day-before re-confirmation flow.
    """

    __tablename__ = "response_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), index=True)
    donor_id: Mapped[str] = mapped_column(String(36), index=True)
    outreach_log_id: Mapped[str] = mapped_column(String(36))
    sf_task_token: Mapped[Optional[str]] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    consumed_action: Mapped[Optional[str]] = mapped_column(String(20))
    # 'outreach' (first YES/NO) | 'confirmation' (day-before)
    purpose: Mapped[str] = mapped_column(String(20), default="outreach")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DonorEngagementLog(Base):
    """Engagement Agent: classification + AI-generated outreach per donor.

    One row per (donor, send). Cadence guard reads MAX(sent_at) to avoid spam.
    """

    __tablename__ = "donor_engagement_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    donor_id: Mapped[str] = mapped_column(String(36), ForeignKey("donors.id"), index=True)
    # 'new' | 'active' | 'at_risk' | 'dormant'
    segment: Mapped[str] = mapped_column(String(20), index=True)
    # 'whatsapp' | 'sms' | 'preview'
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp")
    subject: Mapped[Optional[str]] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    # AI-generated rationale shown to coordinator
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    # Twilio MessageSid (or sns-* etc.)
    message_id: Mapped[Optional[str]] = mapped_column(String(255))
    # delivered | queued | preview | failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    delivery_error: Mapped[Optional[str]] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(40), default="bedrock")
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class DonorSelfServiceToken(Base):
    """Public, no-auth tokens for two flows:
      - 'complete_profile': donor missing fields fills them in
      - 'self_register':    brand new donor signs themselves up
    """

    __tablename__ = "donor_self_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    # For 'complete_profile': donor_id is set to the existing donor.
    # For 'self_register':    donor_id is null, phone may hint at identity.
    donor_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)
    phone_hint: Mapped[Optional[str]] = mapped_column(String(20))
    purpose: Mapped[str] = mapped_column(String(30))  # 'complete_profile' | 'self_register'
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_by: Mapped[str] = mapped_column(String(50), default="coordinator")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
