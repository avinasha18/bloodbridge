"""Patient request/response schemas."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PatientBase(BaseModel):
    name: Optional[str] = None
    blood_group: Optional[str] = None
    bridge_gender: Optional[str] = None
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    relation_to_patient: Optional[str] = None
    notifications_enabled: bool = True
    self_registered: bool = False
    hospital_name: Optional[str] = None
    hospital_lat: Optional[float] = None
    hospital_lon: Optional[float] = None
    city: Optional[str] = None
    coordinator_name: Optional[str] = None
    coordinator_phone: Optional[str] = None
    coordinator_email: Optional[str] = None
    quantity_required: int = 1
    last_transfusion_date: Optional[date] = None
    expected_next_transfusion_date: Optional[date] = None
    frequency_in_days: Optional[int] = None


class PatientCreate(PatientBase):
    blood_group: str


class PatientUpdate(BaseModel):
    """Coordinator edits — especially transfusion cycle for proactive alerts."""

    name: Optional[str] = None
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    hospital_name: Optional[str] = None
    hospital_lat: Optional[float] = None
    hospital_lon: Optional[float] = None
    city: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    quantity_required: Optional[int] = None
    last_transfusion_date: Optional[date] = None
    expected_next_transfusion_date: Optional[date] = None
    frequency_in_days: Optional[int] = None


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class PatientNotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: Optional[str]
    request_id: Optional[str]
    phone: Optional[str]
    kind: str
    title: str
    body: str
    message_id: Optional[str]
    sent_at: datetime
    delivery_error: Optional[str]


class UpcomingTransfusion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: str
    name: Optional[str]
    blood_group: str
    hospital_name: Optional[str]
    expected_next_transfusion_date: date
    days_until: int
    proactive_request_created: bool
