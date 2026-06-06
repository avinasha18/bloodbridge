"""Shared schema primitives."""

from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    limit: int
    offset: int


class Health(BaseModel):
    status: str = "ok"
    service: str = "bin-api"
    version: str
    environment: str
    using_mocks: bool
    sns_using_mocks: bool = True
    response_base_url: str = ""
    sms_sandbox: Optional[bool] = None
    sms_verified_phones: List[str] = []
    sms_demo_phones: List[str] = []
    sms_override_phone: Optional[str] = None
    sms_hint: Optional[str] = None


class GenericMessage(BaseModel):
    message: str
    detail: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str = Field(..., description="New status (e.g. confirmed, fulfilled, failed)")
    reason: Optional[str] = None
