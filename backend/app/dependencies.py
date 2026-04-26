from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status

from app.core.db import execute, fetch_one
from app.core.security import utc_now_iso


def _parse_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token ausente.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")
    return token


def get_current_session(authorization: str | None = Header(default=None)) -> dict:
    token = _parse_bearer_token(authorization)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    session = fetch_one(
        """
        SELECT
            sessions.id AS session_id,
            sessions.token_hash,
            sessions.expires_at,
            users.id AS user_id,
            users.name,
            users.email,
            users.role,
            users.active
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
        """,
        (token_hash,),
    )

    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão não encontrada.")
    if not session["active"]:
        execute("DELETE FROM sessions WHERE id = ?", (session["session_id"],))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inativo.")

    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at <= datetime.now(timezone.utc):
        execute("DELETE FROM sessions WHERE id = ?", (session["session_id"],))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada.")

    execute(
        "UPDATE sessions SET last_used_at = ? WHERE id = ?",
        (utc_now_iso(), session["session_id"]),
    )
    return session


def get_current_user(session: dict = Depends(get_current_session)) -> dict:
    return {
        "id": session["user_id"],
        "name": session["name"],
        "email": session["email"],
        "role": session["role"],
        "session_id": session["session_id"],
    }


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] not in {"adm", "superadm"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissao insuficiente.")
    return current_user


def require_superadmin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] != "superadm":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas superadm pode executar esta acao.")
    return current_user
