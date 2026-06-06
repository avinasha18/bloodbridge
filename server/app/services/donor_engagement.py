"""Donor Engagement & Retention Agent.

Classifies each donor into one of 4 segments:

  new       → registered <30 days ago AND donations == 0
  active    → donated in the last 6 months OR accepted in the last 30 days
  at_risk   → calls_to_donations_ratio > 3.0 (over-contacted) OR
              7–12 months since last donation
  dormant   → > 12 months since last donation (or never donated and >30 days)

Pipeline:

  classify_donor(donor) -> segment
    ↓
  build_engagement_plan(donor) -> {segment, message, rationale}   (Bedrock)
    ↓
  send_engagement(donor)  -> Twilio WhatsApp (with cadence guard)
    ↓
  DonorEngagementLog row written for every send / preview

Cadence: a donor will not be messaged again until N days have passed,
where N depends on segment (see settings.engagement_min_gap_days_*).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Donor, DonorEngagementLog, OutreachLog
from app.services.bedrock_client import get_bedrock_client
from app.services.locale_touch import compose_engagement_message, locale_touch_for_donor
from app.services.twilio_whatsapp import send_whatsapp

logger = logging.getLogger(__name__)


SEGMENTS = ("new", "active", "at_risk", "dormant")


@dataclass
class DonorActivity:
    segment: str
    days_since_last_donation: Optional[int]
    days_since_registration: int
    last_donation: Optional[date]
    last_accept_at: Optional[datetime]
    last_engagement_at: Optional[datetime]
    eligible_now: bool
    reason: str


# ─── Classification ────────────────────────────────────────────────────


def _days_since(d: Optional[date]) -> Optional[int]:
    if not d:
        return None
    if isinstance(d, datetime):
        d = d.date()
    return max(0, (date.today() - d).days)


def _days_since_reg(donor: Donor, today: date) -> int:
    reg = donor.created_at
    if not reg:
        return 999
    reg_date = reg.date() if isinstance(reg, datetime) else reg
    return max(0, (today - reg_date).days)


def classify_segment(
    donor: Donor,
    *,
    today: Optional[date] = None,
    recently_accepted: bool = False,
) -> tuple[str, str]:
    """Pure segment classifier (no DB). Returns (segment, reason)."""
    today = today or date.today()
    last_donation = donor.last_donation_date
    days_since_last = _days_since(last_donation)
    days_since_reg = _days_since_reg(donor, today)
    ratio = float(donor.calls_to_donations_ratio or 0.0)
    donations = int(donor.donations_till_date or 0)

    if donations == 0 and days_since_reg <= 30:
        segment, reason = "new", "Newly registered, no donations yet."
    elif ratio > 3.0:
        segment, reason = "at_risk", f"Over-contacted (calls/donations = {ratio:.1f})."
    elif days_since_last is None:
        if days_since_reg > 60:
            segment, reason = "dormant", "No recorded donation yet (registered >60 days)."
        else:
            segment, reason = "new", "Recently registered."
    elif days_since_last <= 180:
        segment, reason = "active", f"Donated {days_since_last} days ago."
    elif days_since_last <= 365:
        segment, reason = "at_risk", f"Slipping — last donation {days_since_last} days ago."
    else:
        segment, reason = "dormant", f"Dormant — last donation {days_since_last} days ago."

    if recently_accepted:
        segment, reason = "active", "Accepted a request in the last 30 days."

    return segment, reason


def segment_counts(db: Session) -> Dict[str, int]:
    """Fast segment totals — 2 SQL queries + in-memory classify (not N+1)."""
    from sqlalchemy import or_

    today = date.today()
    cutoff = datetime.utcnow() - timedelta(days=30)
    recent_accept_ids = {
        row[0]
        for row in db.query(OutreachLog.donor_id)
        .filter(
            OutreachLog.response == "accept",
            OutreachLog.responded_at >= cutoff,
        )
        .distinct()
        .all()
    }

    donors = (
        db.query(Donor)
        .filter(or_(Donor.is_active.is_(True), Donor.is_active.is_(None)))
        .filter(or_(Donor.consent_given.is_(True), Donor.consent_given.is_(None)))
        .all()
    )

    counts: Dict[str, int] = {s: 0 for s in SEGMENTS}
    for d in donors:
        seg, _ = classify_segment(
            d, today=today, recently_accepted=d.id in recent_accept_ids
        )
        counts[seg] = counts.get(seg, 0) + 1
    return counts


def analyze_donor(db: Session, donor: Donor) -> DonorActivity:
    """Compute current activity profile + classify into a segment."""
    today = date.today()
    last_donation = donor.last_donation_date
    days_since_last = _days_since(last_donation)
    days_since_reg = _days_since_reg(donor, today)

    last_accept = (
        db.query(func.max(OutreachLog.responded_at))
        .filter(OutreachLog.donor_id == donor.id, OutreachLog.response == "accept")
        .scalar()
    )
    last_engagement = (
        db.query(func.max(DonorEngagementLog.sent_at))
        .filter(DonorEngagementLog.donor_id == donor.id)
        .scalar()
    )

    recently_accepted = bool(
        last_accept and (datetime.utcnow() - last_accept) <= timedelta(days=30)
    )
    segment, reason = classify_segment(
        donor, today=today, recently_accepted=recently_accepted
    )

    eligible_now = bool(donor.eligibility_status == "eligible") and (
        not donor.next_eligible_date or donor.next_eligible_date <= today
    )

    return DonorActivity(
        segment=segment,
        days_since_last_donation=days_since_last,
        days_since_registration=days_since_reg,
        last_donation=last_donation if isinstance(last_donation, date) else None,
        last_accept_at=last_accept,
        last_engagement_at=last_engagement,
        eligible_now=eligible_now,
        reason=reason,
    )


# ─── Cadence guard ─────────────────────────────────────────────────────


def _min_gap_days(segment: str) -> int:
    return {
        "new": settings.engagement_min_gap_days_new,
        "active": settings.engagement_min_gap_days_active,
        "at_risk": settings.engagement_min_gap_days_at_risk,
        "dormant": settings.engagement_min_gap_days_dormant,
    }.get(segment, 30)


def cadence_ok(activity: DonorActivity) -> bool:
    """True if enough time has passed since the last engagement send."""
    if not activity.last_engagement_at:
        return True
    gap = datetime.utcnow() - activity.last_engagement_at
    return gap >= timedelta(days=_min_gap_days(activity.segment))


# ─── Plan generation (Bedrock) ─────────────────────────────────────────


def build_engagement_plan(db: Session, donor: Donor) -> Dict:
    activity = analyze_donor(db, donor)
    touch = locale_touch_for_donor(
        city=donor.city,
        latitude=float(donor.latitude) if donor.latitude is not None else None,
        longitude=float(donor.longitude) if donor.longitude is not None else None,
        language_preference=donor.language_preference,
    )
    bedrock = get_bedrock_client()
    plan = bedrock.engagement_plan(
        donor_name=donor.name or "friend",
        segment=activity.segment,
        blood_group=donor.blood_group,
        donations=int(donor.donations_till_date or 0),
        last_donation_iso=activity.last_donation.isoformat() if activity.last_donation else None,
        days_since_last=activity.days_since_last_donation,
        showup_rate=float(donor.showup_rate or 0),
        eligible_now=activity.eligible_now,
        city=donor.city,
        lang=touch.lang_code,
        native_headline=touch.headline,
    )
    body_en = plan["message"]
    full_message = compose_engagement_message(touch.headline, body_en)
    return {
        "donor_id": donor.id,
        "donor_name": donor.name,
        "phone": donor.phone,
        "segment": activity.segment,
        "reason": activity.reason,
        "days_since_last_donation": activity.days_since_last_donation,
        "days_since_registration": activity.days_since_registration,
        "eligible_now": activity.eligible_now,
        "last_engagement_at": activity.last_engagement_at,
        "cadence_ok": cadence_ok(activity),
        "min_gap_days": _min_gap_days(activity.segment),
        "native_headline": touch.headline,
        "native_lang": touch.lang_code,
        "native_lang_label": touch.lang_label,
        "region_name": touch.region_name,
        "message_body": body_en,
        "message": full_message,
        "rationale": plan.get("rationale"),
        "channel": "whatsapp",
    }


# ─── Send (one donor) ─────────────────────────────────────────────────


def send_engagement(
    db: Session,
    donor: Donor,
    *,
    force: bool = False,
    custom_message: Optional[str] = None,
    channel: str = "whatsapp",
) -> Dict:
    plan = build_engagement_plan(db, donor)
    if not force and not plan["cadence_ok"]:
        return {
            **plan,
            "status": "skipped",
            "reason": (
                f"Last engagement was within {plan['min_gap_days']} days — "
                "skipped to avoid spam."
            ),
        }
    if not donor.phone:
        return {**plan, "status": "skipped", "reason": "donor has no phone"}

    message = (custom_message or plan["message"]).strip()
    result = send_whatsapp(donor.phone, message, kind=f"engagement_{plan['segment']}")

    log = DonorEngagementLog(
        donor_id=donor.id,
        segment=plan["segment"],
        channel=channel,
        subject=None,
        message=message,
        rationale=plan.get("rationale"),
        message_id=result.message_id or None,
        status=result.status,
        delivery_error=result.error,
        generated_by="bedrock",
        sent_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    donor.last_contacted_date = date.today()
    db.commit()

    return {
        **plan,
        "status": result.status,
        "message_id": result.message_id,
        "delivery_error": result.error,
        "delivery_phone": result.to_phone,
        "intended_phone": result.intended_phone or donor.phone,
        "redirected": result.redirected,
    }


# ─── Daily batch agent ─────────────────────────────────────────────────


def run_engagement_agent(
    db: Session,
    *,
    limit: int = 50,
    segments: Optional[List[str]] = None,
    dry_run: bool = False,
) -> Dict:
    """Iterate over donors, classify, send when cadence allows.

    `dry_run=True` only generates plans — nothing is sent.
    `segments` restricts to selected buckets (default: all).
    """
    from sqlalchemy import or_

    chosen = set(segments) if segments else set(SEGMENTS)
    sent: List[Dict] = []
    skipped: List[Dict] = []
    by_segment: Dict[str, int] = {s: 0 for s in SEGMENTS}
    scanned = 0
    segment_mismatch = 0

    # Newest donors are usually "new" — when filtering segments, scan deeper.
    max_scan = max(limit * 80, 400) if segments else max(limit * 4, 40)
    offset = 0
    chunk_size = 200

    while len(sent) < limit and scanned < max_scan:
        chunk = (
            db.query(Donor)
            .filter(or_(Donor.is_active.is_(True), Donor.is_active.is_(None)))
            .filter(or_(Donor.consent_given.is_(True), Donor.consent_given.is_(None)))
            .filter(Donor.phone.isnot(None))
            .order_by(Donor.created_at.desc())
            .offset(offset)
            .limit(chunk_size)
            .all()
        )
        if not chunk:
            break
        offset += chunk_size

        for donor in chunk:
            if len(sent) >= limit:
                break
            scanned += 1
            activity = analyze_donor(db, donor)
            by_segment[activity.segment] = by_segment.get(activity.segment, 0) + 1

            if activity.segment not in chosen:
                segment_mismatch += 1
                continue

            if not cadence_ok(activity):
                skipped.append(
                    {
                        "donor_id": donor.id,
                        "segment": activity.segment,
                        "reason": "cadence",
                    }
                )
                continue

            if dry_run:
                plan = build_engagement_plan(db, donor)
                sent.append({**plan, "status": "preview"})
                continue

            try:
                result = send_engagement(db, donor)
                sent.append(result)
                if result.get("status") == "skipped":
                    skipped.append(
                        {
                            "donor_id": donor.id,
                            "segment": activity.segment,
                            "reason": result.get("reason", "cadence"),
                        }
                    )
            except Exception as exc:
                logger.exception("send_engagement failed donor=%s", donor.id)
                skipped.append(
                    {"donor_id": donor.id, "reason": f"error: {exc}"}
                )

        if len(sent) >= limit:
            break

    delivered = [s for s in sent if s.get("status") not in ("preview", "skipped", "failed")]
    delivered_to = [
        {
            "donor_id": s.get("donor_id"),
            "donor_name": s.get("donor_name"),
            "segment": s.get("segment"),
            "donor_phone": s.get("phone") or s.get("intended_phone"),
            "delivery_phone": s.get("delivery_phone") or s.get("phone"),
            "redirected": bool(s.get("redirected")),
            "message_id": s.get("message_id"),
            "status": s.get("status"),
        }
        for s in delivered
    ]
    return {
        "candidates_scanned": scanned,
        "sent_count": len(delivered),
        "preview_count": len([s for s in sent if s.get("status") == "preview"]),
        "skipped_count": len(skipped),
        "segment_mismatch_count": segment_mismatch,
        "selected_segments": list(chosen),
        "segment_distribution": by_segment,
        "delivered_to": delivered_to,
        "sent": sent[:50],
        "skipped": skipped[:50],
        "hint": _batch_hint(scanned, sent, skipped, segment_mismatch, chosen, limit),
    }


def _batch_hint(
    scanned: int,
    sent: List[Dict],
    skipped: List[Dict],
    segment_mismatch: int,
    chosen: set,
    limit: int,
) -> Optional[str]:
    if sent:
        return None
    if segment_mismatch >= scanned and scanned > 0:
        labels = ", ".join(sorted(chosen))
        return (
            f"Scanned {scanned} recent donors — none were in {labels}. "
            "Newest registrations are usually 'new'. Add 'New' to targets, "
            "raise batch size, or send from a donor profile directly."
        )
    if skipped and not sent:
        return "Matched donors found but all were blocked by cadence (messaged recently)."
    if scanned == 0:
        return "No eligible donors with phone numbers in the database."
    return f"No donors matched in {scanned} scanned. Try other segments or use Sync sample profiles."


# ─── Outreach sample profiles (local / staging test) ────────────────────

# Internal role tag — not shown in UI; used to find the 4 sample donors later.
_SAMPLE_ROLE = "outreach_sample_{segment}"


def prepare_outreach_samples(db: Session) -> Dict:
    """Align four donor records (one per segment) with coordinator test phones.

    Uses DEMO_DONOR_PHONES from settings. Keeps real donor names; tags via role field.
    """
    phones = settings.demo_donor_phones_list or ["+917386223111", "+918247364827"]
    primary, secondary = phones[0], phones[1] if len(phones) > 1 else phones[0]
    today = date.today()

    profiles = [
        {
            "segment": "new",
            "phone": secondary,
            "phone_index": 0,
            "city": "Hyderabad",
            "latitude": 17.385,
            "longitude": 78.486,
            "donations_till_date": 0,
            "last_donation_date": None,
            "calls_to_donations_ratio": 0.0,
            "created_at": datetime.utcnow() - timedelta(days=5),
        },
        {
            "segment": "active",
            "phone": primary,
            "phone_index": 0,
            "city": "Hyderabad",
            "latitude": 17.385,
            "longitude": 78.486,
            "donations_till_date": 6,
            "last_donation_date": today - timedelta(days=90),
            "calls_to_donations_ratio": 1.5,
            "created_at": datetime.utcnow() - timedelta(days=400),
        },
        {
            "segment": "at_risk",
            "phone": secondary,
            "phone_index": 1,
            "city": "Chennai",
            "latitude": 13.082,
            "longitude": 80.270,
            "donations_till_date": 3,
            "last_donation_date": today - timedelta(days=240),
            "calls_to_donations_ratio": 5.5,
            "created_at": datetime.utcnow() - timedelta(days=500),
        },
        {
            "segment": "dormant",
            "phone": primary,
            "phone_index": 1,
            "city": "Bengaluru",
            "latitude": 12.972,
            "longitude": 77.594,
            "donations_till_date": 10,
            "last_donation_date": today - timedelta(days=450),
            "calls_to_donations_ratio": 1.2,
            "created_at": datetime.utcnow() - timedelta(days=800),
        },
    ]

    updated: List[Dict] = []
    for spec in profiles:
        role = _SAMPLE_ROLE.format(segment=spec["segment"])
        donor = db.query(Donor).filter(Donor.role == role).first()
        if not donor:
            pool = (
                db.query(Donor)
                .filter(Donor.phone == spec["phone"])
                .order_by(Donor.created_at.desc())
                .all()
            )
            donor = pool[spec["phone_index"]] if len(pool) > spec["phone_index"] else None
        if not donor:
            donor = Donor(
                name="Volunteer",
                phone=spec["phone"],
                blood_group="O Positive",
                eligibility_status="eligible",
                is_active=True,
                consent_given=True,
            )
            db.add(donor)
            db.flush()

        donor.role = role
        donor.phone = spec["phone"]
        donor.city = spec["city"]
        donor.latitude = spec["latitude"]
        donor.longitude = spec["longitude"]
        donor.donations_till_date = spec["donations_till_date"]
        donor.last_donation_date = spec["last_donation_date"]
        donor.calls_to_donations_ratio = spec["calls_to_donations_ratio"]
        donor.total_calls = int(spec["donations_till_date"] * spec["calls_to_donations_ratio"])
        donor.created_at = spec["created_at"]
        donor.eligibility_status = "eligible"
        donor.next_eligible_date = today
        donor.is_active = True
        donor.consent_given = True
        donor.language_preference = {
            "Hyderabad": "te",
            "Chennai": "ta",
            "Bengaluru": "kn",
        }.get(spec["city"], "en")

        seg, reason = classify_segment(donor, today=today)
        updated.append(
            {
                "donor_id": donor.id,
                "name": donor.name,
                "phone": donor.phone,
                "city": donor.city,
                "target_segment": spec["segment"],
                "actual_segment": seg,
                "reason": reason,
            }
        )

    db.commit()
    counts = segment_counts(db)
    return {
        "status": "ok",
        "profiles": updated,
        "segment_counts": counts,
        "primary_phone": primary,
    }


def outreach_sample_profiles(db: Session) -> List[Dict]:
    """One sample donor per segment for quick coordinator links."""
    results = []
    for seg in SEGMENTS:
        role = _SAMPLE_ROLE.format(segment=seg)
        d = db.query(Donor).filter(Donor.role == role).first()
        if not d:
            d = (
                db.query(Donor)
                .filter(Donor.phone.in_(settings.demo_donor_phones_list))
                .limit(100)
                .all()
            )
            matches = [x for x in d if classify_segment(x)[0] == seg]
            d = matches[0] if matches else None
        if d:
            touch = locale_touch_for_donor(
                city=d.city,
                latitude=float(d.latitude) if d.latitude else None,
                longitude=float(d.longitude) if d.longitude else None,
            )
            results.append(
                {
                    "segment": seg,
                    "donor_id": d.id,
                    "name": d.name,
                    "phone": d.phone,
                    "city": d.city,
                    "native_headline": touch.headline,
                    "native_lang_label": touch.lang_label,
                }
            )
    return results
