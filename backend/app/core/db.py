from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Iterable

from app.core.config import DATABASE_PATH
from app.core.security import hash_password, utc_now_iso


@contextmanager
def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def fetch_all(query: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(query, tuple(params)).fetchall()
    return [dict(row) for row in rows]


def fetch_one(query: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(query, tuple(params)).fetchone()
    return dict(row) if row else None


def execute(query: str, params: Iterable[Any] = ()) -> int:
    with get_connection() as connection:
        cursor = connection.execute(query, tuple(params))
        return int(cursor.lastrowid or 0)


def _ensure_columns(connection: sqlite3.Connection, table_name: str, columns: dict[str, str]) -> None:
    existing_columns = {
        row["name"] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    for column_name, definition in columns.items():
        if column_name not in existing_columns:
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS vendors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK(kind IN ('service', 'product')),
                name TEXT NOT NULL,
                document TEXT,
                contact_name TEXT,
                email TEXT,
                phone TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                tax_id TEXT,
                state_registration TEXT,
                city TEXT,
                state TEXT,
                address TEXT,
                manager_name TEXT,
                manager_email TEXT,
                manager_phone TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(code)
            );

            CREATE TABLE IF NOT EXISTS contracts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id INTEGER NOT NULL,
                unit_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                contract_number TEXT,
                category TEXT,
                compliance_type TEXT,
                certificate_number TEXT,
                start_date TEXT,
                end_date TEXT,
                value REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                renewal_alert_days INTEGER NOT NULL DEFAULT 30,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id INTEGER NOT NULL,
                unit_id INTEGER NOT NULL,
                contract_id INTEGER,
                invoice_number TEXT NOT NULL,
                series TEXT,
                issue_date TEXT,
                due_date TEXT,
                total_amount REAL NOT NULL DEFAULT 0,
                tax_amount REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                access_key TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
                FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS professionals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                document TEXT,
                license_number TEXT,
                email TEXT,
                phone TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS regulatory_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_type TEXT NOT NULL CHECK(document_type IN ('AVCB', 'CLCB')),
                unit_id INTEGER NOT NULL,
                vendor_id INTEGER,
                professional_id INTEGER,
                contract_id INTEGER,
                request_number TEXT,
                document_number TEXT,
                issue_date TEXT,
                expiry_date TEXT,
                status TEXT NOT NULL DEFAULT 'in_progress',
                last_inspection_date TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
                FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
                FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS file_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL UNIQUE,
                extension TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                category TEXT,
                notes TEXT,
                vendor_id INTEGER,
                unit_id INTEGER,
                contract_id INTEGER,
                invoice_id INTEGER,
                regulatory_document_id INTEGER,
                uploaded_by_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
                FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
                FOREIGN KEY (regulatory_document_id) REFERENCES regulatory_documents(id) ON DELETE SET NULL,
                FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                user_name TEXT,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                description TEXT NOT NULL,
                metadata_json TEXT,
                session_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
            CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
            CREATE INDEX IF NOT EXISTS idx_units_name ON units(name);
            CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
            CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
            CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
            CREATE INDEX IF NOT EXISTS idx_professionals_vendor ON professionals(vendor_id);
            CREATE INDEX IF NOT EXISTS idx_documents_type ON regulatory_documents(document_type);
            CREATE INDEX IF NOT EXISTS idx_documents_expiry ON regulatory_documents(expiry_date);
            CREATE INDEX IF NOT EXISTS idx_files_created_at ON file_records(created_at);
            CREATE INDEX IF NOT EXISTS idx_files_vendor ON file_records(vendor_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
            """
        )

        _ensure_columns(
            connection,
            "users",
            {
                "active": "INTEGER NOT NULL DEFAULT 1",
            },
        )

        _ensure_columns(
            connection,
            "contracts",
            {
                "compliance_type": "TEXT",
                "certificate_number": "TEXT",
            },
        )

        now = utc_now_iso()
        default_users = [
            ("Super Administrador", "superadm@repofiscal.local", "super123", "superadm"),
            ("Administrador Fiscal", "adm@repofiscal.local", "adm123", "adm"),
            ("Operador Fiscal", "operador@repofiscal.local", "operador123", "operator"),
        ]

        for name, email, password, role in default_users:
            existing_user = connection.execute(
                "SELECT id FROM users WHERE email = ?",
                (email,),
            ).fetchone()

            if existing_user:
                connection.execute(
                    "UPDATE users SET role = ?, active = 1 WHERE email = ?",
                    (role, email),
                )
                continue

            salt, password_hash = hash_password(password)
            connection.execute(
                """
                INSERT INTO users (name, email, password_salt, password_hash, role, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (name, email, salt, password_hash, role, 1, now),
            )

        duplicate_legacy = connection.execute(
            """
            SELECT legacy.id
            FROM users AS legacy
            INNER JOIN users AS current_adm ON current_adm.email = 'adm@repofiscal.local'
            WHERE legacy.email = 'admin@repofiscal.local'
            """
        ).fetchone()
        if duplicate_legacy:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (duplicate_legacy["id"],))
            connection.execute("DELETE FROM users WHERE id = ?", (duplicate_legacy["id"],))
