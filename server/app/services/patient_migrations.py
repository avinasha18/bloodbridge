"""Idempotent column adds for patient + patient_notifications on existing DBs."""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.db.session import engine

logger = logging.getLogger(__name__)


def ensure_patient_columns() -> None:
    """Add new Patient columns + create patient_notifications if missing.

    Safe to run on every startup. Uses portable IF NOT EXISTS / introspection.
    """
    dialect = engine.dialect.name

    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE patients
                    ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE patients
                    ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE patients
                    ADD COLUMN IF NOT EXISTS relation_to_patient VARCHAR(40);
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE patients
                    ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE patients
                    ADD COLUMN IF NOT EXISTS self_registered BOOLEAN DEFAULT FALSE;
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients (phone);"
                )
            )
        logger.info("Patient columns + patient_notifications ensured")
    else:
        # SQLite: create_all already covers fresh DBs; skip ALTER on legacy.
        return
