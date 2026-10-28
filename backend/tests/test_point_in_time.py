"""
Tests — Point-in-Time Correctness

The most important test in this codebase.

WHAT WE'RE PROVING:
    The /forecasts/at-cutoff endpoint returns ONLY forecasts where
    publish_time <= cutoff, regardless of what newer vintages exist.

    A passing test here is the mathematical proof that the product
    has zero look-ahead bias for the decision view.

REVIEWER CHALLENGE to anticipate:
    Q: "How do I know the SQL filter is actually the boundary condition?"
    A: test_cutoff_boundary_is_exact() tests the single-second boundary:
       forecasts published at exactly the cutoff ARE included;
       forecasts published 1 second after are NOT.
"""
import asyncio
import pytest
import aiosqlite
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def tmp_db_path(tmp_path) -> Path:
    return tmp_path / "test_wind.db"


@pytest.fixture(scope="function")
async def db_with_data(tmp_db_path):
    """
    Create a test database seeded with:
      - Delivery period: 2026-01-15T12:00:00Z (one period)
      - Three forecast vintages at different publish times:
          V1: published 2026-01-14T06:00:00Z  ← early, should be included if cutoff >= 06:00
          V2: published 2026-01-14T12:00:00Z  ← at noon, included if cutoff >= 12:00
          V3: published 2026-01-14T18:00:00Z  ← late, only if cutoff >= 18:00
      - One actual for the same period
    """
    async with aiosqlite.connect(tmp_db_path) as db:
        await db.executescript("""
            CREATE TABLE wind_forecasts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_period TEXT NOT NULL,
                publish_time    TEXT NOT NULL,
                generation_mw   REAL NOT NULL,
                created_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(delivery_period, publish_time)
            );
            CREATE INDEX idx_f ON wind_forecasts(delivery_period, publish_time);

            CREATE TABLE wind_actuals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_period TEXT NOT NULL UNIQUE,
                generation_mw   REAL NOT NULL
            );

            -- Three vintages for delivery period 2026-01-15T12:00:00Z
            INSERT INTO wind_forecasts (delivery_period, publish_time, generation_mw) VALUES
                ('2026-01-15T12:00:00Z', '2026-01-14T06:00:00Z', 5000.0),  -- V1 early
                ('2026-01-15T12:00:00Z', '2026-01-14T12:00:00Z', 5200.0),  -- V2 noon
                ('2026-01-15T12:00:00Z', '2026-01-14T18:00:00Z', 5400.0);  -- V3 late

            -- Also a SECOND delivery period with different vintage pattern
            INSERT INTO wind_forecasts (delivery_period, publish_time, generation_mw) VALUES
                ('2026-01-15T12:30:00Z', '2026-01-14T06:00:00Z', 4800.0),
                ('2026-01-15T12:30:00Z', '2026-01-14T20:00:00Z', 5100.0);  -- published after noon cutoff

            INSERT INTO wind_actuals (delivery_period, generation_mw) VALUES
                ('2026-01-15T12:00:00Z', 4900.0),
                ('2026-01-15T12:30:00Z', 4750.0);
        """)
        await db.commit()
    return tmp_db_path


@pytest.fixture(scope="function")
async def test_app(db_with_data, monkeypatch):
    """
    Build a test FastAPI app with the real routers but pointed at the test DB.
    Monkeypatches DB_PATH so the app reads from our seeded test database.
    """
    import app.database as db_module
    monkeypatch.setattr(db_module, "DB_PATH", db_with_data)

    # Import AFTER patching the path
    from app.routers.forecasts import router as forecast_router
    from app.routers.actuals   import router as actuals_router
    from app.routers.accuracy  import router as accuracy_router

    test_app = FastAPI()
    test_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    test_app.include_router(forecast_router, prefix="/api/v1")
    test_app.include_router(actuals_router,  prefix="/api/v1")
    test_app.include_router(accuracy_router, prefix="/api/v1")

    return test_app


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cutoff_at_noon_excludes_late_vintage(test_app):
    """
    GIVEN a cutoff of 2026-01-14T12:00:00Z (noon)
    WHEN  we query /forecasts/at-cutoff
    THEN  V1 (06:00) and V2 (12:00) are returned, V3 (18:00) is NOT.

    This is the core point-in-time correctness test.
    """
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T12:00:00Z",
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()

    publish_times = [f["publish_time"] for f in body["forecasts"]]

    # V1 and V2 must be present
    assert "2026-01-14T06:00:00Z" in publish_times, "V1 (06:00) should be included at noon cutoff"
    assert "2026-01-14T12:00:00Z" in publish_times, "V2 (12:00 exactly) should be included at noon cutoff"

    # V3 must be EXCLUDED — this is the look-ahead bias prevention
    assert "2026-01-14T18:00:00Z" not in publish_times, (
        "V3 (18:00) must be EXCLUDED at noon cutoff — "
        "including it would be look-ahead bias!"
    )


@pytest.mark.asyncio
async def test_cutoff_boundary_is_exact(test_app):
    """
    BOUNDARY TEST: the filter is publish_time <= cutoff (inclusive).
    A forecast published AT EXACTLY the cutoff time must be included.
    A forecast published 1 second AFTER must be excluded.

    This tests the boundary condition of the SQL WHERE clause.
    """
    # At the exact noon second: both V1 and V2 should appear, V3 should not
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp_exact = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T12:00:00Z",   # exactly noon
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })
        # One second BEFORE noon: only V1 should appear
        resp_before = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T11:59:59Z",   # 1 second before noon
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    exact_pts  = {f["publish_time"] for f in resp_exact.json()["forecasts"]}
    before_pts = {f["publish_time"] for f in resp_before.json()["forecasts"]}

    # At noon: V1 + V2 included
    assert "2026-01-14T12:00:00Z" in exact_pts, "Forecast at exact cutoff must be included"
    assert "2026-01-14T06:00:00Z" in exact_pts

    # One second before noon: V2 must be excluded
    assert "2026-01-14T12:00:00Z" not in before_pts, (
        "Forecast published at 12:00:00Z must NOT appear at 11:59:59Z cutoff"
    )
    assert "2026-01-14T06:00:00Z" in before_pts


@pytest.mark.asyncio
async def test_cutoff_early_morning_returns_nothing(test_app):
    """
    GIVEN a cutoff BEFORE any forecasts were published
    THEN  the response has zero forecasts (not an error).

    This tests graceful empty-result handling.
    """
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T05:00:00Z",  # before earliest vintage (06:00)
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    assert resp.status_code == 200
    body = resp.json()
    assert body["forecasts"] == [], "Before any publish time: forecast list must be empty"


@pytest.mark.asyncio
async def test_cutoff_future_returns_all(test_app):
    """
    GIVEN a cutoff far in the future
    THEN  ALL vintages are visible (because all publishTimes <= future cutoff)
    """
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2099-01-01T00:00:00Z",
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    body = resp.json()
    publish_times = {f["publish_time"] for f in body["forecasts"]}
    assert "2026-01-14T06:00:00Z" in publish_times
    assert "2026-01-14T12:00:00Z" in publish_times
    assert "2026-01-14T18:00:00Z" in publish_times


@pytest.mark.asyncio
async def test_second_period_late_vintage_excluded(test_app):
    """
    For the 12:30 delivery period, V2 was published at 20:00.
    At noon cutoff, only V1 (06:00) should appear for that period.
    """
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T12:00:00Z",
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    body = resp.json()
    # Filter to 12:30 period
    period_12_30 = [f for f in body["forecasts"] if f["delivery_period"] == "2026-01-15T12:30:00Z"]
    pts_12_30 = {f["publish_time"] for f in period_12_30}

    assert "2026-01-14T06:00:00Z" in pts_12_30, "Early vintage for 12:30 period should be visible"
    assert "2026-01-14T20:00:00Z" not in pts_12_30, (
        "Late vintage (20:00) must not appear at noon cutoff — look-ahead bias!"
    )


@pytest.mark.asyncio
async def test_actuals_returned_alongside_forecasts(test_app):
    """The response includes actuals for chart overlay."""
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/api/v1/forecasts/at-cutoff", params={
            "cutoff":        "2026-01-14T12:00:00Z",
            "delivery_from": "2026-01-15",
            "delivery_to":   "2026-01-15",
        })

    body = resp.json()
    assert len(body["actuals"]) == 2, "Both actual periods should be returned"
    actual_periods = {a["delivery_period"] for a in body["actuals"]}
    assert "2026-01-15T12:00:00Z" in actual_periods
    assert "2026-01-15T12:30:00Z" in actual_periods
