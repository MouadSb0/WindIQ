"""
Forecasts router — point-in-time correct forecast retrieval.

The CRITICAL endpoint is /forecasts/at-cutoff.

Point-in-time correctness SQL:
    SELECT *
    FROM wind_forecasts
    WHERE delivery_period BETWEEN :from AND :to
      AND publish_time <= :cutoff        ← THIS IS THE KEY FILTER
    ORDER BY delivery_period, publish_time

This query answers: "Which forecasts existed at cutoff time?"
Any forecast published AFTER the cutoff is invisible — it would not
have been available to a trader making a decision at that time.
"""
import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
import aiosqlite
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


class ForecastPoint(BaseModel):
    delivery_period: str
    publish_time:    str
    generation_mw:   float


class ActualPoint(BaseModel):
    delivery_period: str
    generation_mw:   float


class ForecastsAtCutoffResponse(BaseModel):
    cutoff:      str
    forecasts:   list[ForecastPoint]
    actuals:     list[ActualPoint]
    data_window: dict


@router.get("/forecasts/at-cutoff", response_model=ForecastsAtCutoffResponse)
async def get_forecasts_at_cutoff(
    cutoff:        str = Query(..., description="Decision cutoff datetime (ISO 8601 UTC)"),
    delivery_from: str = Query(..., description="Delivery period start date (yyyy-MM-dd)"),
    delivery_to:   str = Query("",  description="Delivery period end date (yyyy-MM-dd, defaults to delivery_from)"),
    db: aiosqlite.Connection = Depends(get_db),
):
    """
    Return all forecasts where publishTime <= cutoff for the delivery window.

    Point-in-time correctness explanation:
    ─────────────────────────────────────
    The WINDFOR dataset holds multiple forecast vintages per delivery period.
    A "vintage" is a (delivery_period, publish_time) pair.

    At any real-world decision time D, a trader can only act on forecasts
    that have been published by D. Showing a forecast published *after* D
    would be look-ahead bias — using information that didn't exist yet.

    This endpoint enforces: publish_time <= cutoff_time
    so the response mirrors exactly what was knowable at the cutoff.
    """
    if not delivery_to:
        delivery_to = delivery_from

    # Normalise cutoff to ensure Z suffix for string comparison
    if not cutoff.endswith("Z"):
        cutoff = cutoff.replace("+00:00", "") + "Z"

    # Build delivery period range boundaries
    delivery_from_iso = delivery_from + "T00:00:00Z"
    delivery_to_iso   = delivery_to   + "T23:59:59Z"

    # ── POINT-IN-TIME SQL QUERY ──────────────────────────────────────────
    # The WHERE clause has two predicates:
    #   1. delivery_period BETWEEN ... : restrict to the requested delivery window
    #   2. publish_time <= cutoff      : THE point-in-time filter
    #
    # ISO 8601 strings sort lexicographically == chronologically for UTC,
    # so string comparison on TEXT columns is correct.
    #
    # We fetch all (delivery_period, publish_time) pairs, NOT just the latest
    # per delivery_period, because the caller may want to see forecast evolution.
    # The frontend picks the latest-vintage per period for the main chart.
    # ────────────────────────────────────────────────────────────────────
    sql = """
        SELECT delivery_period, publish_time, generation_mw
        FROM   wind_forecasts
        WHERE  delivery_period >= :delivery_from
          AND  delivery_period <= :delivery_to
          AND  publish_time    <= :cutoff          -- point-in-time filter
        ORDER BY delivery_period, publish_time
    """
    cursor = await db.execute(sql, {
        "delivery_from": delivery_from_iso,
        "delivery_to":   delivery_to_iso,
        "cutoff":        cutoff,
    })
    rows = await cursor.fetchall()
    forecasts = [
        ForecastPoint(
            delivery_period=row["delivery_period"],
            publish_time=row["publish_time"],
            generation_mw=row["generation_mw"],
        )
        for row in rows
    ]

    if not forecasts:
        logger.warning(
            f"No forecasts found at cutoff={cutoff} for {delivery_from}→{delivery_to}. "
            "Data may not be ingested yet."
        )

    # Fetch actuals for the same window (for chart overlay)
    sql_actuals = """
        SELECT delivery_period, generation_mw
        FROM   wind_actuals
        WHERE  delivery_period >= :delivery_from
          AND  delivery_period <= :delivery_to
        ORDER BY delivery_period
    """
    cursor = await db.execute(sql_actuals, {
        "delivery_from": delivery_from_iso,
        "delivery_to":   delivery_to_iso,
    })
    actual_rows = await cursor.fetchall()
    actuals = [
        ActualPoint(delivery_period=r["delivery_period"], generation_mw=r["generation_mw"])
        for r in actual_rows
    ]

    return ForecastsAtCutoffResponse(
        cutoff=cutoff,
        forecasts=forecasts,
        actuals=actuals,
        data_window={"from": delivery_from, "to": delivery_to},
    )
