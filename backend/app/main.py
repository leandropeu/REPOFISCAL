from __future__ import annotations

import logging
import time

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.backup import run_backup_if_due, start_backup_scheduler
from app.core.config import BACKUP_ARCHIVE_PATH, BKP_DIR, CORS_ORIGINS, LOG_DIR, UPLOAD_DIR
from app.core.db import init_db
from app.core.logging_setup import setup_logging
from app.routes.api import router as api_router
from app.routes.auth import router as auth_router

setup_logging()
logger = logging.getLogger("repofiscal.app")

app = FastAPI(
    title="RepoFiscal API",
    version="0.1.0",
    description="API para gestão fiscal de fornecedores, unidades, contratos e notas fiscais.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    BKP_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    run_backup_if_due(force=not BACKUP_ARCHIVE_PATH.exists())
    start_backup_scheduler()
    logger.info("Aplicacao inicializada com logs e rotina de backup ativos.")


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.exception(
            "Falha na requisicao %s %s em %.2f ms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started_at) * 1000
    logger.info(
        "%s %s -> %s em %.2f ms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(api_router)
