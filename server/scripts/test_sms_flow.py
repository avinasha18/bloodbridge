"""End-to-end test of the SMS-first reserve/standby flow (in-process).

Skips HTTP and the orchestrator thread by driving the services directly.
Prints a step-by-step trace of the demo storyline:

  1. Create a critical O Negative request
  2. Match top 5 reliable donors
  3. Send outreach SMS to each (logs to outbox/)
  4. Simulate donor B replying YES first  -> reserved + assigned
  5. Simulate donor A and C replying YES  -> placed on standby
  6. Coordinator sends hospital location  -> SMS to assigned donor
  7. Day-before re-confirmation prompt    -> SMS to assigned donor
  8. Assigned donor replies NOT AVAILABLE -> promote standby
  9. Coordinator marks donated            -> request fulfilled, showup_rate updated
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./bloodbridge.db")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.db.models import BloodRequest, Donor, OutreachLog, ResponseToken  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.services import reservation  # noqa: E402
from app.services.matcher import match_donors  # noqa: E402
from app.services.sms_sender import send_location_sms, send_outreach_sms, token_expiry_hours  # noqa: E402


def step(n: int, msg: str) -> None:
    print(f"\n{'='*70}\n[STEP {n}] {msg}\n{'='*70}")


def main() -> None:
    db: Session = SessionLocal()
    try:
        step(1, "Create a critical O Negative request")
        req = BloodRequest(
            blood_group="O Negative",
            units_needed=1,
            urgency="critical",
            required_by=datetime.utcnow() + timedelta(hours=4),
            hospital_name="Apollo Hospitals, Hyderabad",
            hospital_lat=17.4204,
            hospital_lon=78.4490,
            status="matching",
            created_by="test_script",
            search_radius_km=25,
            notes="SMS-first end-to-end test",
        )
        db.add(req)
        db.commit()
        db.refresh(req)
        print(f"  request_id = {req.id}")

        step(2, "Match top 5 reliable donors")
        matches = match_donors(db, req, radius_km=25, batch_size=5)
        print(f"  {len(matches)} matches:")
        for m in matches:
            print(
                f"    {m.donor_id[:8]}  {m.name:<22}  {m.phone:<15}  "
                f"reliability={m.reliability_score:.2f}  showup={m.showup_rate:.2f}  "
                f"rank={m.final_rank_score:.3f}"
            )

        step(3, "Send outreach SMS to each → tokens persisted")
        logs = []
        for m in matches:
            donor = db.query(Donor).get(m.donor_id)
            sms = send_outreach_sms(
                phone=donor.phone,
                blood_group=req.blood_group,
                hospital_name=req.hospital_name,
                urgency=req.urgency,
                units_needed=req.units_needed,
            )
            log = OutreachLog(
                request_id=req.id,
                donor_id=donor.id,
                channel="sms",
                message_id=sms.message_id,
                batch_number=1,
                rank_score=m.final_rank_score,
                distance_km=max(m.distance_km, 0),
                reliability_score_snapshot=m.reliability_score,
                showup_rate_snapshot=m.showup_rate,
            )
            db.add(log)
            db.flush()
            if sms.token:
                db.add(
                    ResponseToken(
                        token=sms.token,
                        request_id=req.id,
                        donor_id=donor.id,
                        outreach_log_id=log.id,
                        expires_at=token_expiry_hours(),
                        purpose="outreach",
                    )
                )
            logs.append((log, donor, sms.token))
        req.status = "outreach_sent"
        db.commit()
        print(f"  {len(logs)} SMS sent + tokens written to DB")
        print(f"  Sample SMS body for donor #2: {logs[1][2][:0]}")  # noqa
        print("  " + open("outbox/sms_log.jsonl").readlines()[-1][:140])

        step(4, "Donor #2 (B) replies YES first  → reserved + assigned")
        result = reservation.record_yes(db, logs[1][0])
        print(f"  result: {json.dumps(result, default=str)}")
        db.refresh(req)
        print(f"  request.status={req.status}  assigned_donor_id={req.assigned_donor_id[:8]}")

        step(5, "Donors #0 (A) and #2 (C) reply YES → standby")
        for i in (0, 2):
            r = reservation.record_yes(db, logs[i][0])
            print(f"  donor[{i}] -> {r['status']} rank={r.get('standby_rank')}")

        step(6, "Coordinator sends hospital location SMS to assigned donor")
        assigned = db.query(Donor).get(req.assigned_donor_id)
        sms = send_location_sms(
            phone=assigned.phone,
            hospital_name=req.hospital_name,
            hospital_lat=float(req.hospital_lat),
            hospital_lon=float(req.hospital_lon),
            when="Tomorrow 10:00 AM",
        )
        req.location_sent_at = datetime.utcnow()
        db.commit()
        print(f"  location SMS sent to {assigned.phone}")

        step(7, "Day-before re-confirmation prompt → SMS to assigned donor")
        result = reservation.send_pre_confirmation(db, req.id)
        print(f"  result: {result}")
        pre_token = result["token"]

        step(8, "Assigned donor replies NOT AVAILABLE → promote standby")
        assigned_log = (
            db.query(OutreachLog)
            .filter_by(request_id=req.id, assignment_role="assigned")
            .first()
        )
        result = reservation.record_pre_confirmation_response(db, assigned_log, "decline")
        print(f"  result: {json.dumps(result, default=str)}")
        db.refresh(req)
        new_assigned = db.query(Donor).get(req.assigned_donor_id) if req.assigned_donor_id else None
        if new_assigned:
            print(f"  new assigned donor = {new_assigned.name} ({new_assigned.phone})")
        else:
            print(f"  request.status={req.status} (no standby available)")

        step(9, "Coordinator marks donated → fulfilled + showup_rate updated")
        if req.assigned_donor_id:
            before = db.query(Donor).get(req.assigned_donor_id).showup_rate
            result = reservation.coordinator_marks_donated(db, req.id)
            db.refresh(req)
            donor = db.query(Donor).get(req.assigned_donor_id)
            print(f"  result: {result}")
            print(f"  request.status={req.status}")
            print(
                f"  donor showup_rate: {before:.4f} → {donor.showup_rate:.4f}  "
                f"(accepts={donor.total_accepts}, shows={donor.total_shows})"
            )

        step(10, "Summary - outreach log timeline")
        for log in (
            db.query(OutreachLog)
            .filter_by(request_id=req.id)
            .order_by(OutreachLog.sent_at.asc())
            .all()
        ):
            d = db.query(Donor).get(log.donor_id)
            print(
                f"  {(d.name or '-'):<22}  role={str(log.assignment_role or '-'):<10}  "
                f"rank={log.standby_rank}  response={log.response or '-'}  "
                f"confirm={log.confirmation_response or '-'}"
            )

        print(f"\nOutbox SMS count: {sum(1 for _ in open('outbox/sms_log.jsonl'))}")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
