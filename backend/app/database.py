"""
Database layer — SQLite via aiosqlite for async access.

Architecture Decision: SQLite over PostgreSQL
- This is a stateless ingestion + read app; SQLite is zero-infra and sufficient
  for the data volume (~35 days × 48 half-hours × ~10 forecasts per period ≈ 16k rows)
- aiosqlite wraps sqlite3 in async, keeping the FastAPI event loop non-blocking
- If you were scaling to multi-region or concurrent writers, swap to PostgreSQL
  (the SQL schema and queries are portable — no SQLite-specific syntax used)

Schema Design:
- wind_forecasts: keyed on (delivery_period, publish_time) — natural composite key
  matching the business concept "the forecast for period P issued at time T"
- wind_actuals: keyed on delivery_period
- Separate tables rather than a join view: simpler ingestion, clearer ownership
"""

import aiosqlite
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Database file lives in /data/ volume, mounted via docker-compose
DB_PATH = Path("/data/wind_forecast.db")


async def get_db() -> aiosqlite.Connection:
    """Dependency-injectable DB connection for FastAPI routes."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row  # Rows behave like dicts
        yield db


async def init_db():
    """Create tables if they don't exist. Idempotent."""
    logger.info(f"Initialising database at {DB_PATH}")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            -- WINDFOR forecasts: one row per (delivery_period, publish_time) pair.
            -- This composite key captures the "forecast vintage" concept:
            -- multiple forecasts may exist for the same delivery period,
            -- each issued at a different publishTime.
            CREATE TABLE IF NOT EXISTS wind_forecasts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_period TEXT NOT NULL,   -- ISO 8601 UTC, e.g. "2026-01-15T13:30:00Z"
                publish_time    TEXT NOT NULL,   -- When Elexon published this forecast
                generation_mw   REAL NOT NULL,   -- Forecast MW
                created_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(delivery_period, publish_time)
            );

            -- Index for the point-in-time query: filter by delivery_period range
            -- AND publish_time <= cutoff. This covers both predicates efficiently.
            CREATE INDEX IF NOT EXISTS idx_forecasts_pit
                ON wind_forecasts(delivery_period, publish_time);

            -- FUELHH actuals: one row per delivery_period (half-hourly settlement period)
            CREATE TABLE IF NOT EXISTS wind_actuals (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_period TEXT NOT NULL UNIQUE,  -- ISO 8601 UTC
                generation_mw   REAL NOT NULL,
                created_at      TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_actuals_period
                ON wind_actuals(delivery_period);

            -- Ingestion audit log: track when data was fetched and from where
            CREATE TABLE IF NOT EXISTS ingestion_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset     TEXT NOT NULL,      -- "FUELHH" or "WINDFOR"
                window_from TEXT NOT NULL,
                window_to   TEXT NOT NULL,
                rows_upserted INTEGER NOT NULL,
                fetched_at  TEXT DEFAULT (datetime('now'))
            );
        """)
        await db.commit()
        logger.info("Database schema ready")
