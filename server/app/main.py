"""FastAPI entrypoint for the BloodBridge Intelligence Network."""

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.db.init_db import init_db
from app.routers import (
    ai,
    analytics,
    coordinator,
    donor_self,
    donors,
    jobs,
    outreach,
    patients,
    protocols,
    public,
    requests,
)
from app.schemas.common import Health

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)

app = FastAPI(
    title="BloodBridge Intelligence Network",
    version=__version__,
    description=(
        "AWS-native backend for proactive blood donor matching, AI-personalized "
        "outreach, one-click email response, and self-improving protocols."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _health_payload() -> Health:
    from app.services.sms_diagnostics import get_sms_diagnostics

    sms = get_sms_diagnostics()
    return Health(
        version=__version__,
        environment=settings.app_env,
        using_mocks=settings.use_aws_mocks,
        sns_using_mocks=settings.sns_mocks_enabled,
        response_base_url=settings.response_base_url,
        sms_sandbox=sms.get("sandbox"),
        sms_verified_phones=sms.get("verified_phones") or [],
        sms_demo_phones=sms.get("demo_donor_phones") or [],
        sms_override_phone=sms.get("override_phone"),
        sms_hint=sms.get("hint"),
    )


@app.on_event("startup")
def _startup() -> None:
    log = logging.getLogger(__name__)
    log.info("CORS allow_origins: %s", settings.cors_origins_list)
    log.info("API prefix: %s", settings.api_prefix or "(none)")
    init_db()
    from app.services.reliability_model import get_reliability_scorer

    scorer = get_reliability_scorer()
    if scorer.is_loaded:
        logging.getLogger(__name__).info("Donor reliability model loaded")
    else:
        logging.getLogger(__name__).warning(
            "Donor reliability model not found — run "
            "python scripts/train_reliability_model.py or POST /jobs/reliability/train-and-sync"
        )


# ALB/load-balancer probe (no /api prefix)
@app.get("/health", response_model=Health, tags=["meta"])
def health_root() -> Health:
    return _health_payload()


api = APIRouter(prefix=settings.api_prefix or "")

api.include_router(donors.router)
api.include_router(patients.router)
api.include_router(requests.router)
api.include_router(outreach.router)
api.include_router(analytics.router)
api.include_router(ai.router)
api.include_router(protocols.router)
api.include_router(jobs.router)
api.include_router(coordinator.router)
api.include_router(donor_self.router)
api.include_router(public.router)


@api.get("/health", response_model=Health, tags=["meta"])
def health_api() -> Health:
    return _health_payload()


app.include_router(api)
