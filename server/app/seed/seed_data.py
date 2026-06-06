"""Seed the BloodBridge DB from the real Blood Warriors `Dataset.csv`.

Behaviour:
  1. Imports every row as a Donor record (real schema preserved).
  2. Deduplicates and extracts a Patient record for each unique bridge_id
     that has an expected_next_transfusion_date.
  3. Assigns demo phone numbers from `DEMO_PHONES` (alternating). Real
     dataset has none, and the SMS flow needs reachable numbers.
  4. Shifts all dates forward by `YEAR_SHIFT` (default +1 year) so that
     2025 dataset dates land in the current operating window.
  5. Computes `showup_rate` heuristically from existing signals
     (Active + low calls_to_donations_ratio → high showup).
  6. Trains the RandomForest reliability model and writes real
     `reliability_score` values to every donor.
  7. Marks `profile_complete = False` for donors missing blood_group or
     location — the coordinator can later send them a profile-completion
     SMS link.
  7. Seeds default per-blood-group `system_protocols` and a handful of
     demo blood requests in mixed states so the dashboard looks live.

CLI:
  python -m app.seed.seed_data --reset           # nuke + reseed
  python -m app.seed.seed_data --csv path/to.csv # override CSV path
"""

from __future__ import annotations

import argparse
import csv
import logging
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.db import models
from app.db.init_db import init_db
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Demo phone numbers (your number + your friend's). The dataset has none.
# Alternate assignment so the demo can show messages going to both.
# ----------------------------------------------------------------------
DEMO_PHONES = ["+917386223111", "+918247364827"]

# Shift dataset dates forward so the 2025-era schedule lines up with
# today's operating window. Override via env / arg if needed.
YEAR_SHIFT_DAYS = 365

# Hyderabad cluster fallback (dataset has many sparse coords)
HYD_LAT = (17.30, 17.55)
HYD_LON = (78.30, 78.60)

HOSPITALS = [
    ("Apollo Hospitals, Hyderabad", 17.4204, 78.4490),
    ("KIMS Hospital, Secunderabad", 17.4400, 78.4980),
    ("NIMS, Punjagutta", 17.4280, 78.4500),
    ("Care Hospitals, Banjara Hills", 17.4150, 78.4400),
    ("Yashoda Hospitals, Somajiguda", 17.4140, 78.4550),
    ("Continental Hospitals, Gachibowli", 17.4400, 78.3500),
    ("Citizens Hospital, Nallagandla", 17.4570, 78.3050),
    ("Rainbow Children's, Banjara Hills", 17.4150, 78.4350),
    ("AIG Hospital, Gachibowli", 17.4500, 78.3700),
    ("Sunshine Hospitals, Secunderabad", 17.4350, 78.5060),
]

CITIES = ["Hyderabad"]

COORDINATORS = [
    ("Sneha Reddy", "+919812345001", "sneha@bloodwarriors.in"),
    ("Karthik Iyer", "+919812345002", "karthik@bloodwarriors.in"),
    ("Priya Rao", "+919812345003", "priya@bloodwarriors.in"),
]

DATASET_CSV_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "dataset.csv"

# Roles in the Blood Warriors dataset:
#   "Bridge Donor"     → recurring donor for a specific patient
#   "Emergency Donor"  → on-demand donor pool
#   "Guest"            → registered but never donated (unconverted)
#   "Patient"          → person needing blood (thalassemia bridge)
#   "Volunteer"        → ops staff, not a donor
DONOR_ROLES = {"Bridge Donor", "Emergency Donor", "Guest"}


# ======================================================================
# Helpers
# ======================================================================


def _safe_float(v) -> Optional[float]:
    if v in (None, "", "NA", "nan", "\\N"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _safe_int(v) -> Optional[int]:
    if v in (None, "", "NA", "nan", "\\N"):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _parse_date(v) -> Optional[date]:
    if not v or v in ("NA", "nan", "\\N"):
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            d = datetime.strptime(v.strip(), fmt).date()
            return d + timedelta(days=YEAR_SHIFT_DAYS)
        except ValueError:
            continue
    return None


def _clean(v: Optional[str]) -> Optional[str]:
    if v in (None, "", "NA", "nan", "\\N"):
        return None
    return v.strip().lstrip("\\x27").lstrip("\\x") or None


def _short_id(s: str, n: int = 12) -> str:
    return (s or "")[:n] if s else ""


def _compute_showup_rate(
    active_status: Optional[str],
    calls_ratio: Optional[float],
    donations: int,
    rng: random.Random,
) -> float:
    """Heuristic show-up rate when ground truth is missing.

    Active donors with a low call:donation ratio reliably show up.
    Inactive donors with a high ratio frequently no-show after agreeing.
    """
    if donations == 0:
        # Never donated → ~50% expected show-up (cold prior)
        return round(max(0.20, min(0.65, rng.gauss(0.50, 0.10))), 4)
    if active_status == "Active":
        base = 0.92 if (calls_ratio or 5) <= 1.5 else 0.82
    else:
        base = 0.55 if (calls_ratio or 5) <= 3 else 0.35
    return round(max(0.10, min(0.99, rng.gauss(base, 0.06))), 4)


def _normalize_gender(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    if v.lower().startswith("prefer"):
        return "Other"
    return v[:30]


def _is_profile_complete(blood_group, latitude, longitude) -> bool:
    return bool(blood_group) and latitude is not None and longitude is not None


# ======================================================================
# Importers
# ======================================================================


def import_dataset(
    db: Session,
    csv_path: Path = DATASET_CSV_PATH,
    seed: int = 7,
) -> Dict:
    """Import the real Blood Warriors dataset.

    Returns counts so the CLI can print a summary.
    """
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Dataset CSV not found at {csv_path}. Move dataset.csv to that path."
        )

    rng = random.Random(seed)
    donor_count = 0
    patient_seen: Dict[str, models.Patient] = {}
    user_seen: set = set()
    patient_count = 0
    skipped = 0
    duplicate_rows = 0

    buffer: List[models.Donor] = []

    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            role_raw = _clean(row.get("role"))

            # Extract patient info regardless of donor uniqueness (a single
            # patient row appears once but bridge_id can also surface on
            # bridge-donor rows; we capture either source).
            bridge_id = _clean(row.get("bridge_id"))
            next_tx = _parse_date(row.get("expected_next_transfusion_date"))
            bridge_bg = _clean(row.get("bridge_blood_group"))
            if bridge_id and bridge_id not in patient_seen and next_tx and bridge_bg:
                hospital_name, hlat, hlon = HOSPITALS[len(patient_seen) % len(HOSPITALS)]
                coord = COORDINATORS[len(patient_seen) % len(COORDINATORS)]
                p = models.Patient(
                    external_bridge_id=_short_id(bridge_id, 32),
                    name=_generate_patient_name(rng, len(patient_seen)),
                    blood_group=bridge_bg,
                    bridge_gender=_clean(row.get("bridge_gender")),
                    hospital_name=hospital_name,
                    hospital_lat=hlat,
                    hospital_lon=hlon,
                    city="Hyderabad",
                    coordinator_name=coord[0],
                    coordinator_phone=coord[1],
                    coordinator_email=coord[2],
                    quantity_required=_safe_int(row.get("quantity_required")) or 1,
                    last_transfusion_date=_parse_date(row.get("last_transfusion_date")),
                    expected_next_transfusion_date=next_tx,
                    frequency_in_days=_safe_int(row.get("frequency_in_days")) or 30,
                )
                patient_seen[bridge_id] = p
                patient_count += 1

            if role_raw not in DONOR_ROLES:
                skipped += 1
                continue

            user_id = _clean(row.get("user_id")) or f"row{i}"
            uid_key = _short_id(user_id, 32) or f"row{i}"
            if uid_key in user_seen:
                duplicate_rows += 1
                continue
            user_seen.add(uid_key)

            blood_group = _clean(row.get("blood_group"))
            latitude = _safe_float(row.get("latitude"))
            longitude = _safe_float(row.get("longitude"))
            # Snap missing coordinates to Hyderabad bounding box so the
            # matcher has something to work with.
            if latitude is None:
                latitude = round(rng.uniform(*HYD_LAT), 6)
            if longitude is None:
                longitude = round(rng.uniform(*HYD_LON), 6)

            calls_ratio = _safe_float(row.get("calls_to_donations_ratio"))
            donations = _safe_int(row.get("donations_till_date")) or 0
            total_calls = _safe_int(row.get("total_calls")) or 0
            active_status = _clean(row.get("user_donation_active_status"))
            donor_type = _clean(row.get("donor_type"))
            inactive_comment = _clean(row.get("inactive_trigger_comment"))
            gender = _normalize_gender(_clean(row.get("gender")))
            eligibility = _clean(row.get("eligibility_status")) or "eligible"
            last_donation = _parse_date(row.get("last_donation_date"))
            next_eligible = _parse_date(row.get("next_eligible_date"))
            last_contacted = _parse_date(row.get("last_contacted_date"))
            cycle = _safe_int(row.get("cycle_of_donations"))

            showup = _compute_showup_rate(active_status, calls_ratio, donations, rng)
            total_accepts = max(1, donations + total_calls // 4) if donations or total_calls else 0
            total_shows = int(round(total_accepts * showup)) if total_accepts else 0

            # Placeholder until RandomForest batch scoring runs after import
            base_score = 0.5

            # Assign one of the demo phone numbers
            phone = DEMO_PHONES[i % len(DEMO_PHONES)]
            name = _generate_name(rng, gender, i)

            donor = models.Donor(
                external_user_id=uid_key,
                name=name,
                phone=phone,
                email=None,  # Real dataset has no email; SMS-first system
                blood_group=blood_group,
                gender=gender,
                latitude=latitude,
                longitude=longitude,
                city="Hyderabad",
                donor_type=donor_type or "One-Time Donor",
                role=role_raw,
                donations_till_date=donations,
                calls_to_donations_ratio=calls_ratio,
                cycle_of_donations=cycle,
                total_calls=total_calls,
                eligibility_status=eligibility,
                last_donation_date=last_donation,
                next_eligible_date=next_eligible,
                last_contacted_date=last_contacted,
                user_donation_active_status=active_status,
                inactive_trigger_comment=inactive_comment,
                reliability_score=round(base_score, 4),
                overall_score=round(0.50 * base_score + 0.50 * showup, 4),
                showup_rate=showup,
                total_accepts=total_accepts,
                total_shows=total_shows,
                total_no_shows=max(0, total_accepts - total_shows),
                profile_complete=_is_profile_complete(blood_group, latitude, longitude),
                is_active=True,
                consent_given=True,
                preferred_channel="sms",
                language_preference="en",
            )
            buffer.append(donor)
            donor_count += 1

            if len(buffer) >= 500:
                db.add_all(buffer)
                db.commit()
                buffer.clear()

    if buffer:
        db.add_all(buffer)
        db.commit()

    if patient_seen:
        db.add_all(patient_seen.values())
        db.commit()

    return {
        "donors_imported": donor_count,
        "patients_extracted": patient_count,
        "rows_skipped": skipped,
        "duplicate_donor_rows": duplicate_rows,
    }


def _generate_name(rng: random.Random, gender: Optional[str], idx: int) -> str:
    m = ["Arjun", "Rohan", "Karthik", "Suresh", "Rahul", "Vikram", "Sai",
         "Aditya", "Manish", "Pradeep", "Akhil", "Ravi", "Naveen", "Vishal"]
    f = ["Priya", "Ananya", "Sneha", "Lakshmi", "Divya", "Pooja", "Meera",
         "Swathi", "Bhavana", "Sushma", "Rashmi", "Padma", "Geetha"]
    last = ["Reddy", "Kumar", "Sharma", "Rao", "Iyer", "Patel", "Singh",
            "Goud", "Naidu", "Verma", "Pillai", "Bhatt", "Shetty"]
    pool = m if (gender or "M").lower().startswith(("m", "male")) else f
    first = pool[idx % len(pool)]
    return f"{first} {last[(idx // len(pool)) % len(last)]}"


def _generate_patient_name(rng: random.Random, idx: int) -> str:
    children = ["Aarav Sharma", "Diya Reddy", "Ishaan Kumar", "Aanya Rao",
                "Vihaan Iyer", "Saanvi Patel", "Myra Singh", "Reyansh Goud",
                "Tara Verma", "Krishna Pillai", "Anika Bhatt", "Aryan Shetty",
                "Riya Kumar", "Kabir Sharma"]
    return f"{children[idx % len(children)]} #{idx:03d}"


# ======================================================================
# Static seeds (protocols + demo requests)
# ======================================================================


def seed_protocols(db: Session) -> None:
    if db.query(models.SystemProtocol).count() > 0:
        return
    defaults = [
        ("O Negative", "Hyderabad", 10, 25, 7),
        ("B Negative", "Hyderabad", 8, 20, 7),
        ("A Negative", "Hyderabad", 8, 20, 7),
        ("AB Negative", "Hyderabad", 8, 25, 7),
        ("O Positive", "Hyderabad", 5, 10, 7),
        ("B Positive", "Hyderabad", 5, 10, 7),
        ("A Positive", "Hyderabad", 5, 10, 7),
        ("AB Positive", "Hyderabad", 5, 10, 7),
    ]
    for bg, city, batch, radius, days in defaults:
        db.add(
            models.SystemProtocol(
                blood_group=bg,
                city=city,
                initial_batch_size=batch,
                initial_radius_km=radius,
                escalation_wait_h=2.0,
                proactive_days_ahead=days,
                last_updated_by="seed",
                update_reason="initial seed default",
            )
        )
    db.commit()


def seed_demo_requests(db: Session) -> Dict:
    if db.query(models.BloodRequest).count() > 0:
        return {"created": 0}

    today = datetime.utcnow()
    rng = random.Random(99)

    # 6 requests across the status spectrum
    plans = [
        # (blood_group, urgency, hospital_idx, status, is_proactive, age_hours)
        ("B Positive", "routine", 2, "fulfilled", False, 6),
        ("O Positive", "routine", 4, "fulfilled", True, 14),
        ("A Positive", "urgent", 1, "confirmed", False, 1),
        ("O Negative", "critical", 0, "reserved", False, 0),
        ("A Negative", "urgent", 5, "matching", True, 0),
        ("B Negative", "critical", 3, "failed", False, 8),
    ]
    created_requests = []
    for bg, urgency, hospital_idx, status, is_proactive, age_h in plans:
        hospital_name, lat, lon = HOSPITALS[hospital_idx]
        created_at = today - timedelta(hours=age_h)
        req = models.BloodRequest(
            blood_group=bg,
            units_needed=1,
            urgency=urgency,
            required_by=created_at + timedelta(hours=4 if urgency == "critical" else 24),
            hospital_name=hospital_name,
            hospital_lat=lat,
            hospital_lon=lon,
            status=status,
            is_proactive=is_proactive,
            created_by="system" if is_proactive else "coordinator",
            notes=(
                "Proactive: scheduled transfusion in 5 days" if is_proactive
                else None
            ),
            search_radius_km=25 if bg.endswith("Negative") else 10,
            escalation_level=2 if status == "failed" else 0,
        )
        req.created_at = created_at
        if status in ("reserved", "confirmed", "fulfilled"):
            req.reserved_at = created_at + timedelta(hours=rng.uniform(0.3, 1.5))
        if status in ("confirmed", "fulfilled"):
            req.confirmed_at = req.reserved_at + timedelta(hours=rng.uniform(0.2, 1.0))
        if status == "fulfilled":
            req.fulfilled_at = req.confirmed_at + timedelta(hours=rng.uniform(1, 3))
        if status == "failed":
            req.failed_at = created_at + timedelta(hours=age_h - 1)
            req.failure_reason = (
                "Exhausted all escalation levels — no donors accepted within 6h critical window"
            )
        db.add(req)
        db.flush()
        created_requests.append((req, status))

    db.commit()

    # Build outreach history so timelines look real
    for req, status in created_requests:
        candidates = (
            db.query(models.Donor)
            .filter(
                models.Donor.blood_group == req.blood_group,
                models.Donor.eligibility_status == "eligible",
            )
            .order_by(models.Donor.overall_score.desc())
            .limit(8 if status == "failed" else 5)
            .all()
        )
        assigned = None
        standby_idx = 1
        for batch_idx, donor in enumerate(candidates):
            log = models.OutreachLog(
                request_id=req.id,
                donor_id=donor.id,
                channel="sms",
                message_id=f"demo-{req.id[:8]}-{donor.id[:6]}",
                batch_number=1 if batch_idx < 5 else 2,
                rank_score=round(float(donor.overall_score or 0.5), 4),
                distance_km=round(rng.uniform(0.8, 9.5), 2),
                reliability_score_snapshot=float(donor.reliability_score),
                showup_rate_snapshot=float(donor.showup_rate),
            )

            if status == "fulfilled":
                if batch_idx == 0:
                    log.response = "accept"
                    log.assignment_role = "donated"
                    assigned = donor
                elif batch_idx < 3:
                    if rng.random() < 0.5:
                        log.response = "accept"
                        log.assignment_role = "standby"
                        log.standby_rank = standby_idx
                        standby_idx += 1
                    else:
                        log.response = "decline"
                        log.assignment_role = "declined"
            elif status == "confirmed":
                if batch_idx == 0:
                    log.response = "accept"
                    log.assignment_role = "assigned"
                    log.confirmation_sent_at = req.confirmed_at - timedelta(hours=1)
                    log.confirmation_response = "confirmed"
                    log.confirmation_response_at = req.confirmed_at
                    assigned = donor
                elif batch_idx < 3:
                    if rng.random() < 0.5:
                        log.response = "accept"
                        log.assignment_role = "standby"
                        log.standby_rank = standby_idx
                        standby_idx += 1
            elif status == "reserved":
                if batch_idx == 0:
                    log.response = "accept"
                    log.assignment_role = "assigned"
                    assigned = donor
                elif batch_idx < 3:
                    if rng.random() < 0.4:
                        log.response = "accept"
                        log.assignment_role = "standby"
                        log.standby_rank = standby_idx
                        standby_idx += 1
            elif status == "failed":
                log.response = "decline"
                log.assignment_role = "declined"
                log.decline_reason = rng.choice([
                    "Out of city", "Sick", "Recently donated", "Family event"
                ])

            log.sent_at = req.created_at + timedelta(minutes=batch_idx * 2)
            if log.response:
                log.responded_at = log.sent_at + timedelta(minutes=rng.randint(5, 90))
            db.add(log)

        if assigned:
            req.assigned_donor_id = assigned.id

        if status == "failed":
            for lvl in (1, 2):
                db.add(
                    models.EscalationEvent(
                        request_id=req.id,
                        escalation_level=lvl,
                        trigger_reason="all_declined" if lvl == 1 else "timeout",
                        donors_tried=5 * lvl,
                        expanded_radius_km=10 + lvl * 10,
                        triggered_at=req.created_at + timedelta(hours=lvl * 2),
                    )
                )
            db.add(
                models.FailureLog(
                    request_id=req.id,
                    blood_group=req.blood_group,
                    city="Hyderabad",
                    urgency=req.urgency,
                    failure_type="all_declined",
                    donors_contacted=8,
                    donors_responded=8,
                    donors_accepted=0,
                    resolution="unresolved",
                    logged_at=req.failed_at,
                )
            )

    # One Bedrock-style protocol update for the audit log
    db.add(
        models.ProtocolUpdateLog(
            blood_group="O Negative",
            city="Hyderabad",
            previous_state={"initial_batch_size": 10, "initial_radius_km": 25, "proactive_days_ahead": 7},
            new_state={"initial_batch_size": 12, "initial_radius_km": 32, "proactive_days_ahead": 9},
            rationale=(
                "3 failures of type 'all_declined' for O Negative in Hyderabad over "
                "last 7 days. Expanded radius from 25km to 32km and batch from 10 "
                "to 12. Proactive window pushed from 7 to 9 days."
            ),
            updated_by="bedrock-analyzer",
            created_at=today - timedelta(hours=8),
        )
    )

    db.commit()
    return {"created": len(created_requests)}


# ======================================================================
# CLI entry
# ======================================================================


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed BloodBridge DB from real dataset.")
    parser.add_argument("--csv", default=str(DATASET_CSV_PATH))
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--no-demo-requests", action="store_true")
    args = parser.parse_args()

    if args.reset:
        from app.db.init_db import drop_all
        drop_all()
    init_db()

    db = SessionLocal()
    try:
        seed_protocols(db)
        result = import_dataset(db, Path(args.csv))
        if not args.no_demo_requests:
            seed_demo_requests(db)

        from app.services.reliability_service import train_and_sync_db

        print("Training reliability model and syncing scores to DB...")
        ml_result = train_and_sync_db(db)
        result["reliability"] = ml_result

        eligible = db.query(models.Donor).filter(
            models.Donor.eligibility_status == "eligible"
        ).count()
        incomplete = db.query(models.Donor).filter(
            models.Donor.profile_complete.is_(False)
        ).count()
        print("=" * 60)
        print(f"  Donors imported          : {result['donors_imported']}")
        print(f"    eligible               : {eligible}")
        print(f"    profile incomplete     : {incomplete}")
        print(f"  Patients extracted       : {result['patients_extracted']}")
        print(f"  Rows skipped (non-donor) : {result['rows_skipped']}")
        print(f"  Duplicate donor rows     : {result['duplicate_donor_rows']}")
        if "reliability" in result:
            sync = result["reliability"].get("sync", result["reliability"].get("import", {}))
            train = result["reliability"].get("training", {})
            print(f"  ML reliability updated   : {sync.get('updated', 0)} donors")
            if train.get("roc_auc") is not None:
                print(f"    model ROC AUC          : {train['roc_auc']:.3f}")
        print(f"  Blood requests (demo)    : {db.query(models.BloodRequest).count()}")
        print(f"  System protocols         : {db.query(models.SystemProtocol).count()}")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    main()
