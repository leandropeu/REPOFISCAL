from __future__ import annotations

import os
import sqlite3
import uuid
from collections import deque
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.core.audit import list_audit_logs, list_entity_audit_logs, record_audit_event
from app.core.backup import get_backup_status, run_backup_if_due
from app.core.config import ALLOWED_UPLOAD_EXTENSIONS, LOG_DIR, UPLOAD_DIR
from app.core.db import execute, fetch_all, fetch_one
from app.core.security import hash_password, utc_now_iso, verify_password
from app.dependencies import get_current_user, require_admin, require_superadmin
from app.schemas import (
    ContractPayload,
    DeleteElevationPayload,
    FileRecordPayload,
    InvoicePayload,
    ProfessionalPayload,
    RegulatoryDocumentPayload,
    UserPayload,
    UnitPayload,
    VendorPayload,
)


router = APIRouter(prefix="/api", tags=["app"], dependencies=[Depends(get_current_user)])


DOCUMENT_SELECT = """
    SELECT
        regulatory_documents.*,
        units.name AS unit_name,
        units.code AS unit_code,
        vendors.name AS vendor_name,
        professionals.name AS professional_name,
        professionals.role AS professional_role,
        contracts.title AS contract_title
    FROM regulatory_documents
    INNER JOIN units ON units.id = regulatory_documents.unit_id
    LEFT JOIN vendors ON vendors.id = regulatory_documents.vendor_id
    LEFT JOIN professionals ON professionals.id = regulatory_documents.professional_id
    LEFT JOIN contracts ON contracts.id = regulatory_documents.contract_id
"""


def _not_found(entity_name: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_name} nao encontrado(a).")


def _handle_integrity_error(error: sqlite3.IntegrityError) -> HTTPException:
    message = str(error).lower()
    if "unique" in message:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registro ja existente.")
    if "foreign key" in message:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Relacionamento invalido.")
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao foi possivel salvar os dados.")


def _fetch_vendor(vendor_id: int) -> dict:
    vendor = fetch_one(
        """
        SELECT
            vendors.*,
            (
                SELECT COUNT(*)
                FROM professionals
                WHERE professionals.vendor_id = vendors.id
            ) AS professionals_count
        FROM vendors
        WHERE vendors.id = ?
        """,
        (vendor_id,),
    )
    return vendor or {}


def _fetch_professional(professional_id: int) -> dict:
    professional = fetch_one(
        """
        SELECT
            professionals.*,
            vendors.name AS vendor_name,
            vendors.kind AS vendor_kind
        FROM professionals
        INNER JOIN vendors ON vendors.id = professionals.vendor_id
        WHERE professionals.id = ?
        """,
        (professional_id,),
    )
    return professional or {}


def _fetch_contract(contract_id: int) -> dict:
    contract = fetch_one(
        """
        SELECT
            contracts.*,
            vendors.name AS vendor_name,
            units.name AS unit_name
        FROM contracts
        INNER JOIN vendors ON vendors.id = contracts.vendor_id
        INNER JOIN units ON units.id = contracts.unit_id
        WHERE contracts.id = ?
        """,
        (contract_id,),
    )
    return contract or {}


def _fetch_invoice(invoice_id: int) -> dict:
    invoice = fetch_one(
        """
        SELECT
            invoices.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title
        FROM invoices
        INNER JOIN vendors ON vendors.id = invoices.vendor_id
        INNER JOIN units ON units.id = invoices.unit_id
        LEFT JOIN contracts ON contracts.id = invoices.contract_id
        WHERE invoices.id = ?
        """,
        (invoice_id,),
    )
    return invoice or {}


def _fetch_document(document_id: int) -> dict:
    document = fetch_one(
        f"""
        {DOCUMENT_SELECT}
        WHERE regulatory_documents.id = ?
        """,
        (document_id,),
    )
    return document or {}


def _fetch_user(user_id: int) -> dict:
    user = fetch_one(
        """
        SELECT id, name, email, role, active, created_at
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    )
    if not user:
        return {}
    user["active"] = bool(user["active"])
    return user


def _fetch_file(file_id: int) -> dict:
    file_record = fetch_one(
        """
        SELECT
            file_records.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title,
            invoices.invoice_number AS invoice_number,
            regulatory_documents.document_type AS regulatory_document_type,
            regulatory_documents.document_number AS regulatory_document_number,
            users.name AS uploaded_by_name
        FROM file_records
        LEFT JOIN vendors ON vendors.id = file_records.vendor_id
        LEFT JOIN units ON units.id = file_records.unit_id
        LEFT JOIN contracts ON contracts.id = file_records.contract_id
        LEFT JOIN invoices ON invoices.id = file_records.invoice_id
        LEFT JOIN regulatory_documents ON regulatory_documents.id = file_records.regulatory_document_id
        INNER JOIN users ON users.id = file_records.uploaded_by_user_id
        WHERE file_records.id = ?
        """,
        (file_id,),
    )
    return file_record or {}


def _fetch_document_files(document_id: int) -> list[dict]:
    return fetch_all(
        """
        SELECT
            file_records.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title,
            invoices.invoice_number AS invoice_number,
            regulatory_documents.document_type AS regulatory_document_type,
            regulatory_documents.document_number AS regulatory_document_number,
            users.name AS uploaded_by_name
        FROM file_records
        LEFT JOIN vendors ON vendors.id = file_records.vendor_id
        LEFT JOIN units ON units.id = file_records.unit_id
        LEFT JOIN contracts ON contracts.id = file_records.contract_id
        LEFT JOIN invoices ON invoices.id = file_records.invoice_id
        LEFT JOIN regulatory_documents ON regulatory_documents.id = file_records.regulatory_document_id
        INNER JOIN users ON users.id = file_records.uploaded_by_user_id
        WHERE file_records.regulatory_document_id = ?
        ORDER BY datetime(file_records.created_at) DESC, file_records.id DESC
        """,
        (document_id,),
    )


def _fetch_contract_files(contract_id: int) -> list[dict]:
    return fetch_all(
        """
        SELECT
            file_records.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title,
            invoices.invoice_number AS invoice_number,
            regulatory_documents.document_type AS regulatory_document_type,
            regulatory_documents.document_number AS regulatory_document_number,
            users.name AS uploaded_by_name
        FROM file_records
        LEFT JOIN vendors ON vendors.id = file_records.vendor_id
        LEFT JOIN units ON units.id = file_records.unit_id
        LEFT JOIN contracts ON contracts.id = file_records.contract_id
        LEFT JOIN invoices ON invoices.id = file_records.invoice_id
        LEFT JOIN regulatory_documents ON regulatory_documents.id = file_records.regulatory_document_id
        INNER JOIN users ON users.id = file_records.uploaded_by_user_id
        WHERE file_records.contract_id = ?
        ORDER BY datetime(file_records.created_at) DESC, file_records.id DESC
        """,
        (contract_id,),
    )


def _coerce_optional_int(value: str | None) -> int | None:
    if value in (None, "", "null"):
        return None
    return int(value)


def _validate_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Extensao nao permitida. Use: {allowed}.")
    return extension


def _tail_log_file(lines: int) -> list[str]:
    log_path = LOG_DIR / "repofiscal.log"
    if not log_path.exists():
        return []

    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        return [line.rstrip("\n") for line in deque(handle, maxlen=lines)]


def _audit_user(current_user: dict | None) -> tuple[int | None, str | None, int | None]:
    if not current_user:
        return None, None, None
    return current_user.get("id"), current_user.get("name"), current_user.get("session_id")


def _require_delete_authorization(
    current_user: dict,
    elevation: DeleteElevationPayload | None,
    *,
    entity_type: str,
    entity_id: int,
) -> dict | None:
    if current_user["role"] in {"adm", "superadm"}:
        return None

    if not elevation or not elevation.password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operador precisa de elevacao de um admin ou superadmin para excluir.",
        )

    email = (elevation.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o e-mail do admin ou superadmin.")

    approver = fetch_one(
        """
        SELECT id, name, email, role, active, password_salt, password_hash
        FROM users
        WHERE email = ? AND role IN ('adm', 'superadm') AND active = 1
        """,
        (email,),
    )
    if not approver or not verify_password(elevation.password, approver["password_salt"], approver["password_hash"]):
        actor_id, actor_name, session_id = _audit_user(current_user)
        record_audit_event(
            action="delete_elevation_failed",
            entity_type=entity_type,
            entity_id=entity_id,
            description=f"Elevacao de exclusao negada para {current_user.get('name')}",
            user_id=actor_id,
            user_name=actor_name,
            session_id=session_id,
            metadata={"approver_email": email},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Credencial de elevacao invalida.")

    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete_elevation_approved",
        entity_type=entity_type,
        entity_id=entity_id,
        description=f"Exclusao elevada por {approver['name']} para operador {current_user.get('name')}",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"approver_id": approver["id"], "approver_name": approver["name"], "approver_role": approver["role"]},
    )
    return {"id": approver["id"], "name": approver["name"], "email": approver["email"], "role": approver["role"]}


def _record_document_attachment_event(
    *,
    action: str,
    description: str,
    file_record: dict,
    current_user: dict,
) -> None:
    document_id = file_record.get("regulatory_document_id")
    if not document_id:
        return

    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action=action,
        entity_type="regulatory_document",
        entity_id=document_id,
        description=description,
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={
            "document_type": file_record.get("regulatory_document_type"),
            "document_number": file_record.get("regulatory_document_number"),
            "file_id": file_record.get("id"),
            "file_name": file_record.get("original_name"),
            "file_extension": file_record.get("extension"),
            "category": file_record.get("category"),
        },
    )


def _record_contract_attachment_event(
    *,
    action: str,
    description: str,
    file_record: dict,
    current_user: dict,
) -> None:
    contract_id = file_record.get("contract_id")
    if not contract_id:
        return

    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action=action,
        entity_type="contract",
        entity_id=contract_id,
        description=description,
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={
            "contract_title": file_record.get("contract_title"),
            "invoice_number": file_record.get("invoice_number"),
            "file_id": file_record.get("id"),
            "file_name": file_record.get("original_name"),
            "file_extension": file_record.get("extension"),
            "category": file_record.get("category"),
        },
    )


@router.get("/dashboard")
def get_dashboard() -> dict:
    counts = fetch_one(
        """
        SELECT
            (SELECT COUNT(*) FROM vendors) AS vendors,
            (SELECT COUNT(*) FROM professionals) AS professionals,
            (SELECT COUNT(*) FROM users WHERE active = 1) AS active_users,
            (SELECT COUNT(*) FROM file_records) AS files,
            (SELECT COUNT(*) FROM units) AS units,
            (SELECT COUNT(*) FROM contracts WHERE status IN ('active', 'signed', 'expiring')) AS active_contracts,
            (SELECT COUNT(*) FROM invoices WHERE status IN ('pending', 'review')) AS pending_invoices,
            (
                SELECT COUNT(*)
                FROM regulatory_documents
                WHERE document_type = 'AVCB'
                  AND expiry_date IS NOT NULL
                  AND date(expiry_date) <= date('now', '+60 day')
            ) AS avcb_attention,
            (
                SELECT COUNT(*)
                FROM regulatory_documents
                WHERE document_type = 'CLCB'
                  AND expiry_date IS NOT NULL
                  AND date(expiry_date) <= date('now', '+60 day')
            ) AS clcb_attention,
            (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE status = 'paid') AS invoices_paid_total
        """
    ) or {}

    upcoming_contracts = fetch_all(
        """
        SELECT
            contracts.id,
            contracts.title,
            contracts.compliance_type,
            contracts.end_date,
            contracts.status,
            contracts.value,
            vendors.name AS vendor_name,
            units.name AS unit_name
        FROM contracts
        INNER JOIN vendors ON vendors.id = contracts.vendor_id
        INNER JOIN units ON units.id = contracts.unit_id
        WHERE contracts.end_date IS NOT NULL
        ORDER BY date(contracts.end_date) ASC
        LIMIT 6
        """
    )

    pending_invoices = fetch_all(
        """
        SELECT
            invoices.id,
            invoices.invoice_number,
            invoices.due_date,
            invoices.status,
            invoices.total_amount,
            vendors.name AS vendor_name,
            units.name AS unit_name
        FROM invoices
        INNER JOIN vendors ON vendors.id = invoices.vendor_id
        INNER JOIN units ON units.id = invoices.unit_id
        WHERE invoices.status IN ('pending', 'review')
        ORDER BY date(COALESCE(invoices.due_date, invoices.issue_date)) ASC
        LIMIT 6
        """
    )

    regulatory_alerts = fetch_all(
        f"""
        {DOCUMENT_SELECT}
        WHERE regulatory_documents.expiry_date IS NOT NULL
        ORDER BY date(regulatory_documents.expiry_date) ASC
        LIMIT 8
        """
    )

    recent_files = fetch_all(
        """
        SELECT
            file_records.id,
            file_records.original_name,
            file_records.extension,
            file_records.category,
            file_records.created_at,
            file_records.size_bytes,
            users.name AS uploaded_by_name
        FROM file_records
        INNER JOIN users ON users.id = file_records.uploaded_by_user_id
        ORDER BY datetime(file_records.created_at) DESC
        LIMIT 6
        """
    )

    return {
        "counts": counts,
        "upcoming_contracts": upcoming_contracts,
        "pending_invoices": pending_invoices,
        "regulatory_alerts": regulatory_alerts,
        "recent_files": recent_files,
    }


@router.get("/system/status", dependencies=[Depends(require_admin)])
def get_system_status() -> dict[str, object]:
    return {
        "backup": get_backup_status(),
        "logs": {
            "log_path": str(LOG_DIR / "repofiscal.log"),
            "exists": (LOG_DIR / "repofiscal.log").exists(),
        },
    }


@router.get("/system/logs", dependencies=[Depends(require_admin)])
def get_recent_logs(lines: int = Query(default=120, ge=20, le=500)) -> dict[str, object]:
    return {
        "lines": _tail_log_file(lines),
        "requested_lines": lines,
        "log_path": str(LOG_DIR / "repofiscal.log"),
    }


@router.get("/system/audit-logs", dependencies=[Depends(require_admin)])
def get_recent_audit_logs(limit: int = Query(default=120, ge=20, le=500)) -> dict[str, object]:
    return {
        "entries": list_audit_logs(limit),
        "requested_limit": limit,
    }


@router.post("/system/backups/run", dependencies=[Depends(require_admin)])
def run_manual_backup(current_user: dict = Depends(get_current_user)) -> dict[str, object]:
    run_backup_if_due(force=True)
    user_id, user_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="run_backup",
        entity_type="backup",
        description=f"Backup manual executado por {user_name}",
        user_id=user_id,
        user_name=user_name,
        session_id=session_id,
        metadata={"archive_path": get_backup_status().get("archive_path")},
    )
    return {
        "message": "Backup manual executado com sucesso.",
        "backup": get_backup_status(),
    }


@router.get("/users", dependencies=[Depends(require_admin)])
def list_users() -> list[dict]:
    users = fetch_all(
        """
        SELECT id, name, email, role, active, created_at
        FROM users
        ORDER BY
            CASE role
                WHEN 'superadm' THEN 0
                WHEN 'adm' THEN 1
                ELSE 2
            END,
            name COLLATE NOCASE ASC
        """
    )
    for user in users:
        user["active"] = bool(user["active"])
    return users


@router.post("/users", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_superadmin)])
def create_user(payload: UserPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not payload.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha obrigatoria para novo usuario.")

    now = utc_now_iso()
    salt, password_hash = hash_password(payload.password)
    try:
        user_id = execute(
            """
            INSERT INTO users (name, email, password_salt, password_hash, role, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name.strip(),
                payload.email.strip().lower(),
                salt,
                password_hash,
                payload.role,
                int(payload.active),
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    created_user = _fetch_user(user_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="user",
        entity_id=user_id,
        description=f"Usuario {created_user['name']} criado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"email": created_user["email"], "role": created_user["role"]},
    )
    return created_user


@router.put("/users/{user_id}", dependencies=[Depends(require_superadmin)])
def update_user(user_id: int, payload: UserPayload, current_user: dict = Depends(get_current_user)) -> dict:
    existing = fetch_one("SELECT id, role FROM users WHERE id = ?", (user_id,))
    if not existing:
        raise _not_found("Usuario")

    if existing["role"] == "superadm" and not payload.active and current_user["id"] == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e possivel desativar o proprio superadm.")

    password_salt = None
    password_hash = None
    if payload.password:
        password_salt, password_hash = hash_password(payload.password)

    try:
        if payload.password:
            execute(
                """
                UPDATE users
                SET name = ?, email = ?, role = ?, active = ?, password_salt = ?, password_hash = ?
                WHERE id = ?
                """,
                (
                    payload.name.strip(),
                    payload.email.strip().lower(),
                    payload.role,
                    int(payload.active),
                    password_salt,
                    password_hash,
                    user_id,
                ),
            )
        else:
            execute(
                """
                UPDATE users
                SET name = ?, email = ?, role = ?, active = ?
                WHERE id = ?
                """,
                (
                    payload.name.strip(),
                    payload.email.strip().lower(),
                    payload.role,
                    int(payload.active),
                    user_id,
                ),
            )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    updated_user = _fetch_user(user_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="user",
        entity_id=user_id,
        description=f"Usuario {updated_user['name']} atualizado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"email": updated_user["email"], "role": updated_user["role"], "active": updated_user["active"]},
    )
    return updated_user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_superadmin)])
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)) -> Response:
    target = fetch_one("SELECT id, role FROM users WHERE id = ?", (user_id,))
    if not target:
        raise _not_found("Usuario")
    target_user = _fetch_user(user_id)
    if current_user["id"] == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e possivel excluir o proprio usuario.")

    remaining_superadmins = fetch_one(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'superadm' AND active = 1",
    ) or {"total": 0}
    if target["role"] == "superadm" and remaining_superadmins["total"] <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E necessario manter ao menos um superadm ativo.")

    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="user",
        entity_id=user_id,
        description=f"Usuario {target_user.get('name', user_id)} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"email": target_user.get("email"), "role": target_user.get("role")},
    )
    execute("DELETE FROM users WHERE id = ?", (user_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/vendors")
def list_vendors(
    q: str = Query(default=""),
    kind: str | None = Query(default=None),
) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT
            vendors.*,
            (
                SELECT COUNT(*)
                FROM professionals
                WHERE professionals.vendor_id = vendors.id
            ) AS professionals_count
        FROM vendors
        WHERE (? = '' OR vendors.name LIKE ? OR COALESCE(vendors.document, '') LIKE ?)
          AND (? IS NULL OR vendors.kind = ?)
        ORDER BY vendors.name COLLATE NOCASE ASC
        """,
        (q.strip(), search, search, kind, kind),
    )


@router.post("/vendors", status_code=status.HTTP_201_CREATED)
def create_vendor(payload: VendorPayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        vendor_id = execute(
            """
            INSERT INTO vendors (kind, name, document, contact_name, email, phone, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.kind,
                payload.name.strip(),
                payload.document,
                payload.contact_name,
                payload.email,
                payload.phone,
                payload.status,
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    vendor = _fetch_vendor(vendor_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="vendor",
        entity_id=vendor_id,
        description=f"Fornecedor {vendor['name']} criado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"kind": vendor["kind"], "status": vendor["status"]},
    )
    return vendor


@router.put("/vendors/{vendor_id}")
def update_vendor(vendor_id: int, payload: VendorPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM vendors WHERE id = ?", (vendor_id,)):
        raise _not_found("Fornecedor")

    try:
        execute(
            """
            UPDATE vendors
            SET kind = ?, name = ?, document = ?, contact_name = ?, email = ?, phone = ?, status = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.kind,
                payload.name.strip(),
                payload.document,
                payload.contact_name,
                payload.email,
                payload.phone,
                payload.status,
                payload.notes,
                utc_now_iso(),
                vendor_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    vendor = _fetch_vendor(vendor_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="vendor",
        entity_id=vendor_id,
        description=f"Fornecedor {vendor['name']} atualizado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"kind": vendor["kind"], "status": vendor["status"]},
    )
    return vendor


@router.delete("/vendors/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(vendor_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    vendor = _fetch_vendor(vendor_id)
    if not vendor:
        raise _not_found("Fornecedor")
    approver = _require_delete_authorization(current_user, elevation, entity_type="vendor", entity_id=vendor_id)
    try:
        execute("DELETE FROM vendors WHERE id = ?", (vendor_id,))
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="vendor",
        entity_id=vendor_id,
        description=f"Fornecedor {vendor['name']} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"kind": vendor["kind"], "status": vendor["status"], "delete_approved_by": approver},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/professionals")
def list_professionals(
    q: str = Query(default=""),
    vendor_id: int | None = Query(default=None),
) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT
            professionals.*,
            vendors.name AS vendor_name,
            vendors.kind AS vendor_kind
        FROM professionals
        INNER JOIN vendors ON vendors.id = professionals.vendor_id
        WHERE (? = '' OR professionals.name LIKE ? OR COALESCE(professionals.document, '') LIKE ? OR COALESCE(professionals.license_number, '') LIKE ?)
          AND (? IS NULL OR professionals.vendor_id = ?)
        ORDER BY professionals.name COLLATE NOCASE ASC
        """,
        (q.strip(), search, search, search, vendor_id, vendor_id),
    )


@router.post("/professionals", status_code=status.HTTP_201_CREATED)
def create_professional(payload: ProfessionalPayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        professional_id = execute(
            """
            INSERT INTO professionals (
                vendor_id, name, role, document, license_number, email, phone, active, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.vendor_id,
                payload.name.strip(),
                payload.role,
                payload.document,
                payload.license_number,
                payload.email,
                payload.phone,
                int(payload.active),
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    professional = _fetch_professional(professional_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="professional",
        entity_id=professional_id,
        description=f"Profissional {professional['name']} criado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": professional.get("vendor_name"), "active": bool(professional.get("active"))},
    )
    return professional


@router.put("/professionals/{professional_id}")
def update_professional(professional_id: int, payload: ProfessionalPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM professionals WHERE id = ?", (professional_id,)):
        raise _not_found("Profissional")
    try:
        execute(
            """
            UPDATE professionals
            SET vendor_id = ?, name = ?, role = ?, document = ?, license_number = ?, email = ?, phone = ?, active = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.vendor_id,
                payload.name.strip(),
                payload.role,
                payload.document,
                payload.license_number,
                payload.email,
                payload.phone,
                int(payload.active),
                payload.notes,
                utc_now_iso(),
                professional_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    professional = _fetch_professional(professional_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="professional",
        entity_id=professional_id,
        description=f"Profissional {professional['name']} atualizado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": professional.get("vendor_name"), "active": bool(professional.get("active"))},
    )
    return professional


@router.delete("/professionals/{professional_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_professional(professional_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    professional = _fetch_professional(professional_id)
    if not professional:
        raise _not_found("Profissional")
    approver = _require_delete_authorization(current_user, elevation, entity_type="professional", entity_id=professional_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="professional",
        entity_id=professional_id,
        description=f"Profissional {professional['name']} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": professional.get("vendor_name"), "delete_approved_by": approver},
    )
    execute("DELETE FROM professionals WHERE id = ?", (professional_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/units")
def list_units(q: str = Query(default="")) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT *
        FROM units
        WHERE deleted_at IS NULL
          AND (? = '' OR name LIKE ? OR code LIKE ? OR COALESCE(city, '') LIKE ?)
        ORDER BY name COLLATE NOCASE ASC
        """,
        (q.strip(), search, search, search),
    )


@router.post("/units", status_code=status.HTTP_201_CREATED)
def create_unit(payload: UnitPayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        unit_id = execute(
            """
            INSERT INTO units (
                name, code, tax_id, state_registration, city, state, address, manager_name,
                manager_email, manager_phone, active, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name.strip(),
                payload.code.strip().upper(),
                payload.tax_id,
                payload.state_registration,
                payload.city,
                payload.state,
                payload.address,
                payload.manager_name,
                payload.manager_email,
                payload.manager_phone,
                int(payload.active),
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    unit = fetch_one("SELECT * FROM units WHERE id = ? AND deleted_at IS NULL", (unit_id,)) or {}
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="unit",
        entity_id=unit_id,
        description=f"Unidade {unit.get('name', unit_id)} criada",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"code": unit.get("code"), "city": unit.get("city"), "state": unit.get("state")},
    )
    return unit


@router.put("/units/{unit_id}")
def update_unit(unit_id: int, payload: UnitPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM units WHERE id = ? AND deleted_at IS NULL", (unit_id,)):
        raise _not_found("Unidade")
    try:
        execute(
            """
            UPDATE units
            SET name = ?, code = ?, tax_id = ?, state_registration = ?, city = ?, state = ?, address = ?,
                manager_name = ?, manager_email = ?, manager_phone = ?, active = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.name.strip(),
                payload.code.strip().upper(),
                payload.tax_id,
                payload.state_registration,
                payload.city,
                payload.state,
                payload.address,
                payload.manager_name,
                payload.manager_email,
                payload.manager_phone,
                int(payload.active),
                payload.notes,
                utc_now_iso(),
                unit_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    unit = fetch_one("SELECT * FROM units WHERE id = ? AND deleted_at IS NULL", (unit_id,)) or {}
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="unit",
        entity_id=unit_id,
        description=f"Unidade {unit.get('name', unit_id)} atualizada",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"code": unit.get("code"), "city": unit.get("city"), "state": unit.get("state")},
    )
    return unit


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unit(unit_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    unit = fetch_one("SELECT * FROM units WHERE id = ? AND deleted_at IS NULL", (unit_id,)) or {}
    if not unit:
        raise _not_found("Unidade")
    approver = _require_delete_authorization(current_user, elevation, entity_type="unit", entity_id=unit_id)
    deleted_at = utc_now_iso()
    execute(
        """
        UPDATE units
        SET active = 0, deleted_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (deleted_at, deleted_at, unit_id),
    )
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="unit",
        entity_id=unit_id,
        description=f"Unidade {unit.get('name', unit_id)} excluida",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"code": unit.get("code"), "city": unit.get("city"), "state": unit.get("state"), "delete_approved_by": approver},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/contracts")
def list_contracts(q: str = Query(default="")) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT
            contracts.*,
            vendors.name AS vendor_name,
            units.name AS unit_name
        FROM contracts
        INNER JOIN vendors ON vendors.id = contracts.vendor_id
        INNER JOIN units ON units.id = contracts.unit_id
        WHERE (? = '' OR contracts.title LIKE ? OR COALESCE(contracts.contract_number, '') LIKE ? OR vendors.name LIKE ?)
        ORDER BY date(COALESCE(contracts.end_date, contracts.start_date, contracts.created_at)) ASC
        """,
        (q.strip(), search, search, search),
    )


@router.get("/contracts/{contract_id}/history")
def get_contract_history(contract_id: int) -> dict[str, object]:
    contract = _fetch_contract(contract_id)
    if not contract:
        raise _not_found("Orcamento")

    invoices = fetch_all(
        """
        SELECT
            invoices.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title
        FROM invoices
        INNER JOIN vendors ON vendors.id = invoices.vendor_id
        INNER JOIN units ON units.id = invoices.unit_id
        LEFT JOIN contracts ON contracts.id = invoices.contract_id
        WHERE invoices.contract_id = ?
        ORDER BY date(COALESCE(invoices.due_date, invoices.issue_date, invoices.created_at)) ASC
        """,
        (contract_id,),
    )

    return {
        "contract": contract,
        "files": _fetch_contract_files(contract_id),
        "invoices": invoices,
        "history": list_entity_audit_logs("contract", contract_id),
    }


@router.post("/contracts", status_code=status.HTTP_201_CREATED)
def create_contract(payload: ContractPayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        contract_id = execute(
            """
            INSERT INTO contracts (
                vendor_id, unit_id, title, contract_number, category, compliance_type, certificate_number,
                start_date, end_date, value, status, renewal_alert_days, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.vendor_id,
                payload.unit_id,
                payload.title.strip(),
                payload.contract_number,
                payload.category,
                payload.compliance_type,
                payload.certificate_number,
                payload.start_date,
                payload.end_date,
                payload.value,
                payload.status,
                payload.renewal_alert_days,
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    contract = _fetch_contract(contract_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="contract",
        entity_id=contract_id,
        description=f"Orcamento {contract.get('title', contract_id)} criado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": contract.get("vendor_name"), "unit_name": contract.get("unit_name"), "status": contract.get("status")},
    )
    return contract


@router.put("/contracts/{contract_id}")
def update_contract(contract_id: int, payload: ContractPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM contracts WHERE id = ?", (contract_id,)):
        raise _not_found("Orcamento")
    try:
        execute(
            """
            UPDATE contracts
            SET vendor_id = ?, unit_id = ?, title = ?, contract_number = ?, category = ?, compliance_type = ?,
                certificate_number = ?, start_date = ?, end_date = ?, value = ?, status = ?, renewal_alert_days = ?,
                notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.vendor_id,
                payload.unit_id,
                payload.title.strip(),
                payload.contract_number,
                payload.category,
                payload.compliance_type,
                payload.certificate_number,
                payload.start_date,
                payload.end_date,
                payload.value,
                payload.status,
                payload.renewal_alert_days,
                payload.notes,
                utc_now_iso(),
                contract_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    contract = _fetch_contract(contract_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="contract",
        entity_id=contract_id,
        description=f"Orcamento {contract.get('title', contract_id)} atualizado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": contract.get("vendor_name"), "unit_name": contract.get("unit_name"), "status": contract.get("status")},
    )
    return contract


@router.delete("/contracts/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    contract = _fetch_contract(contract_id)
    if not contract:
        raise _not_found("Orcamento")
    approver = _require_delete_authorization(current_user, elevation, entity_type="contract", entity_id=contract_id)
    try:
        execute("DELETE FROM contracts WHERE id = ?", (contract_id,))
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="contract",
        entity_id=contract_id,
        description=f"Orcamento {contract.get('title', contract_id)} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": contract.get("vendor_name"), "unit_name": contract.get("unit_name"), "status": contract.get("status"), "delete_approved_by": approver},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invoices")
def list_invoices(q: str = Query(default="")) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT
            invoices.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title
        FROM invoices
        INNER JOIN vendors ON vendors.id = invoices.vendor_id
        INNER JOIN units ON units.id = invoices.unit_id
        LEFT JOIN contracts ON contracts.id = invoices.contract_id
        WHERE (? = '' OR invoices.invoice_number LIKE ? OR vendors.name LIKE ? OR COALESCE(invoices.access_key, '') LIKE ?)
        ORDER BY date(COALESCE(invoices.due_date, invoices.issue_date, invoices.created_at)) ASC
        """,
        (q.strip(), search, search, search),
    )


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoicePayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        invoice_id = execute(
            """
            INSERT INTO invoices (
                vendor_id, unit_id, contract_id, invoice_number, series, issue_date, due_date,
                total_amount, tax_amount, status, access_key, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.vendor_id,
                payload.unit_id,
                payload.contract_id,
                payload.invoice_number.strip(),
                payload.series,
                payload.issue_date,
                payload.due_date,
                payload.total_amount,
                payload.tax_amount,
                payload.status,
                payload.access_key,
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    invoice = _fetch_invoice(invoice_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="invoice",
        entity_id=invoice_id,
        description=f"Nota fiscal {invoice.get('invoice_number', invoice_id)} criada",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": invoice.get("vendor_name"), "unit_name": invoice.get("unit_name"), "status": invoice.get("status")},
    )
    return invoice


@router.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, payload: InvoicePayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM invoices WHERE id = ?", (invoice_id,)):
        raise _not_found("Nota fiscal")
    try:
        execute(
            """
            UPDATE invoices
            SET vendor_id = ?, unit_id = ?, contract_id = ?, invoice_number = ?, series = ?, issue_date = ?,
                due_date = ?, total_amount = ?, tax_amount = ?, status = ?, access_key = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.vendor_id,
                payload.unit_id,
                payload.contract_id,
                payload.invoice_number.strip(),
                payload.series,
                payload.issue_date,
                payload.due_date,
                payload.total_amount,
                payload.tax_amount,
                payload.status,
                payload.access_key,
                payload.notes,
                utc_now_iso(),
                invoice_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    invoice = _fetch_invoice(invoice_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="invoice",
        entity_id=invoice_id,
        description=f"Nota fiscal {invoice.get('invoice_number', invoice_id)} atualizada",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": invoice.get("vendor_name"), "unit_name": invoice.get("unit_name"), "status": invoice.get("status")},
    )
    return invoice


@router.delete("/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    invoice = _fetch_invoice(invoice_id)
    if not invoice:
        raise _not_found("Nota fiscal")
    approver = _require_delete_authorization(current_user, elevation, entity_type="invoice", entity_id=invoice_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="invoice",
        entity_id=invoice_id,
        description=f"Nota fiscal {invoice.get('invoice_number', invoice_id)} excluida",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"vendor_name": invoice.get("vendor_name"), "unit_name": invoice.get("unit_name"), "status": invoice.get("status"), "delete_approved_by": approver},
    )
    execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/regulatory-documents")
def list_regulatory_documents(
    q: str = Query(default=""),
    document_type: str | None = Query(default=None),
) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        f"""
        {DOCUMENT_SELECT}
        WHERE (? = '' OR COALESCE(regulatory_documents.request_number, '') LIKE ? OR COALESCE(regulatory_documents.document_number, '') LIKE ? OR units.name LIKE ? OR COALESCE(vendors.name, '') LIKE ?)
          AND (? IS NULL OR regulatory_documents.document_type = ?)
        ORDER BY date(COALESCE(regulatory_documents.expiry_date, regulatory_documents.issue_date, regulatory_documents.created_at)) ASC
        """,
        (q.strip(), search, search, search, search, document_type, document_type),
    )


@router.get("/regulatory-documents/{document_id}/history")
def get_regulatory_document_history(document_id: int) -> dict[str, object]:
    document = _fetch_document(document_id)
    if not document:
        raise _not_found("Documento regulatorio")

    return {
        "document": document,
        "files": _fetch_document_files(document_id),
        "history": list_entity_audit_logs("regulatory_document", document_id),
    }


@router.post("/regulatory-documents", status_code=status.HTTP_201_CREATED)
def create_regulatory_document(payload: RegulatoryDocumentPayload, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now_iso()
    try:
        document_id = execute(
            """
            INSERT INTO regulatory_documents (
                document_type, unit_id, vendor_id, professional_id, contract_id, request_number,
                document_number, issue_date, expiry_date, status, last_inspection_date, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.document_type,
                payload.unit_id,
                payload.vendor_id,
                payload.professional_id,
                payload.contract_id,
                payload.request_number,
                payload.document_number,
                payload.issue_date,
                payload.expiry_date,
                payload.status,
                payload.last_inspection_date,
                payload.notes,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    document = _fetch_document(document_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="create",
        entity_type="regulatory_document",
        entity_id=document_id,
        description=f"Documento {document.get('document_type', 'regulatorio')} criado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"document_type": document.get("document_type"), "unit_name": document.get("unit_name"), "status": document.get("status")},
    )
    return document


@router.put("/regulatory-documents/{document_id}")
def update_regulatory_document(document_id: int, payload: RegulatoryDocumentPayload, current_user: dict = Depends(get_current_user)) -> dict:
    if not fetch_one("SELECT id FROM regulatory_documents WHERE id = ?", (document_id,)):
        raise _not_found("Documento regulatorio")
    try:
        execute(
            """
            UPDATE regulatory_documents
            SET document_type = ?, unit_id = ?, vendor_id = ?, professional_id = ?, contract_id = ?, request_number = ?,
                document_number = ?, issue_date = ?, expiry_date = ?, status = ?, last_inspection_date = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.document_type,
                payload.unit_id,
                payload.vendor_id,
                payload.professional_id,
                payload.contract_id,
                payload.request_number,
                payload.document_number,
                payload.issue_date,
                payload.expiry_date,
                payload.status,
                payload.last_inspection_date,
                payload.notes,
                utc_now_iso(),
                document_id,
            ),
        )
    except sqlite3.IntegrityError as error:
        raise _handle_integrity_error(error) from error
    document = _fetch_document(document_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="update",
        entity_type="regulatory_document",
        entity_id=document_id,
        description=f"Documento {document.get('document_type', 'regulatorio')} atualizado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"document_type": document.get("document_type"), "unit_name": document.get("unit_name"), "status": document.get("status")},
    )
    return document


@router.delete("/regulatory-documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_regulatory_document(document_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    document = _fetch_document(document_id)
    if not document:
        raise _not_found("Documento regulatorio")
    approver = _require_delete_authorization(current_user, elevation, entity_type="regulatory_document", entity_id=document_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="regulatory_document",
        entity_id=document_id,
        description=f"Documento {document.get('document_type', 'regulatorio')} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"document_type": document.get("document_type"), "unit_name": document.get("unit_name"), "status": document.get("status"), "delete_approved_by": approver},
    )
    execute("DELETE FROM regulatory_documents WHERE id = ?", (document_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/files")
def list_files(q: str = Query(default="")) -> list[dict]:
    search = f"%{q.strip()}%"
    return fetch_all(
        """
        SELECT
            file_records.*,
            vendors.name AS vendor_name,
            units.name AS unit_name,
            contracts.title AS contract_title,
            invoices.invoice_number AS invoice_number,
            regulatory_documents.document_type AS regulatory_document_type,
            regulatory_documents.document_number AS regulatory_document_number,
            users.name AS uploaded_by_name
        FROM file_records
        LEFT JOIN vendors ON vendors.id = file_records.vendor_id
        LEFT JOIN units ON units.id = file_records.unit_id
        LEFT JOIN contracts ON contracts.id = file_records.contract_id
        LEFT JOIN invoices ON invoices.id = file_records.invoice_id
        LEFT JOIN regulatory_documents ON regulatory_documents.id = file_records.regulatory_document_id
        INNER JOIN users ON users.id = file_records.uploaded_by_user_id
        WHERE (? = ''
            OR file_records.original_name LIKE ?
            OR COALESCE(file_records.category, '') LIKE ?
            OR COALESCE(vendors.name, '') LIKE ?
            OR COALESCE(units.name, '') LIKE ?)
        ORDER BY datetime(file_records.created_at) DESC
        """,
        (q.strip(), search, search, search, search),
    )


@router.post("/files/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    upload: UploadFile = File(...),
    category: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    vendor_id: str | None = Form(default=None),
    unit_id: str | None = Form(default=None),
    contract_id: str | None = Form(default=None),
    invoice_id: str | None = Form(default=None),
    regulatory_document_id: str | None = Form(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo obrigatorio.")

    extension = _validate_extension(upload.filename)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")

    destination.write_bytes(content)

    try:
        file_id = execute(
            """
            INSERT INTO file_records (
                original_name, stored_name, extension, content_type, size_bytes, category, notes,
                vendor_id, unit_id, contract_id, invoice_id, regulatory_document_id, uploaded_by_user_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                upload.filename,
                stored_name,
                extension,
                upload.content_type,
                len(content),
                category,
                notes,
                _coerce_optional_int(vendor_id),
                _coerce_optional_int(unit_id),
                _coerce_optional_int(contract_id),
                _coerce_optional_int(invoice_id),
                _coerce_optional_int(regulatory_document_id),
                current_user["id"],
                utc_now_iso(),
            ),
        )
    except sqlite3.IntegrityError as error:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise _handle_integrity_error(error) from error

    file_record = _fetch_file(file_id)
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="upload",
        entity_type="file",
        entity_id=file_id,
        description=f"Arquivo {file_record.get('original_name', upload.filename)} enviado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={
            "extension": file_record.get("extension"),
            "category": file_record.get("category"),
            "size_bytes": file_record.get("size_bytes"),
        },
    )
    _record_document_attachment_event(
        action="upload_attachment",
        description=f"Anexo {file_record.get('original_name', upload.filename)} enviado para a solicitacao",
        file_record=file_record,
        current_user=current_user,
    )
    _record_contract_attachment_event(
        action="upload_attachment",
        description=f"Anexo {file_record.get('original_name', upload.filename)} enviado para o orcamento",
        file_record=file_record,
        current_user=current_user,
    )
    return file_record


@router.get("/files/{file_id}/download")
def download_file(file_id: int, current_user: dict = Depends(get_current_user)) -> FileResponse:
    file_record = _fetch_file(file_id)
    if not file_record:
        raise _not_found("Arquivo")

    file_path = UPLOAD_DIR / file_record["stored_name"]
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo fisico nao encontrado.")

    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="download",
        entity_type="file",
        entity_id=file_id,
        description=f"Arquivo {file_record.get('original_name', file_id)} baixado",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"extension": file_record.get("extension"), "category": file_record.get("category")},
    )
    _record_document_attachment_event(
        action="download_attachment",
        description=f"Anexo {file_record.get('original_name', file_id)} baixado",
        file_record=file_record,
        current_user=current_user,
    )
    _record_contract_attachment_event(
        action="download_attachment",
        description=f"Anexo {file_record.get('original_name', file_id)} baixado",
        file_record=file_record,
        current_user=current_user,
    )

    media_type = file_record["content_type"] or "application/octet-stream"
    return FileResponse(path=file_path, media_type=media_type, filename=file_record["original_name"])


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(file_id: int, elevation: DeleteElevationPayload | None = None, current_user: dict = Depends(get_current_user)) -> Response:
    file_record = _fetch_file(file_id)
    if not file_record:
        raise _not_found("Arquivo")
    approver = _require_delete_authorization(current_user, elevation, entity_type="file", entity_id=file_id)

    file_path = UPLOAD_DIR / file_record["stored_name"]
    actor_id, actor_name, session_id = _audit_user(current_user)
    record_audit_event(
        action="delete",
        entity_type="file",
        entity_id=file_id,
        description=f"Arquivo {file_record.get('original_name', file_id)} excluido",
        user_id=actor_id,
        user_name=actor_name,
        session_id=session_id,
        metadata={"extension": file_record.get("extension"), "category": file_record.get("category"), "delete_approved_by": approver},
    )
    _record_document_attachment_event(
        action="delete_attachment",
        description=f"Anexo {file_record.get('original_name', file_id)} removido da solicitacao",
        file_record=file_record,
        current_user=current_user,
    )
    _record_contract_attachment_event(
        action="delete_attachment",
        description=f"Anexo {file_record.get('original_name', file_id)} removido do orcamento",
        file_record=file_record,
        current_user=current_user,
    )
    execute("DELETE FROM file_records WHERE id = ?", (file_id,))
    if file_path.exists():
        os.remove(file_path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
