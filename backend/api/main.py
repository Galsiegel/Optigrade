"""
FastAPI entrypoint. Run from the `backend` directory:

  uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

Or: python main.py
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import health, transcripts, users


def _cors_origins() -> list[str]:
    raw = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Optigrade API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(transcripts.router, prefix="/api/v1")

    return app


app = create_app()
