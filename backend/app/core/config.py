from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent
DATABASE_PATH = BACKEND_DIR / "repofiscal.db"
UPLOAD_DIR = BACKEND_DIR / "uploads"
LOG_DIR = PROJECT_DIR / "LOGS"
BKP_DIR = PROJECT_DIR / "BKP"
BACKUP_ARCHIVE_PATH = BKP_DIR / "repofiscal-hourly-backups.zip"
BACKUP_STATE_PATH = BKP_DIR / "backup_state.json"
SESSION_DURATION_HOURS = 12
BACKUP_INTERVAL_SECONDS = 60
BACKUP_RETENTION_DAYS = 10
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".csv", ".xml", ".xlsx", ".xls"}
