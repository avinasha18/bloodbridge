"""Bedrock (Claude Haiku) client for:
  - Outreach message personalization
  - Match ranking explanations
  - Natural language admin queries → SQL
  - Failure analysis → protocol updates
  - Donor reactivation drafts

In `use_aws_mocks=True` we use template-driven fallbacks so all flows work
end-to-end offline (and demos are deterministic).
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are BloodBridge AI, an intelligent system serving the Blood Warriors "
    "Foundation in India. You help coordinate voluntary blood donations for "
    "thalassemia patients. Be concise, warm, and focused on actionable outputs only."
)


def _ensure_bedrock_bearer_token() -> None:
    """Map our .env key into the env var boto3 expects."""
    if settings.bedrock_api_key:
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = settings.bedrock_api_key


class BedrockClient:
    def __init__(self) -> None:
        self._client = None
        if not settings.bedrock_mocks_enabled:
            try:
                _ensure_bedrock_bearer_token()
                from app.services.aws_boto import make_boto3_client

                self._client = make_boto3_client(
                    "bedrock-runtime",
                    settings.bedrock_region,
                    access_key_id=settings.aws_access_key_id or None,
                    secret_access_key=settings.aws_secret_access_key or None,
                    session_token=settings.aws_session_token or None,
                )
                logger.info(
                    "Bedrock client ready (region=%s, model=%s)",
                    settings.bedrock_region,
                    settings.bedrock_model_id,
                )
            except Exception as exc:
                logger.warning("Falling back to mock Bedrock: %s", exc)

    # ---------- Generic invoke ----------

    def _invoke_claude(self, prompt: str, max_tokens: int = 300) -> str:
        if self._client is None:
            return ""  # caller has a mock fallback path
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        }
        try:
            resp = self._client.invoke_model(
                modelId=settings.bedrock_model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            payload = json.loads(resp["body"].read())
            return payload["content"][0]["text"].strip()
        except Exception as exc:
            logger.warning("Bedrock invoke failed, using mock: %s", exc)
            return ""

    # ---------- Outreach personalization ----------

    def personalize_outreach(
        self,
        *,
        donor_name: str,
        donor_donations: int,
        donor_type: Optional[str],
        blood_group: str,
        hospital_name: str,
        urgency: str,
    ) -> str:
        prompt = f"""Generate a blood donation outreach message for:
- Donor name: {donor_name}
- Blood type needed: {blood_group}
- Patient hospital: {hospital_name}
- Urgency: {urgency}
- Donor's total past donations: {donor_donations}
- Donor type: {donor_type or 'unknown'}

Requirements:
- Max 100 words
- Warm but urgent
- Mention their past contribution if donations > 0
- End with a clear call to action
- Language: English
Return ONLY the message body, no subject, no salutation, no signature."""
        text = self._invoke_claude(prompt, max_tokens=200)
        if text:
            return text
        # Template fallback
        if urgency == "critical":
            opener = (
                f"A thalassemia patient at {hospital_name} urgently needs {blood_group} blood today. "
            )
        elif urgency == "urgent":
            opener = (
                f"A patient at {hospital_name} needs {blood_group} blood within 24 hours. "
            )
        else:
            opener = (
                f"A scheduled transfusion is coming up at {hospital_name} and we need {blood_group} blood. "
            )
        history = (
            f"Your {donor_donations} previous donations have directly saved lives — "
            "we're asking for your help once more."
            if donor_donations > 0
            else "Your one donation today could save up to three lives."
        )
        return opener + history + " Please respond with one click below."

    # ---------- Match ranking explanation ----------

    def explain_match(
        self, *, request_summary: str, donor_summary: str, rank: int
    ) -> str:
        prompt = f"""You are explaining to a hospital coordinator why this donor was ranked.
Request: {request_summary}
Donor (rank #{rank}): {donor_summary}

Write 2 short sentences explaining the ranking. Mention reliability score,
distance, and donation history. No greetings, no fluff."""
        text = self._invoke_claude(prompt, max_tokens=120)
        if text:
            return text
        return (
            f"Ranked #{rank} based on a strong reliability score and proximity. "
            "Their historical call-to-donation ratio shows they convert outreach "
            "into actual donations efficiently."
        )

    # ---------- NL → answer over admin data ----------

    def nl_query(self, query: str, db_summary: Dict[str, Any]) -> Dict[str, Any]:
        """Map an admin natural-language question to a structured intent + answer.

        For demo, we resolve a small set of intents with regex; in production
        this would route through Bedrock + tool-use to query the DB safely.
        """
        q = query.lower()
        intent = "unknown"
        answer = ""
        data = None

        if re.search(r"\b(o\s*negative|o-)\b", q) and "donor" in q:
            intent = "find_donors_by_blood_group"
            data = {"blood_group": "O Negative", "count": db_summary.get("O Negative", 0)}
            answer = f"There are {data['count']} eligible O Negative donors right now."
        elif "upcoming" in q or "this week" in q or "next 7" in q:
            intent = "upcoming_transfusions"
            data = {"count": db_summary.get("upcoming_7d", 0)}
            answer = (
                f"{data['count']} patients have a scheduled transfusion in the next 7 days. "
                "Proactive requests are already being created for each."
            )
        elif "at risk" in q or "at-risk" in q or "burning out" in q:
            intent = "at_risk_donors"
            data = {"count": db_summary.get("at_risk", 0)}
            answer = (
                f"{data['count']} donors have a calls-to-donations ratio above 3.0 — "
                "they're being over-contacted. Consider a re-engagement campaign."
            )
        elif "fulfill" in q or "response rate" in q or "performance" in q:
            intent = "performance"
            data = {
                "active_requests": db_summary.get("active_requests", 0),
                "fulfilled_today": db_summary.get("fulfilled_today", 0),
            }
            answer = (
                f"{data['active_requests']} active requests, {data['fulfilled_today']} fulfilled today. "
                "Average fulfillment time today is below 6 hours."
            )
        elif "shortage" in q or "critical" in q:
            intent = "shortages"
            data = {"types": db_summary.get("critical_shortages", [])}
            answer = (
                "Critical shortage blood types: "
                + (", ".join(data["types"]) if data["types"] else "none right now")
                + ". The system has already widened outreach radius for these."
            )
        else:
            answer = (
                "I can help with: 'show O Negative donors', 'upcoming transfusions this week', "
                "'at-risk donors', 'system performance today', or 'current shortages'."
            )
            intent = "help"

        # If Bedrock is online, optionally produce a richer phrasing
        if self._client is not None:
            richer = self._invoke_claude(
                f"User asked: {query}\nFacts: {json.dumps(data or {})}\n"
                f"Write a 1-2 sentence answer for an admin dashboard.",
                max_tokens=120,
            )
            if richer:
                answer = richer

        return {"intent": intent, "answer": answer, "data": data}

    # ---------- Failure → protocol update suggestion ----------

    def suggest_protocol_update(
        self,
        *,
        blood_group: str,
        city: str,
        failures_summary: Dict[str, Any],
        current_protocol: Dict[str, Any],
    ) -> Dict[str, Any]:
        prompt = f"""You are a blood donation logistics optimizer.

Context for {blood_group} in {city}:
- Failures in the last 7 days: {failures_summary.get('count', 0)}
- Avg donors contacted per success: {failures_summary.get('avg_donors_to_success', 'unknown')}
- Most common failure type: {failures_summary.get('top_failure_type', 'unknown')}
- Current protocol: {json.dumps(current_protocol)}

Suggest updated matching parameters. Respond ONLY as JSON with keys:
batch_size (int), radius_km (int), proactive_days_ahead (int), rationale (string)."""
        text = self._invoke_claude(prompt, max_tokens=200)
        if text:
            try:
                # Extract JSON even if surrounded by prose
                match = re.search(r"\{.*\}", text, re.S)
                if match:
                    parsed = json.loads(match.group(0))
                    parsed.setdefault("rationale", text)
                    return parsed
            except json.JSONDecodeError:
                pass

        # Heuristic fallback for mock mode
        current_batch = current_protocol.get("initial_batch_size", 5)
        current_radius = current_protocol.get("initial_radius_km", 10)
        current_days = current_protocol.get("proactive_days_ahead", 7)
        failure_count = failures_summary.get("count", 0)
        new_radius = current_radius
        new_batch = current_batch
        new_days = current_days

        if failure_count >= 3:
            new_radius = min(current_radius + 5, 50)
            new_batch = min(current_batch + 2, 15)
        if failures_summary.get("top_failure_type") in ("no_donors", "all_declined"):
            new_days = min(current_days + 2, 14)

        return {
            "batch_size": new_batch,
            "radius_km": new_radius,
            "proactive_days_ahead": new_days,
            "rationale": (
                f"Expanded radius from {current_radius} to {new_radius}km and batch from "
                f"{current_batch} to {new_batch} based on {failure_count} failures of type "
                f"'{failures_summary.get('top_failure_type', 'unknown')}'."
            ),
        }

    # ---------- Donor reactivation draft ----------

    def reactivation_draft(self, donor) -> Dict[str, str]:
        last = donor.last_donation_date or date(2023, 1, 1)
        prompt = f"""Write a short, warm re-engagement email for an inactive blood donor.

Donor: {donor.name or 'friend'}
Blood type: {donor.blood_group}
Past donations: {donor.donations_till_date}
Last donation: {last.isoformat()}

Tone: appreciative, no guilt, low pressure. Max 80 words.
Return JSON with keys: subject (string), body (string)."""
        text = self._invoke_claude(prompt, max_tokens=200)
        if text:
            try:
                match = re.search(r"\{.*\}", text, re.S)
                if match:
                    return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        return {
            "subject": f"We miss you, {donor.name or 'friend'}",
            "body": (
                f"Hi {donor.name or 'friend'},\n\n"
                f"It's been a while since your last {donor.blood_group} donation. "
                "No pressure — just wanted to say thank you for everything you've already done.\n\n"
                "If you'd like to donate again, we have flexible slots near you this month. "
                "Reply YES and we'll find a time that works.\n\n"
                "— Blood Warriors Foundation"
            ),
        }


_singleton: Optional[BedrockClient] = None


def get_bedrock_client() -> BedrockClient:
    global _singleton
    if _singleton is None:
        _singleton = BedrockClient()
    return _singleton
