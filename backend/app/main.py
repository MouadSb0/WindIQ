"""
Wind Forecast API — FastAPI application entry point.

Architecture:
- FastAPI for async request handling (httpx + aiosqlite keep the event loop free)
- SQLite via aiosqlite: zero-infra, sufficient for ~50k rows/month window
- CORS open in dev; tighten to Vercel domain in production
- OpenAPI docs auto-generated at /docs (great for technical review)
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import forecasts, actuals, accuracy
from app.routers import ingest as ingest_router
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="WindIQ API",
    description=(
        "Point-in-time correct wind generation forecasts for UK energy trading. "
        "Implements publishTime ≤ cutoff filtering to eliminate look-ahead bias."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock to Vercel domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router.router,   prefix="/api/v1", tags=["Ingest"])
app.include_router(forecasts.router,       prefix="/api/v1", tags=["Forecasts"])
app.include_router(actuals.router,         prefix="/api/v1", tags=["Actuals"])
app.include_router(accuracy.router,        prefix="/api/v1", tags=["Accuracy"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "windiq-api", "version": "1.0.0"}
