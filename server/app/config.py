"""Application settings loaded from environment variables.

Centralizes all configuration so swapping local mocks for real AWS services
only requires environment variable changes.
"""

from functools import lru_cache
import os
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always allowed — merged with any CORS_ORIGINS from env (env cannot remove these).
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "https://main.d11rkj49kcvbsu.amplifyapp.com",
)

# Production frontend + API path prefix (always /api in code — local Vite proxy strips it).
DEFAULT_API_PREFIX = "/api"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "local"
    debug: bool = True
    log_level: str = "INFO"

    database_url: str = "postgresql://postgres:localhost:5432/postgres"

    aws_region: str = "ap-south-1"
    use_aws_mocks: bool = True
    # Set SNS_USE_MOCKS=false to send real SMS via AWS while keeping other mocks on.
    sns_use_mocks: Optional[bool] = None

    # Personal / project AWS keys — override ~/.aws/credentials on your machine
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_session_token: str = ""  # optional, for temporary credentials

    ses_sender_email: str = "noreply@bloodbridge.in"
    ses_sender_name: str = "Blood Warriors Foundation"
    response_base_url: str = "http://localhost:8000/respond"

    sns_urgent_topic_arn: str = ""

    bedrock_model_id: str = "anthropic.claude-haiku-20240307-v1:0"
    bedrock_region: str = "us-east-1"
    # Long-term Bedrock API key from the Bedrock console (API keys → Generate).
    # boto3 reads AWS_BEARER_TOKEN_BEDROCK; we also accept BEDROCK_API_KEY here.
    bedrock_api_key: str = ""
    # Set false to call real Bedrock while keeping SNS/SES/SageMaker mocks on locally.
    bedrock_use_mocks: bool = True

    @property
    def sns_mocks_enabled(self) -> bool:
        """True when SMS should be logged locally instead of sent via AWS SNS."""
        if self.sns_use_mocks is not None:
            return self.sns_use_mocks
        return self.use_aws_mocks

    @property
    def bedrock_mocks_enabled(self) -> bool:
        """True when Bedrock should use offline template fallbacks."""
        if self.bedrock_api_key or os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
            return False
        if not self.bedrock_use_mocks:
            return False
        return self.use_aws_mocks

    sagemaker_endpoint_name: str = "bin-reliability-scorer-v1"

    step_functions_arn: str = ""

    dynamo_response_tokens_table: str = "bin-response-tokens"
    dynamo_active_requests_table: str = "bin-active-requests"
    dynamo_donor_availability_table: str = "bin-donor-availability"
    dynamo_metrics_table: str = "bin-metrics"

    admin_frontend_url: str = "http://localhost:5173"
    donor_portal_url: str = "http://localhost:5174"

    cors_origins: str = ""  # optional extra origins (DEFAULT_CORS_ORIGINS always included)

    # All routes also served under /api (local Vite proxy strips prefix before uvicorn).
    api_prefix: str = DEFAULT_API_PREFIX

    # Coordinator sends SMS manually (no auto-blast on create). Top-N per click.
    manual_outreach: bool = True
    outreach_batch_size: int = 2
    # Seconds between SNS sends in one batch (avoids carrier/AWS throttling).
    sms_send_delay_seconds: float = 0.6
    # Dev: send every SMS to this verified number instead of donor.phone
    sms_override_phone: str = ""
    # Phones assigned to seeded demo donors (shown in UI diagnostics)
    demo_donor_phones: str = "+917386223111,+918247364827"

    # ── Twilio WhatsApp (Donor Engagement Agent) ──
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    # Sender number: +14155238886 = Twilio sandbox; or your approved number.
    twilio_whatsapp_from: str = ""
    # Set false to send live WhatsApp; default true (logs to outbox/whatsapp_log.jsonl).
    twilio_use_mocks: Optional[bool] = None

    @property
    def twilio_mocks_enabled(self) -> bool:
        if self.twilio_use_mocks is not None:
            return self.twilio_use_mocks
        if self.twilio_account_sid and self.twilio_auth_token and self.twilio_whatsapp_from:
            return False
        return True

    # Cadence guards for the engagement agent (do not spam donors)
    engagement_min_gap_days_new: int = 7
    engagement_min_gap_days_active: int = 30
    engagement_min_gap_days_at_risk: int = 14
    engagement_min_gap_days_dormant: int = 30

    @property
    def demo_donor_phones_list(self) -> list[str]:
        return [p.strip() for p in self.demo_donor_phones.split(",") if p.strip()]

    @property
    def cors_origins_list(self) -> List[str]:
        seen: set[str] = set()
        merged: List[str] = []
        for origin in (
            *DEFAULT_CORS_ORIGINS,
            *(o.strip() for o in self.cors_origins.split(",") if o.strip()),
        ):
            if origin not in seen:
                seen.add(origin)
                merged.append(origin)
        return merged


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Must run before any boto3 import so .env keys beat ~/.aws/credentials
    from app.services.aws_boto import apply_aws_credentials_from_env

    apply_aws_credentials_from_env(
        s.aws_access_key_id or None,
        s.aws_secret_access_key or None,
        s.aws_session_token or None,
    )
    return s


settings = get_settings()
