"""
Elexon BMRS API client — CORRECTED parameter names.

Research finding: Elexon uses different param names per endpoint:
  FUELHH:  settlementDateFrom / settlementDateTo / fuelType
  WINDFOR: publishDateTimeFrom / publishDateTimeTo

The /stream variants return a JSON array directly (no wrapper).
The standard variants wrap in {"data": [...]}.
"""

import httpx
import asyncio
import logging
import json
from datetime import datetime, date, timedelta
import calendar

logger = logging.getLogger(__name__)

ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1"

PRIMARY_WINDOW_FROM = "2026-01-01"
PRIMARY_WINDOW_TO   = "2026-01-31"


async def _get_json_stream(
    url: str,
    params: dict,
    max_retries: int = 3,
) -> list[dict]:
    """
    GET from an Elexon /stream endpoint, returning the parsed JSON array.
    
    The stream endpoints return a plain JSON array — no pagination, no wrapper.
    We load it fully into memory (acceptable for 1-month windows).
    """
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.get(url, params=params)

                if resp.status_code == 429:
                    wait = 2 ** (attempt + 1)
                    logger.warning(f"Rate limited (429), waiting {wait}s")
                    await asyncio.sleep(wait)
                    continue

                resp.raise_for_status()

                text = resp.text.strip()
                if not text:
                    return []

                data = json.loads(text)
                if isinstance(data, list):
                    return data
                if isinstance(data, dict) and "data" in data:
                    return data["data"]
                return []

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP {e.response.status_code} for {url} params={params}: {e}")
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)
        except httpx.RequestError as e:
            logger.error(f"Request error {url}: {e}")
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)
    return []


def _to_z(dt_str: str) -> str:
    """Normalise datetime string to ISO 8601 UTC with Z suffix."""
    if not dt_str:
        return dt_str
    return dt_str.replace("+00:00", "Z").replace(" ", "T")


async def fetch_wind_actuals(from_date: str, to_date: str) -> list[dict]:
    """
    FUELHH actuals for WIND fuelType.
    
    Correct parameters:
      settlementDateFrom / settlementDateTo: date strings yyyy-MM-dd
      fuelType: filter array (we pass a single value "WIND")
    
    Returns normalised dicts: {delivery_period, generation_mw}
    """
    url = f"{ELEXON_BASE}/datasets/FUELHH/stream"
    params = {
        "settlementDateFrom": from_date,
        "settlementDateTo":   to_date,
        "fuelType":           "WIND",
    }

    rows = await _get_json_stream(url, params)
    records = []
    for row in rows:
        # Extra guard: API filter should handle this, but confirm fuelType
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue
        start_time = row.get("startTime")
        generation = row.get("generation")
        if start_time and generation is not None:
            records.append({
                "delivery_period": _to_z(start_time),
                "generation_mw":   float(generation),
            })

    logger.info(f"Fetched {len(records)} FUELHH WIND actuals ({from_date} → {to_date})")
    return records


async def fetch_wind_forecasts(from_date: str, to_date: str) -> list[dict]:
    """
    WINDFOR forecast vintages.
    
    Correct parameters:
      publishDateTimeFrom / publishDateTimeTo: ISO 8601 datetime strings
    
    CRITICAL — We fetch ALL vintages (all publishTimes) for the window.
    We do NOT filter by publishTime here. The point-in-time filter is
    applied at query time (in the SQL WHERE clause) so that the user can
    choose any cutoff and get the correct view of history.
    
    Returns normalised dicts: {delivery_period, publish_time, generation_mw}
    """
    url = f"{ELEXON_BASE}/datasets/WINDFOR/stream"
    params = {
        "publishDateTimeFrom": f"{from_date}T00:00:00Z",
        "publishDateTimeTo":   f"{to_date}T23:59:59Z",
    }

    rows = await _get_json_stream(url, params)
    records = []
    for row in rows:
        start_time   = row.get("startTime")
        publish_time = row.get("publishTime")
        generation   = row.get("generation")
        if start_time and publish_time and generation is not None:
            records.append({
                "delivery_period": _to_z(start_time),
                "publish_time":    _to_z(publish_time),
                "generation_mw":   float(generation),
            })

    logger.info(f"Fetched {len(records)} WINDFOR forecasts ({from_date} → {to_date})")
    return records


async def detect_available_window() -> tuple[str, str, bool, str]:
    """
    Probe Elexon to determine which data window to use.
    Returns (from_date, to_date, is_fallback, reason).
    
    Primary: January 2026 (specified in challenge brief).
    Fallback: most recent complete calendar month with data.
    """
    url = f"{ELEXON_BASE}/datasets/WINDFOR/stream"

    # Quick existence check: fetch a single day of forecasts
    test_params = {
        "publishDateTimeFrom": f"{PRIMARY_WINDOW_FROM}T00:00:00Z",
        "publishDateTimeTo":   f"{PRIMARY_WINDOW_FROM}T01:00:00Z",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=test_params)
            if resp.status_code == 200 and resp.text.strip():
                data = json.loads(resp.text)
                if isinstance(data, list) and len(data) > 0:
                    return PRIMARY_WINDOW_FROM, PRIMARY_WINDOW_TO, False, ""
    except Exception as e:
        logger.warning(f"Primary window probe failed: {e}")

    # Fallback: walk backwards month by month
    probe = date.today().replace(day=1) - timedelta(days=1)
    for _ in range(24):
        m_from = probe.replace(day=1)
        m_to   = probe.replace(day=calendar.monthrange(probe.year, probe.month)[1])
        test_params = {
            "publishDateTimeFrom": f"{m_from.isoformat()}T00:00:00Z",
            "publishDateTimeTo":   f"{m_from.isoformat()}T01:00:00Z",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=test_params)
                if resp.status_code == 200 and resp.text.strip():
                    data = json.loads(resp.text)
                    if isinstance(data, list) and len(data) > 0:
                        reason = f"Jan 2026 data unavailable; using {m_from} to {m_to}"
                        logger.warning(reason)
                        return m_from.isoformat(), m_to.isoformat(), True, reason
        except Exception:
            pass
        probe = m_from - timedelta(days=1)

    # Hardcoded last-resort
    return "2025-10-01", "2025-10-31", True, "All probes failed; using Oct 2025 hardcoded fallback"
