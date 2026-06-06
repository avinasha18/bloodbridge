# BloodBridge Intelligence Network (BIN)

> **AI for Good 2.0 · Blend360 India**
> An AWS-native blood logistics platform that **prevents** shortages instead of reacting to them.

While other teams build a request-management dashboard, BIN goes further:

1. **Imports the real Blood Warriors `Dataset.csv`** (7,000+ donors, 80
   thalassemia patient bridges, full transfusion schedule) directly into
   the operating DB.
2. **Predicts** when each patient will need blood — using
   `expected_next_transfusion_date` — and acts 5–7 days early.
3. **Contacts** the top reliable donors by **SMS only** (no email,
   matching how Indian Blood Warriors volunteers actually operate).
4. **Reserves the first donor** to reply YES, automatically placing the
   rest on a **standby pool** so we never double-book and never lose a
   backup.
5. **Re-confirms** the assigned donor 24 hours before the donation; if
   they cancel, the next standby is auto-promoted with a fresh SMS.
6. **Tracks `show_up_rate`** — of the donors who said YES, how many
   actually donated — as the real operational signal (more honest than
   acceptance alone).
7. **Self-improves** via a nightly Bedrock job that auto-tunes matching
   parameters in `system_protocols`.

---

## Repository Layout

```
bloodbridge/
├── server/
│   ├── data/
│   │   └── dataset.csv               # Real Blood Warriors dataset (7k rows)
│   ├── app/
│   │   ├── main.py                   # FastAPI entry
│   │   ├── config.py                 # All env-driven settings
│   │   ├── db/                       # SQLAlchemy models + sessions
│   │   ├── schemas/                  # Pydantic request/response
│   │   ├── routers/                  # donors, patients, requests, outreach,
│   │   │                             # coordinator, donor_self, analytics,
│   │   │                             # ai, protocols, jobs
│   │   ├── services/                 # matcher, sms_sender, sns, ses,
│   │   │                             # reservation, bedrock, sagemaker,
│   │   │                             # step_functions, analytics
│   │   ├── lambdas/                  # 8 Lambda handlers
│   │   └── seed/seed_data.py         # Imports real Dataset.csv
│   ├── scripts/
│   │   └── test_sms_flow.py          # End-to-end reserve/standby walkthrough
│   ├── infrastructure/               # Step Functions / EventBridge / DynamoDB
│   ├── outbox/                       # Mock SMS + SES output (gitignored)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
└── client/                           # React + Vite admin dashboard
    └── src/
        ├── pages/                    # Dashboard, Requests, RequestDetail,
        │                             # Donors, DonorDetail, Patients,
        │                             # Analytics, AI, Protocols
        ├── components/               # ui primitives + layout
        ├── hooks/                    # useAsync, usePoll
        └── lib/                      # api client + formatting
```

---

## Quickstart (Local)

### 1. Backend

```bash
cd server
python3.13 -m venv .venv          # Python 3.11–3.13 supported
.venv/bin/pip install -r requirements.txt
cp .env.example .env              # default config uses local SQLite + AWS mocks

# Import the real Blood Warriors Dataset.csv (must live at server/data/dataset.csv).
# 6,800+ donors + 80 patients + 8 protocols + 6 demo requests.
.venv/bin/python -m app.seed.seed_data --reset

# Run the API
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The API will be at `http://localhost:8000` (interactive docs at `/docs`).

In `USE_AWS_MOCKS=true` mode (default), no AWS credentials are needed:

- **SNS SMS** → every message appended to `server/outbox/sms_log.jsonl`
  (and `outbox/sms_rich.jsonl` with kind/token metadata).
- **SES email** → still wired but no longer used for donor outreach.
- **Bedrock** → deterministic template fallbacks.
- **SageMaker** → local logistic-regression approximation (the ML
  team's trained endpoint plugs in by setting `USE_AWS_MOCKS=false` and
  `SAGEMAKER_ENDPOINT_NAME`).
- **Step Functions** → in-process simulator runs the same state machine.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173/dashboard`.

### 3. (Optional) End-to-end SMS-flow walkthrough

```bash
cd server
.venv/bin/python scripts/test_sms_flow.py
```

Prints a 10-step trace covering: matching → outreach → first YES wins →
others go to standby → coordinator sends location → day-before re-confirm
declines → standby promoted → coordinator marks donated → `show_up_rate`
updated.

---

## Data Flow: From SMS Tap to Hospital Admission

```
 ┌────────────────────────────────────────────────────────────────┐
 │  Coordinator creates a request (urgent O Negative)              │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  Matcher ranks donors by:                                       │
 │    0.30 × reliability_score   (XGBoost / mock logistic)        │
 │    0.30 × show_up_rate        (real ops signal)                │
 │    0.20 × proximity                                             │
 │    0.10 × freshness  +  0.10 × scarcity                         │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  Top 5 reliable donors → SMS with tap-link tokens               │
 │  "URGENT: O Negative needed at Apollo.                          │
 │   YES: …/respond?token=…&action=accept                          │
 │   NO:  …/respond?token=…&action=decline"                        │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  Reserve / Standby race                                         │
 │    First YES → request.status='reserved', that donor='assigned'│
 │                "Thank you. You are confirmed for this donation."│
 │    Later YES → "A donor has been assigned. You're on standby." │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  Coordinator clicks "Send Hospital Location"                    │
 │    → SMS with Google Maps link to the assigned donor only       │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  24 h before donation: Coordinator clicks "Send Pre-confirm"    │
 │   YES → request.status='confirmed'                              │
 │   NO  → automatically promote next standby, send promotion SMS  │
 │         If no standby left → request='failed' + hospital alert  │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  Coordinator clicks "Mark Donated"  → request='fulfilled'       │
 │    show_up_rate ← total_shows / total_accepts (updated live)    │
 │  …or "Mark No-Show" → showup_rate down, next standby promoted   │
 └────────────────────────────────────────────────────────────────┘
```

---

## SMS Outreach Catalogue

All bodies are kept short enough for a single SMS segment.

| Kind                    | When                                                    |
|-------------------------|---------------------------------------------------------|
| `outreach`              | Initial YES/NO request to top 5 donors                  |
| `assigned_confirmation` | First YES winner — "You are confirmed for this donation"|
| `standby_notice`        | Subsequent YES — placed on standby                      |
| `standby_promotion`     | Earlier donor cancelled — you're up, tap to re-accept   |
| `pre_confirmation`      | Day-before re-confirmation prompt                       |
| `location`              | Coordinator-triggered hospital details + Google Maps    |
| `profile_completion`    | Coordinator → donor with missing blood_group/location   |
| `self_register_invite`  | Coordinator-generated link for new donor signup         |

---

## Donor Onboarding & Profile Completion

Two no-auth, token-driven flows:

### A. Coordinator → existing donor with missing details

1. Coordinator opens `/donors`, sees a "profile incomplete" callout.
2. Clicks **Send Profile Link** on a row → SMS goes out to that donor.
3. Donor taps link → public form at `/donor-self/profile?token=…`.
4. Donor fills blood group + lat/long (browser geolocation prefilled) →
   `Donor.profile_complete` flips to True and they enter the matching
   pool.

### B. Admin opens a self-register link

1. Coordinator clicks **Generate Self-Register Link** on `/donors`.
2. Optionally provides a phone number to SMS the link to, OR copies the
   link to share elsewhere.
3. New donor opens the public form → creates their `Donor` row.

### C. Admin form (Blood Warriors admin only)

1. Coordinator clicks **Add Donor** → modal form.
2. Saves directly via `POST /donors`.

---

## AWS Service Map

| Service              | Used For                                          | Local Stand-in              |
|----------------------|---------------------------------------------------|-----------------------------|
| **App Runner**       | FastAPI backend (Dockerfile shipped)              | `uvicorn --reload`          |
| **RDS PostgreSQL**   | Donors / patients / requests / failure logs       | SQLite (`bloodbridge.db`)   |
| **DynamoDB**         | Response tokens (TTL 48h), active-request cache   | `response_tokens` table     |
| **Lambda**           | 8 functions (see `app/lambdas/`)                  | Imported directly by API    |
| **Step Functions**   | Orchestration (`bin_orchestrator.json`)           | In-process simulator        |
| **SNS**              | All donor outreach (SMS)                          | `outbox/sms_log.jsonl`      |
| **SES**              | Coordinator notifications only                    | `outbox/*.html`             |
| **EventBridge**      | Cron: proactive 6 AM, analyzer 2 AM               | `POST /jobs/.../run`        |
| **Bedrock (Haiku)**  | SMS copy + match explanations + analysis          | Template fallbacks          |
| **SageMaker**        | Donor reliability scoring                         | Logistic approximation      |
| **API Gateway**      | `/respond` one-tap SMS handler                    | FastAPI route               |
| **CloudFront + S3**  | React app delivery                                | Vite dev server             |

---

## Key Endpoints

### Public (no auth — driven by SMS tap-links)
| Method | Path                              | Purpose                                |
|--------|-----------------------------------|----------------------------------------|
| GET    | `/respond?token=…&action=accept`  | Donor taps YES → reserve/standby route |
| GET    | `/respond?token=…&action=decline` | Donor taps NO                          |
| GET    | `/donor-self/profile?token=…`     | Profile-completion form                |
| POST   | `/donor-self/profile?token=…`     | Submit profile updates                 |
| GET    | `/donor-self/register?token=…`    | Self-registration form                 |
| POST   | `/donor-self/register?token=…`    | Submit new donor record                |

### Coordinator (admin)
| Method | Path                                                | Purpose                                  |
|--------|-----------------------------------------------------|------------------------------------------|
| POST   | `/coordinator/requests/{id}/send-location`          | SMS hospital + Google Maps               |
| POST   | `/coordinator/requests/{id}/send-pre-confirm`       | Day-before re-confirmation SMS           |
| POST   | `/coordinator/requests/{id}/mark-donated`           | Close as fulfilled + raise show-up rate  |
| POST   | `/coordinator/requests/{id}/mark-no-show`           | Promote standby, lower show-up rate      |
| POST   | `/coordinator/requests/{id}/promote-standby`        | Manual standby promotion                 |
| POST   | `/coordinator/donors/{id}/send-profile-link`        | SMS profile-completion link              |
| POST   | `/coordinator/donors/self-register-invite`          | Generate/send self-registration link     |
| GET    | `/donors/incomplete`                                | Donors missing profile fields            |

---

## Demo Flow (10 minutes)

| Time   | Action                                                                | Page              |
|--------|-----------------------------------------------------------------------|-------------------|
| 0–1m   | Open dashboard. Point at **6,800+ donors / 80 patients**.             | `/dashboard`      |
| 1–2m   | Click **Run Proactive Scheduler** → live request creation banner.     | `/dashboard`      |
| 2–4m   | New Request → critical O Negative at Apollo Hospitals.                | `/requests/new`   |
| 4–5m   | Open the request → **AI Explain Matches** + watch SMS in `outbox/`.   | `/requests/:id`   |
| 5–6m   | Open one SMS tap-link → first YES → request becomes **reserved**.     | (any browser)     |
| 6–7m   | Tap a second YES link → that donor is placed on **standby**.          | (any browser)     |
| 7–8m   | Coordinator: **Send Hospital Location** + **Send Day-Before Re-confirm**. | `/requests/:id` |
| 8–9m   | Donors page → see profile-incomplete callout → **Send Profile Link**. | `/donors`        |
| 9–10m  | Analytics + Protocols → Bedrock-driven self-improvement log.          | `/analytics`     |

---

## What Makes This Different

1. **Real dataset, real volunteers.** We import the actual Blood Warriors
   `Dataset.csv` and respect its operational reality: SMS-first, no
   email, donors don't install apps.
2. **Reserve / Standby is the right state machine.** We never double-book
   and we never lose a backup donor. The first YES wins, standby pool
   auto-promotes on cancel.
3. **Show-up rate is the truth.** Acceptance is cheap; showing up is
   what saves lives. Show-up rate carries 30% of the rank weight and
   updates live on fulfilled / no-show.
4. **Proactive, not reactive.** 80 thalassemia patients have known
   transfusion schedules. We act 5–7 days before, not after.
5. **Self-improving.** Every failure is analyzed nightly by Bedrock to
   tune `system_protocols` — radius, batch size, lead-time — per blood
   group + city.

---

## Switching to AWS

```
USE_AWS_MOCKS=false
DATABASE_URL=postgresql://…
SAGEMAKER_ENDPOINT_NAME=bin-reliability-scorer-v1
SNS_URGENT_TOPIC_ARN=arn:aws:sns:ap-south-1:…:bin-outreach-sms
STEP_FUNCTIONS_ARN=arn:aws:states:ap-south-1:…:stateMachine:BinOrchestrator
```

No code changes; all clients fall through to their boto3 counterparts.
