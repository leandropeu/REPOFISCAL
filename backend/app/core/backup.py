from __future__ import annotations

import json
import logging
import os
import shutil
import sqlite3
import threading
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import (
    BACKUP_ARCHIVE_PATH,
    BACKUP_INTERVAL_SECONDS,
    BACKUP_RETENTION_DAYS,
    BACKUP_STATE_PATH,
    BKP_DIR,
    DATABASE_PATH,
    LOG_DIR,
    UPLOAD_DIR,
)


logger = logging.getLogger("repofiscal.backup")
_scheduler_thread: threading.Thread | None = None
_scheduler_lock = threading.Lock()
_backup_lock = threading.Lock()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _snapshot_key(moment: datetime) -> str:
    rounded = moment.replace(minute=0, second=0, microsecond=0)
    return rounded.strftime("%Y%m%dT%H0000Z")


def _load_state() -> dict[str, str]:
    if not BACKUP_STATE_PATH.exists():
        return {}

    try:
        return json.loads(BACKUP_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("Nao foi possivel ler o estado de backup. Um novo estado sera criado.")
        return {}


def _save_state(snapshot_key: str) -> None:
    BACKUP_STATE_PATH.write_text(
        json.dumps({"last_backup_snapshot": snapshot_key}, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def _copy_database_snapshot(destination: Path) -> None:
    source_connection = sqlite3.connect(DATABASE_PATH)
    try:
        backup_connection = sqlite3.connect(destination)
        try:
            source_connection.backup(backup_connection)
        finally:
            backup_connection.close()
    finally:
        source_connection.close()


def _iter_snapshot_entries(source_root: Path) -> list[tuple[Path, str]]:
    entries: list[tuple[Path, str]] = []
    if not source_root.exists():
        return entries

    if source_root.is_file():
        entries.append((source_root, source_root.name))
        return entries

    for file_path in source_root.rglob("*"):
        if file_path.is_file():
            entries.append((file_path, file_path.relative_to(source_root).as_posix()))
    return entries


def _build_snapshot(temp_root: Path, snapshot_key: str) -> list[tuple[Path, str]]:
    snapshot_root = temp_root / snapshot_key
    snapshot_root.mkdir(parents=True, exist_ok=True)

    database_snapshot_path = snapshot_root / "database" / DATABASE_PATH.name
    database_snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    _copy_database_snapshot(database_snapshot_path)

    metadata = {
        "snapshot_key": snapshot_key,
        "created_at_utc": _utc_now().isoformat(),
        "contents": {
            "database": DATABASE_PATH.name,
            "uploads_count": len(_iter_snapshot_entries(UPLOAD_DIR)),
            "logs_count": len(_iter_snapshot_entries(LOG_DIR)),
        },
    }
    metadata_path = snapshot_root / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=True, indent=2), encoding="utf-8")

    entries: list[tuple[Path, str]] = []
    entries.extend(
        (path, f"snapshots/{snapshot_key}/database/{relative_path}")
        for path, relative_path in _iter_snapshot_entries(database_snapshot_path.parent)
    )
    entries.extend(
        (path, f"snapshots/{snapshot_key}/uploads/{relative_path}")
        for path, relative_path in _iter_snapshot_entries(UPLOAD_DIR)
    )
    entries.extend(
        (path, f"snapshots/{snapshot_key}/logs/{relative_path}")
        for path, relative_path in _iter_snapshot_entries(LOG_DIR)
    )
    entries.append((metadata_path, f"snapshots/{snapshot_key}/metadata.json"))
    return entries


def _snapshot_is_recent(entry_name: str, threshold_key: str) -> bool:
    parts = entry_name.split("/")
    if len(parts) < 2 or parts[0] != "snapshots":
        return False
    return parts[1] >= threshold_key


def _snapshot_key_to_iso(snapshot_key: str | None) -> str | None:
    if not snapshot_key:
        return None
    try:
        parsed = datetime.strptime(snapshot_key, "%Y%m%dT%H0000Z").replace(tzinfo=timezone.utc)
    except ValueError:
        return snapshot_key
    return parsed.isoformat()


def _rewrite_archive(snapshot_key: str, new_entries: list[tuple[Path, str]]) -> None:
    threshold_key = _snapshot_key(_utc_now() - timedelta(days=BACKUP_RETENTION_DAYS))
    temp_archive_path = BACKUP_ARCHIVE_PATH.with_suffix(".tmp")

    existing_entries: list[tuple[str, bytes]] = []
    if BACKUP_ARCHIVE_PATH.exists():
        with zipfile.ZipFile(BACKUP_ARCHIVE_PATH, "r") as current_archive:
            for info in current_archive.infolist():
                if info.is_dir():
                    continue
                if not _snapshot_is_recent(info.filename, threshold_key):
                    continue
                if info.filename.startswith(f"snapshots/{snapshot_key}/"):
                    continue
                existing_entries.append((info.filename, current_archive.read(info.filename)))

    with zipfile.ZipFile(temp_archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in existing_entries:
            archive.writestr(name, content)

        for path, archive_name in new_entries:
            archive.write(path, arcname=archive_name)

    os.replace(temp_archive_path, BACKUP_ARCHIVE_PATH)


def run_backup_if_due(force: bool = False) -> bool:
    with _backup_lock:
        BKP_DIR.mkdir(parents=True, exist_ok=True)
        LOG_DIR.mkdir(parents=True, exist_ok=True)

        snapshot_key = _snapshot_key(_utc_now())
        state = _load_state()
        last_snapshot = state.get("last_backup_snapshot")
        archive_exists = BACKUP_ARCHIVE_PATH.exists()

        if not force and archive_exists and last_snapshot == snapshot_key:
            return False

        staging_dir = BKP_DIR / "_staging_backup"
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        staging_dir.mkdir(parents=True, exist_ok=True)

        try:
            new_entries = _build_snapshot(staging_dir, snapshot_key)
            _rewrite_archive(snapshot_key, new_entries)
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)

        _save_state(snapshot_key)
        logger.info(
            "Backup horario concluido. Arquivo: %s | snapshot: %s",
            BACKUP_ARCHIVE_PATH,
            snapshot_key,
        )
        return True


def get_backup_status() -> dict[str, object]:
    BKP_DIR.mkdir(parents=True, exist_ok=True)

    snapshots: set[str] = set()
    if BACKUP_ARCHIVE_PATH.exists():
        with zipfile.ZipFile(BACKUP_ARCHIVE_PATH, "r") as archive:
            for entry in archive.infolist():
                if entry.is_dir():
                    continue
                parts = entry.filename.split("/")
                if len(parts) >= 2 and parts[0] == "snapshots":
                    snapshots.add(parts[1])

    ordered_snapshots = sorted(snapshots)
    state = _load_state()
    archive_size = BACKUP_ARCHIVE_PATH.stat().st_size if BACKUP_ARCHIVE_PATH.exists() else 0

    return {
        "archive_exists": BACKUP_ARCHIVE_PATH.exists(),
        "archive_path": str(BACKUP_ARCHIVE_PATH),
        "archive_size_bytes": archive_size,
        "last_backup_snapshot": state.get("last_backup_snapshot"),
        "last_backup_at": _snapshot_key_to_iso(state.get("last_backup_snapshot")),
        "snapshots_count": len(ordered_snapshots),
        "oldest_snapshot": ordered_snapshots[0] if ordered_snapshots else None,
        "newest_snapshot": ordered_snapshots[-1] if ordered_snapshots else None,
        "retention_days": BACKUP_RETENTION_DAYS,
        "check_interval_seconds": BACKUP_INTERVAL_SECONDS,
    }


def _backup_loop() -> None:
    logger.info("Agendador de backup iniciado. Verificacao a cada %s segundos.", BACKUP_INTERVAL_SECONDS)
    while True:
        try:
            run_backup_if_due()
        except Exception:
            logger.exception("Falha durante a rotina automatica de backup.")
        threading.Event().wait(BACKUP_INTERVAL_SECONDS)


def start_backup_scheduler() -> None:
    global _scheduler_thread

    with _scheduler_lock:
        if _scheduler_thread and _scheduler_thread.is_alive():
            return

        _scheduler_thread = threading.Thread(
            target=_backup_loop,
            name="repofiscal-backup-scheduler",
            daemon=True,
        )
        _scheduler_thread.start()
