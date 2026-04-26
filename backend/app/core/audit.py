from __future__ import annotations

import json
from typing import Any

from app.core.db import execute, fetch_all
from app.core.security import utc_now_iso


def record_audit_event(
    *,
    action: str,
    entity_type: str,
    description: str,
    user_id: int | None = None,
    user_name: str | None = None,
    entity_id: int | None = None,
    session_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    execute(
        """
        INSERT INTO audit_logs (
            user_id, user_name, action, entity_type, entity_id, description,
            metadata_json, session_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            user_name,
            action,
            entity_type,
            entity_id,
            description,
            json.dumps(metadata or {}, ensure_ascii=False),
            session_id,
            utc_now_iso(),
        ),
    )


def list_audit_logs(limit: int = 120) -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT
            audit_logs.*,
            COALESCE(users.email, '') AS user_email
        FROM audit_logs
        LEFT JOIN users ON users.id = audit_logs.user_id
        ORDER BY datetime(audit_logs.created_at) DESC, audit_logs.id DESC
        LIMIT ?
        """,
        (limit,),
    )

    for row in rows:
        try:
            row["metadata"] = json.loads(row["metadata_json"] or "{}")
        except json.JSONDecodeError:
            row["metadata"] = {}
    return rows
