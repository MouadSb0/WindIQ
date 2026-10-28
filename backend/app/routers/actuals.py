"""Actuals router — raw FUELHH wind generation data."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
import aiosqlite
from app.database import get_db

router = APIRouter()


class ActualPoint(BaseModel):
    delivery_period: str
    generation_mw:   float


@router.get("/actuals", response_model=list[ActualPoint])
async def get_actuals(
    from_date: str = Query(..., alias="from", description="Start date yyyy-MM-dd"),
    to_date:   str = Query(..., alias="to",   description="End date yyyy-MM-dd"),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return FUELHH actuals for a date range."""
    from_iso = from_date + "T00:00:00Z"
    to_iso   = to_date   + "T23:59:59Z"

    cursor = await db.execute(
        """
        SELECT delivery_period, generation_mw
        FROM   wind_actuals
        WHERE  delivery_period >= :from AND delivery_period <= :to
        ORDER  BY delivery_period
        """,
        {"from": from_iso, "to": to_iso},
    )
    rows = await cursor.fetchall()
    return [ActualPoint(delivery_period=r["delivery_period"], generation_mw=r["generation_mw"]) for r in rows]
