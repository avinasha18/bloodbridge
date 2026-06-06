"""SMS-first outreach + response handling.

The Blood Warriors dataset has no email addresses — every donor is
contacted by SMS only. SMS bodies include a single tap-link that resolves
to a small confirm/decline page. In `use_aws_mocks=True` mode all SMS
sends are persisted to `outbox/sms_log.jsonl` so they can be inspected
live during the demo.

This module owns:
  - `send_outreach_sms`            (initial YES/NO request)
  - `send_assigned_confirmation`   (first YES wins — you are confirmed)
  - `send_standby_notice`          (subsequent YES — placed on standby)
  - `send_standby_promotion`       (an earlier donor cancelled — you're up)
  - `send_pre_confirmation_sms`    (day-before re-confirm prompt)
  - `send_location_sms`            (coordinator sends hospital location)
  - `send_profile_completion_sms`  (collect missing donor info)
  - `send_self_register_invite`    (new-donor self sign-up link)
"""

from __future__ import annotations

import json
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings
from app.services.sns_client import get_sns_client

logger = logging.getLogger(__name__)

OUTBOX_DIR = Path(__file__).resolve().parent.parent.parent / "outbox"
SMS_LOG = OUTBOX_DIR / "sms_log.jsonl"


def _ensure_outbox() -> Path:
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    return OUTBOX_DIR


@dataclass
class SmsResult:
    to_phone: str
    body: str
    token: Optional[str]
    message_id: str
    kind: str


def generate_token() -> str:
    return secrets.token_urlsafe(16)


def token_expiry_hours(default: int = 48) -> datetime:
    return datetime.utcnow() + timedelta(hours=default)


def _send(to_phone: str, body: str, kind: str, token: Optional[str] = None) -> SmsResult:
    """Send an SMS (real SNS) or log to outbox (mocks). Always returns SmsResult."""
    _ensure_outbox()
    sns = get_sns_client()
    msg_id = sns.send_sms(to_phone, body)
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "phone": to_phone,
        "kind": kind,
        "token": token,
        "message_id": msg_id,
        "body": body,
    }
    # The SNS mock already writes to sms_log.jsonl, but include the rich
    # entry separately for the kind/token metadata.
    with (OUTBOX_DIR / "sms_rich.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    logger.info("[SMS %s] %s → %s", kind, to_phone, body[:80])
    return SmsResult(to_phone=to_phone, body=body, token=token, message_id=msg_id, kind=kind)


# ───────────────────────────────────────────────────────────────────────
# Outreach message renderers (kept short to fit a single SMS segment)
# ───────────────────────────────────────────────────────────────────────


def _urgency_word(urgency: str) -> str:
    return {
        "critical": "URGENT",
        "urgent": "Urgent",
        "routine": "Scheduled",
    }.get(urgency, urgency.title())


def _short_response_url(token: str) -> str:
    return f"{settings.response_base_url}?token={token}"


def render_outreach_sms(
    *,
    blood_group: str,
    hospital_short: str,
    urgency: str,
    units_needed: int,
    token: str,
    lang: str = "en",
) -> str:
    """Short single-link SMS — fits one segment; donor taps link for YES/NO."""
    from app.services.i18n import render as i18n_render

    link = _short_response_url(token)
    return i18n_render(
        "outreach_request",
        lang,
        urgency=urgency,
        blood_group=blood_group,
        hospital=hospital_short,
        units=units_needed,
        link=link,
    )


def render_assigned_confirmation(blood_group: str, hospital_short: str, lang: str = "en") -> str:
    from app.services.i18n import render as i18n_render

    return i18n_render(
        "assigned_confirmation",
        lang,
        blood_group=blood_group,
        hospital=hospital_short,
    )


def render_standby_notice(blood_group: str, hospital_short: str, lang: str = "en") -> str:
    from app.services.i18n import render as i18n_render

    return i18n_render(
        "standby_notice",
        lang,
        blood_group=blood_group,
        hospital=hospital_short,
    )


def render_standby_promotion(blood_group: str, hospital_short: str, token: str) -> str:
    yes = f"{_short_response_url(token)}&action=accept"
    no = f"{_short_response_url(token)}&action=decline"
    return (
        "STANDBY -> ACTIVE. Earlier donor cancelled. Can you still donate "
        f"{blood_group} at {hospital_short}?\n"
        f"YES: {yes}\n"
        f"NO:  {no}\n"
        "-Blood Warriors"
    )


def render_pre_confirmation_sms(blood_group: str, hospital_short: str, token: str) -> str:
    yes = f"{_short_response_url(token)}&action=accept"
    no = f"{_short_response_url(token)}&action=decline"
    return (
        f"Reminder: your {blood_group} donation at {hospital_short} is "
        "tomorrow. Are you still available?\n"
        f"YES: {yes}\n"
        f"NO:  {no}\n"
        "-Blood Warriors"
    )


def render_location_sms(hospital_name: str, lat: float, lon: float, when: Optional[str]) -> str:
    maps = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
    when_str = f" ({when})" if when else ""
    return (
        f"Donation location: {hospital_name}{when_str}\n"
        f"Maps: {maps}\n"
        "Please reach 15 min before. -Blood Warriors"
    )


def render_profile_completion_sms(name: Optional[str], link: str) -> str:
    greet = f"Hi {name}, " if name else "Hi, "
    return (
        f"{greet}Blood Warriors needs a few profile details to match you "
        f"to local donation requests. Please complete (2 min):\n{link}\n"
        "-Blood Warriors"
    )


def render_self_register_invite(link: str) -> str:
    return (
        "Welcome to Blood Warriors. Please register yourself as a donor "
        f"using the link below (2 min):\n{link}\n"
        "Your one donation can save up to 3 lives. -Blood Warriors"
    )


# ───────────────────────────────────────────────────────────────────────
# Send helpers (each returns SmsResult)
# ───────────────────────────────────────────────────────────────────────


def send_outreach_sms(
    *,
    phone: str,
    blood_group: str,
    hospital_name: Optional[str],
    urgency: str,
    units_needed: int,
    lang: str = "en",
) -> SmsResult:
    token = generate_token()
    short = (hospital_name or "the hospital").split(",")[0]
    body = render_outreach_sms(
        blood_group=blood_group,
        hospital_short=short,
        urgency=urgency,
        units_needed=units_needed,
        token=token,
        lang=lang,
    )
    return _send(phone, body, kind="outreach", token=token)


def send_assigned_confirmation(*, phone: str, blood_group: str, hospital_name: Optional[str], lang: str = "en") -> SmsResult:
    short = (hospital_name or "the hospital").split(",")[0]
    body = render_assigned_confirmation(blood_group, short, lang=lang)
    return _send(phone, body, kind="assigned_confirmation")


def send_standby_notice(*, phone: str, blood_group: str, hospital_name: Optional[str], lang: str = "en") -> SmsResult:
    short = (hospital_name or "the hospital").split(",")[0]
    body = render_standby_notice(blood_group, short, lang=lang)
    return _send(phone, body, kind="standby_notice")


def send_standby_promotion(*, phone: str, blood_group: str, hospital_name: Optional[str]) -> SmsResult:
    token = generate_token()
    short = (hospital_name or "the hospital").split(",")[0]
    body = render_standby_promotion(blood_group, short, token)
    return _send(phone, body, kind="standby_promotion", token=token)


def send_pre_confirmation_sms(*, phone: str, blood_group: str, hospital_name: Optional[str]) -> SmsResult:
    token = generate_token()
    short = (hospital_name or "the hospital").split(",")[0]
    body = render_pre_confirmation_sms(blood_group, short, token)
    return _send(phone, body, kind="pre_confirmation", token=token)


def send_location_sms(
    *,
    phone: str,
    hospital_name: str,
    hospital_lat: float,
    hospital_lon: float,
    when: Optional[str] = None,
) -> SmsResult:
    body = render_location_sms(hospital_name, hospital_lat, hospital_lon, when)
    return _send(phone, body, kind="location")


def send_profile_completion_sms(*, phone: str, name: Optional[str], link: str) -> SmsResult:
    body = render_profile_completion_sms(name, link)
    return _send(phone, body, kind="profile_completion")


def send_self_register_invite_sms(*, phone: str, link: str) -> SmsResult:
    body = render_self_register_invite(link)
    return _send(phone, body, kind="self_register_invite")
