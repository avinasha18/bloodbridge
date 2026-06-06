"""Shared boto3 client factory — uses AWS keys from .env when set.

When AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY are in server/.env, those
override ~/.aws/credentials on your laptop (e.g. company profile).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


def apply_aws_credentials_from_env(
    access_key_id: Optional[str],
    secret_access_key: Optional[str],
    session_token: Optional[str] = None,
) -> None:
    """Push .env credentials into os.environ so all boto3 calls use them."""
    if not access_key_id or not secret_access_key:
        return
    os.environ["AWS_ACCESS_KEY_ID"] = access_key_id.strip()
    os.environ["AWS_SECRET_ACCESS_KEY"] = secret_access_key.strip()
    if session_token:
        os.environ["AWS_SESSION_TOKEN"] = session_token.strip()
    else:
        os.environ.pop("AWS_SESSION_TOKEN", None)
    # Prevent boto3 from preferring a named profile over explicit keys
    os.environ.pop("AWS_PROFILE", None)
    os.environ.pop("AWS_DEFAULT_PROFILE", None)
    logger.info("Using AWS credentials from server/.env (not ~/.aws/credentials)")


def boto3_client_kwargs(
    region_name: str,
    access_key_id: Optional[str] = None,
    secret_access_key: Optional[str] = None,
    session_token: Optional[str] = None,
) -> dict[str, Any]:
    kw: dict[str, Any] = {"region_name": region_name}
    if access_key_id and secret_access_key:
        kw["aws_access_key_id"] = access_key_id.strip()
        kw["aws_secret_access_key"] = secret_access_key.strip()
        if session_token:
            kw["aws_session_token"] = session_token.strip()
    return kw


def make_boto3_client(
    service_name: str,
    region_name: str,
    *,
    access_key_id: Optional[str] = None,
    secret_access_key: Optional[str] = None,
    session_token: Optional[str] = None,
):
    import boto3

    return boto3.client(
        service_name,
        **boto3_client_kwargs(
            region_name,
            access_key_id,
            secret_access_key,
            session_token,
        ),
    )
