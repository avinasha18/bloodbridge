#!/usr/bin/env bash
# Start BloodBridge locally for a Loom walkthrough (SQLite + mocked AWS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"

if [[ ! -f "$SERVER/.env" ]]; then
  cp "$SERVER/.env.example" "$SERVER/.env"
  echo "Created server/.env from .env.example"
fi

if [[ ! -f "$SERVER/bloodbridge.db" ]]; then
  echo "Seeding local SQLite (first run — may take a few minutes)…"
  cd "$SERVER"
  if [[ -d .venv ]]; then
    .venv/bin/python -m app.seed.seed_data --reset
  else
    python3 -m app.seed.seed_data --reset
  fi
fi

echo ""
echo "Terminal 1 — backend:"
echo "  cd server && .venv/bin/uvicorn app.main:app --reload --port 8000"
echo ""
echo "Terminal 2 — frontend:"
echo "  cd client && npm run dev"
echo ""
echo "Open http://localhost:5173"
echo "Coordinator login: wetwo / wetwo"
echo "Mock SMS log: server/outbox/sms_log.jsonl"
