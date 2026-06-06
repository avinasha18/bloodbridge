"""Public donor self-service.

Two flows, both no-auth, both token-driven:

  1. Complete profile (coordinator initiates):
       coordinator clicks 'Send profile-completion link' on a donor row
         → POST /coordinator/donors/{id}/send-profile-link
         → SMS with link → donor opens GET /donor-self/profile?token=...
         → donor submits POST /donor-self/profile
         → Donor.profile_complete = True

  2. Self-registration (anyone with a link):
       coordinator clicks 'Generate registration link'
         → POST /coordinator/donors/self-register-invite (optionally with phone)
         → returns a link the coordinator can share / SMS to the prospect
         → prospect opens GET /donor-self/register?token=...
         → POST /donor-self/register creates a new Donor

For local dev / demo, the public form is served as a self-contained
HTML page (single-file) so it works without the React app being up.
The same endpoints are also consumable by the React app's own routes.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import Donor, DonorSelfServiceToken
from app.services.reliability_service import refresh_donor_score
from app.services.sms_sender import (
    generate_token,
    send_profile_completion_sms,
    send_self_register_invite_sms,
)

router = APIRouter(tags=["donor-self-service"])


# ─── Coordinator endpoints (admin → SMS) ───────────────────────────────


class ProfileLinkResult(BaseModel):
    status: str
    token: str
    link: str
    message_id: Optional[str] = None
    sent_to_phone: Optional[str] = None


@router.post("/coordinator/donors/{donor_id}/send-profile-link", response_model=ProfileLinkResult, tags=["coordinator"])
def send_profile_link(donor_id: str, db: Session = Depends(get_db)):
    donor = db.query(Donor).get(donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    if not donor.phone:
        raise HTTPException(status_code=400, detail="Donor has no phone number")

    token = generate_token()
    db.add(
        DonorSelfServiceToken(
            token=token,
            donor_id=donor.id,
            phone_hint=donor.phone,
            purpose="complete_profile",
            expires_at=datetime.utcnow().replace(microsecond=0) + _hours(72),
            created_by="coordinator",
        )
    )
    db.commit()

    link = _public_link("/donor-self/profile", token)
    sms = send_profile_completion_sms(
        phone=donor.phone,
        name=donor.name,
        link=link,
    )
    return ProfileLinkResult(
        status="sent",
        token=token,
        link=link,
        message_id=sms.message_id,
        sent_to_phone=donor.phone,
    )


class SelfRegisterInviteIn(BaseModel):
    phone: Optional[str] = None  # if provided, SMS the invite there


class SelfRegisterInviteResult(BaseModel):
    status: str
    token: str
    link: str
    sent_to_phone: Optional[str] = None
    message_id: Optional[str] = None


@router.post(
    "/coordinator/donors/self-register-invite",
    response_model=SelfRegisterInviteResult,
    tags=["coordinator"],
)
def self_register_invite(payload: SelfRegisterInviteIn, db: Session = Depends(get_db)):
    token = generate_token()
    db.add(
        DonorSelfServiceToken(
            token=token,
            donor_id=None,
            phone_hint=payload.phone,
            purpose="self_register",
            expires_at=datetime.utcnow().replace(microsecond=0) + _hours(24 * 14),
            created_by="coordinator",
        )
    )
    db.commit()
    link = _public_link("/donor-self/register", token)
    sent_id = None
    if payload.phone:
        sms = send_self_register_invite_sms(phone=payload.phone, link=link)
        sent_id = sms.message_id
    return SelfRegisterInviteResult(
        status="generated",
        token=token,
        link=link,
        sent_to_phone=payload.phone,
        message_id=sent_id,
    )


# ─── Donor-facing endpoints (public, no auth) ──────────────────────────


@router.get("/donor-self/profile", response_class=HTMLResponse)
def profile_form(token: str, db: Session = Depends(get_db)):
    record = _validate_token(db, token, expected_purpose="complete_profile")
    if isinstance(record, HTMLResponse):
        return record
    donor = db.query(Donor).get(record.donor_id)
    name = donor.name or "friend"
    bg = donor.blood_group or ""
    return HTMLResponse(_render_form(
        title=f"Welcome, {name}",
        subtitle="Complete your profile so we can match you to nearby requests.",
        submit_label="Save profile",
        action_path=f"/donor-self/profile?token={token}",
        prefill={"blood_group": bg, "city": donor.city or "Hyderabad"},
        include_name=False,
        include_phone=False,
    ))


class ProfileSubmit(BaseModel):
    blood_group: str = Field(..., min_length=1)
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gender: Optional[str] = None
    consent_given: bool = True


@router.post("/donor-self/profile")
def submit_profile(token: str, payload: ProfileSubmit, db: Session = Depends(get_db)):
    record = db.query(DonorSelfServiceToken).filter_by(token=token).first()
    if not record or record.consumed or record.purpose != "complete_profile":
        raise HTTPException(status_code=410, detail="Link invalid or already used")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link expired")
    donor = db.query(Donor).get(record.donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")

    donor.blood_group = payload.blood_group
    if payload.city:
        donor.city = payload.city
    if payload.latitude is not None:
        donor.latitude = payload.latitude
    if payload.longitude is not None:
        donor.longitude = payload.longitude
    if payload.gender:
        donor.gender = payload.gender
    donor.consent_given = payload.consent_given
    donor.profile_complete = bool(
        donor.blood_group and donor.latitude is not None and donor.longitude is not None
    )
    record.consumed = True
    record.consumed_at = datetime.utcnow()
    db.commit()

    return JSONResponse({"status": "ok", "donor_id": donor.id})


@router.get("/donor-self/register", response_class=HTMLResponse)
def register_form(token: str, db: Session = Depends(get_db)):
    record = _validate_token(db, token, expected_purpose="self_register")
    if isinstance(record, HTMLResponse):
        return record
    return HTMLResponse(_render_form(
        title="Become a Blood Warrior",
        subtitle="A few details and we'll route you to local donation needs.",
        submit_label="Register",
        action_path=f"/donor-self/register?token={token}",
        prefill={"phone": record.phone_hint or ""},
        include_name=True,
        include_phone=True,
    ))


class SelfRegisterSubmit(BaseModel):
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=8)
    blood_group: str = Field(..., min_length=1)
    city: Optional[str] = "Hyderabad"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gender: Optional[str] = None
    consent_given: bool = True


@router.post("/donor-self/register")
def submit_register(token: str, payload: SelfRegisterSubmit, db: Session = Depends(get_db)):
    record = db.query(DonorSelfServiceToken).filter_by(token=token).first()
    if not record or record.consumed or record.purpose != "self_register":
        raise HTTPException(status_code=410, detail="Link invalid or already used")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link expired")

    existing = db.query(Donor).filter_by(phone=payload.phone).first()
    if existing:
        raise HTTPException(status_code=409, detail="Phone already registered")

    donor = Donor(
        name=payload.name,
        phone=payload.phone,
        blood_group=payload.blood_group,
        city=payload.city or "Hyderabad",
        latitude=payload.latitude,
        longitude=payload.longitude,
        gender=payload.gender,
        donor_type="Regular Donor",
        role="Emergency Donor",
        eligibility_status="eligible",
        user_donation_active_status="Active",
        consent_given=payload.consent_given,
        preferred_channel="sms",
        profile_complete=bool(
            payload.blood_group and payload.latitude is not None and payload.longitude is not None
        ),
    )
    db.add(donor)
    db.flush()
    refresh_donor_score(donor)
    record.consumed = True
    record.consumed_at = datetime.utcnow()
    db.commit()
    db.refresh(donor)
    return JSONResponse({"status": "ok", "donor_id": donor.id})


# ─── Helpers ───────────────────────────────────────────────────────────


def _hours(n: int):
    from datetime import timedelta
    return timedelta(hours=n)


def _public_link(path: str, token: str) -> str:
    # Production: use api gateway URL. Local: the FastAPI host serves both.
    from app.config import settings

    base = settings.response_base_url.split("/respond")[0]
    return f"{base}{path}?token={token}"


def _validate_token(db: Session, token: str, expected_purpose: str):
    record = db.query(DonorSelfServiceToken).filter_by(token=token).first()
    if not record:
        return HTMLResponse(_simple_page("Link not found", "This link is no longer valid."), status_code=410)
    if record.purpose != expected_purpose:
        return HTMLResponse(_simple_page("Wrong link", "Please use the correct link from your SMS."), status_code=410)
    if record.consumed:
        return HTMLResponse(_simple_page("Already submitted", "This link has already been used."), status_code=200)
    if record.expires_at < datetime.utcnow():
        return HTMLResponse(_simple_page("Link expired", "Please ask the coordinator for a new link."), status_code=410)
    return record


def _simple_page(title: str, message: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blood Warriors</title>
<style>body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:48px 24px;max-width:480px;margin:0 auto;color:#111;}}
h2{{color:#dc2626;}}.sig{{margin-top:36px;font-size:13px;color:#888;}}</style></head>
<body><h2>{title}</h2><p>{message}</p>
<div class="sig">Blood Warriors Foundation</div></body></html>"""


def _render_form(
    *,
    title: str,
    subtitle: str,
    submit_label: str,
    action_path: str,
    prefill: dict,
    include_name: bool,
    include_phone: bool,
) -> str:
    bg_options = [
        "O Positive", "O Negative", "A Positive", "A Negative",
        "B Positive", "B Negative", "AB Positive", "AB Negative",
    ]
    bg_opts_html = "\n".join(
        f'<option value="{b}"{" selected" if prefill.get("blood_group") == b else ""}>{b}</option>'
        for b in bg_options
    )
    name_field = (
        '<label>Full name<input name="name" required></label>' if include_name else ""
    )
    phone_field = (
        f'<label>Mobile number<input name="phone" required value="{prefill.get("phone", "")}"></label>'
        if include_phone else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Blood Warriors — {title}</title>
  <style>
    :root {{ --brand:#dc2626; --ink:#111; --muted:#666; }}
    body {{ font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#f8fafc;
            margin:0; padding:24px; color:var(--ink); }}
    .wrap {{ max-width:480px; margin:0 auto; background:white; padding:28px;
             border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,0.04),0 8px 24px -8px rgba(0,0,0,0.08); }}
    h1 {{ font-size:22px; margin:0 0 4px; color:var(--brand); }}
    .sub {{ color:var(--muted); font-size:14px; margin:0 0 20px; }}
    label {{ display:block; margin:14px 0; font-size:13px; font-weight:500; color:#333; }}
    input, select {{ width:100%; padding:11px 12px; border:1px solid #cbd5e1; border-radius:8px;
                     font-size:15px; margin-top:6px; box-sizing:border-box; }}
    button {{ width:100%; background:var(--brand); color:white; border:none; padding:14px;
              border-radius:8px; font-size:16px; font-weight:600; margin-top:18px; cursor:pointer; }}
    button:hover {{ background:#991b1b; }}
    .row {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
    .ok {{ color:#16a34a; }}
    .err {{ color:var(--brand); }}
    .sig {{ text-align:center; margin-top:28px; font-size:12px; color:#888; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>{title}</h1>
    <p class="sub">{subtitle}</p>
    <form id="f">
      {name_field}
      {phone_field}
      <label>Blood group
        <select name="blood_group" required>{bg_opts_html}</select>
      </label>
      <label>City
        <input name="city" value="{prefill.get('city', 'Hyderabad')}">
      </label>
      <div class="row">
        <label>Latitude <input name="latitude" type="number" step="0.000001" placeholder="auto-detect"></label>
        <label>Longitude <input name="longitude" type="number" step="0.000001" placeholder="auto-detect"></label>
      </div>
      <label>Gender
        <select name="gender">
          <option value="">Prefer not to say</option>
          <option>Male</option><option>Female</option><option>Other</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;font-size:13px;color:#555;">
        <input type="checkbox" name="consent_given" checked style="width:auto;margin:0;">
        I consent to be contacted by SMS for donation requests
      </label>
      <button type="submit">{submit_label}</button>
      <div id="msg" style="margin-top:12px;text-align:center;font-size:14px;"></div>
    </form>
    <div class="sig">Blood Warriors Foundation</div>
  </div>

  <script>
    (function() {{
      // Try to populate lat/lon from the browser
      if (navigator.geolocation) {{
        navigator.geolocation.getCurrentPosition(function(p) {{
          var f = document.querySelector('form');
          if (f && !f.latitude.value) f.latitude.value = p.coords.latitude.toFixed(6);
          if (f && !f.longitude.value) f.longitude.value = p.coords.longitude.toFixed(6);
        }}, function() {{ /* user denied — ignore */ }});
      }}
      document.getElementById('f').addEventListener('submit', async function(e) {{
        e.preventDefault();
        var fd = new FormData(e.target);
        var data = Object.fromEntries(fd.entries());
        data.consent_given = !!data.consent_given;
        if (data.latitude === '') delete data.latitude; else data.latitude = parseFloat(data.latitude);
        if (data.longitude === '') delete data.longitude; else data.longitude = parseFloat(data.longitude);
        var msg = document.getElementById('msg');
        msg.textContent = 'Saving…';
        try {{
          var res = await fetch('{action_path}', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify(data),
          }});
          if (res.ok) {{
            msg.innerHTML = '<span class="ok">Saved. Thank you — you can close this window.</span>';
            e.target.querySelector('button').disabled = true;
          }} else {{
            var j = await res.json().catch(()=>({{}}));
            msg.innerHTML = '<span class="err">'+(j.detail||'Something went wrong')+'</span>';
          }}
        }} catch (err) {{
          msg.innerHTML = '<span class="err">Network error: '+err.message+'</span>';
        }}
      }});
    }})();
  </script>
</body>
</html>"""
