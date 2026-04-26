from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import SESSION_DURATION_HOURS


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt_bytes = os.urandom(16) if salt is None else bytes.fromhex(salt)
    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 120_000)
    return salt_bytes.hex(), derived_key.hex()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    _, candidate_hash = hash_password(password, salt)
    return hmac.compare_digest(candidate_hash, password_hash)


def generate_session_token() -> tuple[str, str, str]:
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = (utc_now() + timedelta(hours=SESSION_DURATION_HOURS)).isoformat()
    return token, token_hash, expires_at
