"""Outreach + one-tap SMS response endpoint.

The `/respond` route is the public SMS button target. It's GET-friendly
so it works on any phone/browser without JS. Behaviour depends on token
purpose:

  - purpose='outreach':     YES → reserve/standby flow
                            NO  → declined (promote if assigned cancels)
  - purpose='confirmation': YES → request fully confirmed
                            NO  → cancel + auto-promote next standby
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import OutreachLog, ResponseToken
from app.schemas.request import OutreachLogRead
from app.services import reservation

router = APIRouter(tags=["outreach"])


@router.get("/outreach/logs/{request_id}", response_model=List[OutreachLogRead])
def outreach_for_request(request_id: str, db: Session = Depends(get_db)):
    return (
        db.query(OutreachLog)
        .filter_by(request_id=request_id)
        .order_by(OutreachLog.sent_at.desc())
        .all()
    )


@router.get("/respond", response_class=HTMLResponse)
def handle_response(
    token: str = Query(...),
    action: str = Query(..., pattern="^(accept|decline)$"),
    db: Session = Depends(get_db),
):
    record = db.query(ResponseToken).filter_by(token=token).first()
    if not record:
        return HTMLResponse(_page("Link not found", "This link is no longer valid."), status_code=410)
    if record.consumed:
        return HTMLResponse(
            _page("Already responded", f"You previously chose: {record.consumed_action}."),
            status_code=200,
        )
    if record.expires_at < datetime.utcnow():
        return HTMLResponse(
            _page("Link expired", "This link expired."), status_code=410
        )

    log = db.query(OutreachLog).get(record.outreach_log_id)
    if not log:
        raise HTTPException(status_code=500, detail="Outreach log missing")

    record.consumed = True
    record.consumed_action = action
    db.commit()

    if record.purpose == "confirmation":
        result = reservation.record_pre_confirmation_response(db, log, action)
        return HTMLResponse(_confirmation_page(action, result))

    if action == "accept":
        result = reservation.record_yes(db, log)
        return HTMLResponse(_yes_page(result))
    else:
        reservation.record_no(db, log)
        return HTMLResponse(_no_page())


# ─── Page renderers ────────────────────────────────────────────────────


def _yes_page(result: dict) -> str:
    status = result.get("status")
    if status == "assigned":
        title = "You are confirmed for this donation"
        body = (
            "Thank you. Our coordinator will share the hospital location, "
            "timing, and transport details shortly via SMS."
        )
        ok = True
    elif status == "standby":
        rank = result.get("standby_rank", 0)
        title = "You're on standby — thank you"
        body = (
            "A donor has already been assigned for this request. "
            f"You are #{rank} on the standby list and will be contacted only "
            "if the primary donor cancels."
        )
        ok = True
    else:
        title = "Thank you"
        body = "Your response was recorded."
        ok = True
    return _page(title, body, ok=ok)


def _no_page() -> str:
    return _page(
        "Noted, thank you",
        "We've recorded that you're not available. We'll contact the next "
        "donor immediately.",
    )


def _confirmation_page(action: str, result: dict) -> str:
    if action == "accept":
        return _page(
            "Donation confirmed",
            "Thanks for re-confirming. The coordinator will be at the "
            "hospital to receive you. See you tomorrow.",
        )
    # NO from pre-confirmation
    status = result.get("status")
    if status == "promoted":
        return _page(
            "We understand, thank you",
            "We've reached out to the next available donor to ensure the "
            "patient is taken care of.",
        )
    return _page(
        "We understand, thank you",
        "No standby donors are available. The hospital coordinator will "
        "arrange directly.",
    )


def _page(title: str, message: str, ok: bool = True) -> str:
    color = "#16a34a" if ok else "#dc2626"
    icon = "✓" if ok else "⚠"
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Blood Warriors Foundation</title>
  <style>
    body {{ font-family: -apple-system, Segoe UI, Roboto, sans-serif;
           text-align:center; padding:48px 24px; max-width:480px; margin:0 auto;
           color:#111; }}
    .badge {{ font-size:64px; line-height:1; color:{color}; }}
    h2 {{ font-size:24px; color:{color}; margin:16px 0 8px; }}
    p {{ font-size:16px; line-height:1.5; color:#444; }}
    .sig {{ margin-top:36px; font-size:13px; color:#888; }}
  </style>
</head>
<body>
  <div class="badge">{icon}</div>
  <h2>{title}</h2>
  <p>{message}</p>
  <div class="sig">Blood Warriors Foundation<br/>BloodBridge Intelligence Network</div>
</body>
</html>"""
