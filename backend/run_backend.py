from __future__ import annotations

import sys
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DEPS_DIR = BASE_DIR / ".deps"

if DEPS_DIR.exists():
    sys.path.insert(0, str(DEPS_DIR))

sys.path.insert(0, str(BASE_DIR))

import uvicorn


if __name__ == "__main__":
    host = os.getenv("REPOFISCAL_HOST", "127.0.0.1")
    port = int(os.getenv("REPOFISCAL_PORT", "8010"))
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
