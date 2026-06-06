"""SES email sending with one-click response buttons.

In `use_aws_mocks=True` mode, emails are persisted to `outbox/` as `.eml`
files so they can be inspected during the demo (and screenshotted).
"""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

OUTBOX_DIR = Path(__file__).resolve().parent.parent.parent / "outbox"


def _ensure_outbox() -> Path:
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    return OUTBOX_DIR


@dataclass
class OutreachEmail:
    to_email: str
    to_name: Optional[str]
    subject: str
    html_body: str
    text_body: str
    token: str
    message_id: str


def generate_token() -> str:
    return secrets.token_urlsafe(24)


def render_outreach_email(
    *,
    donor_name: Optional[str],
    blood_group: str,
    hospital_name: Optional[str],
    urgency: str,
    units_needed: int,
    required_by: Optional[datetime],
    donations_till_date: int,
    token: str,
    ai_message: Optional[str] = None,
) -> tuple[str, str, str]:
    """Render (subject, html, text) for an outreach email."""
    urgency_label = {
        "critical": "URGENT - Critical Need",
        "urgent": "Urgent Need",
        "routine": "Scheduled Donation Opportunity",
    }.get(urgency, urgency.title())

    when = required_by.strftime("%a, %b %d at %I:%M %p") if required_by else "as soon as possible"
    hospital = hospital_name or "the hospital"
    greeting = f"Hi {donor_name}," if donor_name else "Hi friend,"

    accept_url = f"{settings.response_base_url}?token={token}&action=accept"
    decline_url = f"{settings.response_base_url}?token={token}&action=decline"

    body_intro = ai_message or (
        f"A thalassemia patient at {hospital} needs {units_needed} unit(s) of "
        f"{blood_group} blood by {when}. You're one of our most trusted donors."
    )

    if donations_till_date > 0:
        body_intro += (
            f"\n\nYour {donations_till_date} previous donation(s) have directly saved lives. "
            "Thank you for being part of this community."
        )

    subject = f"[{urgency_label}] {blood_group} donor needed at {hospital}"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
  <div style="text-align:center; padding-bottom: 16px; border-bottom: 2px solid #dc2626;">
    <h1 style="color:#dc2626; margin:0;">Blood Warriors Foundation</h1>
    <p style="color:#666; margin:4px 0 0 0;">BloodBridge Intelligence Network</p>
  </div>

  <p style="font-size:16px; margin-top:24px;">{greeting}</p>

  <div style="font-size:16px; line-height:1.6; white-space:pre-line;">{body_intro}</div>

  <div style="text-align:center; margin:36px 0;">
    <a href="{accept_url}"
       style="background:#16a34a;color:white;padding:16px 32px;
              border-radius:8px;font-size:18px;font-weight:bold;
              text-decoration:none;margin-right:8px;display:inline-block;">
      YES, I Can Donate
    </a>
    <a href="{decline_url}"
       style="background:#6b7280;color:white;padding:16px 32px;
              border-radius:8px;font-size:18px;font-weight:bold;
              text-decoration:none;display:inline-block;">
      Not Available
    </a>
  </div>

  <p style="font-size:14px; color:#666; text-align:center;">
    The donation takes less than 45 minutes. Transport can be arranged.<br/>
    This link expires in 48 hours.
  </p>

  <div style="border-top: 1px solid #eee; margin-top: 32px; padding-top: 16px; font-size: 12px; color:#888; text-align:center;">
    You're receiving this because you opted in to Blood Warriors donor outreach.<br/>
    Reply STOP to opt out anytime.
  </div>
</body>
</html>"""

    text = f"""{greeting}

{body_intro}

>> YES, I Can Donate:  {accept_url}
>> Not Available:       {decline_url}

The donation takes less than 45 minutes. Transport can be arranged.
This link expires in 48 hours.

— Blood Warriors Foundation
"""
    return subject, html, text


class SESClient:
    """Send emails via SES or persist to outbox/ in mock mode."""

    def __init__(self) -> None:
        self._client = None
        if not settings.use_aws_mocks:
            try:
                from app.services.aws_boto import make_boto3_client

                self._client = make_boto3_client(
                    "ses",
                    settings.aws_region,
                    access_key_id=settings.aws_access_key_id or None,
                    secret_access_key=settings.aws_secret_access_key or None,
                    session_token=settings.aws_session_token or None,
                )
            except Exception as exc:
                logger.warning("Falling back to mock SES: %s", exc)

    def send_outreach(
        self,
        *,
        to_email: str,
        to_name: Optional[str],
        blood_group: str,
        hospital_name: Optional[str],
        urgency: str,
        units_needed: int,
        required_by: Optional[datetime],
        donations_till_date: int,
        ai_message: Optional[str] = None,
    ) -> OutreachEmail:
        token = generate_token()
        subject, html, text = render_outreach_email(
            donor_name=to_name,
            blood_group=blood_group,
            hospital_name=hospital_name,
            urgency=urgency,
            units_needed=units_needed,
            required_by=required_by,
            donations_till_date=donations_till_date,
            token=token,
            ai_message=ai_message,
        )

        message_id = self._send(to_email, subject, html, text)

        return OutreachEmail(
            to_email=to_email,
            to_name=to_name,
            subject=subject,
            html_body=html,
            text_body=text,
            token=token,
            message_id=message_id,
        )

    def send_confirmation(
        self, *, to_email: str, to_name: Optional[str], blood_group: str, hospital_name: str
    ) -> str:
        subject = f"Confirmed — Thank you for donating {blood_group}"
        html = f"""<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#16a34a;">You're confirmed!</h2>
  <p>Hi {to_name or 'friend'},</p>
  <p>Thank you for confirming your {blood_group} donation at {hospital_name}.
  Our coordinator will contact you shortly with logistics details (transport, slot, paperwork).</p>
  <p>Lives are saved because of people like you.</p>
  <p>— Blood Warriors Foundation</p>
</body></html>"""
        text = f"Hi {to_name or 'friend'},\n\nThanks for confirming your {blood_group} donation at {hospital_name}. Our coordinator will contact you shortly.\n\n— Blood Warriors Foundation"
        return self._send(to_email, subject, html, text)

    def send_reactivation(
        self, *, to_email: str, to_name: Optional[str], subject: str, body: str
    ) -> str:
        html = f"""<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <p>{body.replace(chr(10), '<br/>')}</p>
  <hr/>
  <p style="color:#666;font-size:12px;">— Blood Warriors Foundation</p>
</body></html>"""
        return self._send(to_email, subject, html, body)

    def _send(self, to_email: str, subject: str, html: str, text: str) -> str:
        if self._client is None:
            return self._mock_send(to_email, subject, html, text)
        resp = self._client.send_email(
            Source=f"{settings.ses_sender_name} <{settings.ses_sender_email}>",
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Html": {"Data": html, "Charset": "UTF-8"},
                    "Text": {"Data": text, "Charset": "UTF-8"},
                },
            },
        )
        return resp.get("MessageId", f"ses-{secrets.token_hex(8)}")

    def _mock_send(self, to_email: str, subject: str, html: str, text: str) -> str:
        outbox = _ensure_outbox()
        message_id = f"mock-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}"
        safe_to = to_email.replace("@", "_at_")
        path = outbox / f"{message_id}__{safe_to}.html"
        path.write_text(
            f"<!-- To: {to_email}\nSubject: {subject}\nSent: {datetime.utcnow().isoformat()}Z -->\n{html}",
            encoding="utf-8",
        )
        logger.info("[MOCK SES] Wrote %s → %s", subject, path.name)
        return message_id


_singleton: Optional[SESClient] = None


def get_ses_client() -> SESClient:
    global _singleton
    if _singleton is None:
        _singleton = SESClient()
    return _singleton


def token_expiry_hours(default: int = 48) -> datetime:
    return datetime.utcnow() + timedelta(hours=default)


def get_outbox_dir() -> Path:
    return _ensure_outbox()


def get_outbox_relative_path(filename: str) -> Optional[Path]:
    outbox = _ensure_outbox()
    path = outbox / filename
    if not path.exists():
        return None
    return path
