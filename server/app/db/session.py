"""SQLAlchemy engine/session setup.

Designed to be portable across SQLite (local dev) and PostgreSQL (RDS prod).
PostgreSQL-specific types degrade gracefully on SQLite via the dialect logic
in `models.py`.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {
            "connect_args": {"check_same_thread": False},
            "echo": False,
        }
    return {
        "pool_pre_ping": True,
        "pool_size": 3,
        "max_overflow": 5,
        "pool_recycle": 300,
        "pool_timeout": 20,
        "connect_args": {"connect_timeout": 10},
        "echo": False,
    }


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
