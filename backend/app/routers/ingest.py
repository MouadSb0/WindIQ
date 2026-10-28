"""
Ingest router — triggers and monitors Elexon data ingestion.
"""
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.elexon_client import fetch_wind_actuals, fetch_wind_forecasts, detect_available_window

logger = logging.getLogger(__name__)
router = APIRouter()

# Shared state for data window (set at ingest time)
_data_window: dict = {"from": None, "to": None, "fallback": False, "reason": ""}


class IngestStatus(BaseModel):
    windfor_rows:    int
    fuelhh_rows:     int
    data_window:     dict
    last_ingest:     str | None
    using_fallback:  bool
    fallback_reason: str | None = None


async def _run_ingest(from_date: str, to_date: str):
    """Core ingest logic: fetch from Elexon and upsert to SQLite."""
    import aiosqlite
    from app.database import DB_PATH

    logger.info(f"Starting ingest: {from_date} → {to_date}")

    # --- Fetch both datasets concurrently ---
    import asyncio
    actuals_task  = asyncio.create_task(fetch_wind_actuals(from_date, to_date))
    forecast_task = asyncio.create_task(fetch_wind_forecasts(from_date, to_date))
    actuals, forecasts = await asyncio.gather(actuals_task, forecast_task)

    async with aiosqlite.connect(DB_PATH) as db:
        # Upsert actuals
        await db.executemany(
            """
            INSERT INTO wind_actuals (delivery_period, generation_mw)
            VALUES (?, ?)
            ON CONFLICT(delivery_period) DO UPDATE SET generation_mw = excluded.generation_mw
            """,
            [(r["delivery_period"], r["generation_mw"]) for r in actuals],
        )

        # Upsert forecasts
        await db.executemany(
            """
            INSERT INTO wind_forecasts (delivery_period, publish_time, generation_mw)
            VALUES (?, ?, ?)
            ON CONFLICT(delivery_period, publish_time)
            DO UPDATE SET generation_mw = excluded.generation_mw
            """,
            [(r["delivery_period"], r["publish_time"], r["generation_mw"]) for r in forecasts],
        )

        # Log the ingest
        await db.execute(
            """
            INSERT INTO ingestion_log (dataset, window_from, window_to, rows_upserted)
            VALUES ('FUELHH+WINDFOR', ?, ?, ?)
            """,
            (from_date, to_date, len(actuals) + len(forecasts)),
        )
        await db.commit()

    logger.info(f"Ingest complete: {len(actuals)} actuals, {len(forecasts)} forecasts")
    return len(actuals), len(forecasts)


@router.post("/ingest")
async def trigger_ingest() -> IngestStatus:
    """
    Trigger a full re-ingest from Elexon.
    Detects the available data window, then fetches FUELHH + WINDFOR concurrently.
    """
    from_date, to_date, is_fallback, reason = await detect_available_window()
    _data_window.update({
        "from": from_date,
        "to":   to_date,
        "fallback": is_fallback,
        "reason": reason,
    })

    try:
        n_actuals, n_forecasts = await _run_ingest(from_date, to_date)
    except Exception as e:
        logger.error(f"Ingest failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingest failed: {str(e)}")

    return await _get_status_internal(from_date, to_date, is_fallback, reason)


@router.get("/ingest/status")
async def get_ingest_status() -> IngestStatus:
    """Return current DB row counts and window without triggering ingest."""
    from_date = _data_window.get("from") or ""
    to_date   = _data_window.get("to") or ""
    fallback  = _data_window.get("fallback", False)
    reason    = _data_window.get("reason", "")
    return await _get_status_internal(from_date, to_date, fallback, reason)


async def _get_status_internal(from_date, to_date, fallback, reason) -> IngestStatus:
    import aiosqlite
    from app.database import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT COUNT(*) as n FROM wind_forecasts")
        wf_row = await cur.fetchone()
        cur = await db.execute("SELECT COUNT(*) as n FROM wind_actuals")
        wa_row = await cur.fetchone()
        cur = await db.execute(
            "SELECT fetched_at FROM ingestion_log ORDER BY fetched_at DESC LIMIT 1"
        )
        log_row = await cur.fetchone()

    return IngestStatus(
        windfor_rows=wf_row["n"] if wf_row else 0,
        fuelhh_rows=wa_row["n"] if wa_row else 0,
        data_window={"from": from_date, "to": to_date},
        last_ingest=log_row["fetched_at"] if log_row else None,
        using_fallback=bool(fallback),
        fallback_reason=reason or None,
    )
