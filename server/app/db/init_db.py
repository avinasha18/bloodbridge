"""Database initialization helpers.

For local dev we use `Base.metadata.create_all`; production should use
Alembic migrations (scaffold ships in `infrastructure/migrations/`).
"""

from app.db.session import Base, engine

# Importing models registers them with the metadata
from app.db import models  # noqa: F401


def init_db() -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    from app.services.sms_timeline import ensure_message_kind_column
    from app.services.reliability_service import ensure_overall_score_column
    from app.services.patient_migrations import ensure_patient_columns

    ensure_message_kind_column()
    ensure_overall_score_column()
    ensure_patient_columns()
    # overall_score backfill: POST /donors/reliability/sync-overall (not on every boot)


def drop_all() -> None:
    """Drop everything (test fixture utility)."""
    from sqlalchemy import text

    if engine.dialect.name == "postgresql":
        # CASCADE avoids FK ordering issues on RDS.
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
            conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
    else:
        Base.metadata.drop_all(bind=engine)
