"""
Portfolio Historical Performance
Accepts holdings + period, returns portfolio value over time.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import yf_session

router = APIRouter()

PERIOD_CONFIG = {
    "1w":  {"period": "7d",  "interval": "1d"},
    "1m":  {"period": "1mo", "interval": "1d"},
    "3m":  {"period": "3mo", "interval": "1d"},
    "6m":  {"period": "6mo", "interval": "1d"},
    "1y":  {"period": "1y",  "interval": "1d"},
}


class Holding(BaseModel):
    symbol: str
    shares: float
    buyPrice: float


class PortfolioHistoryRequest(BaseModel):
    holdings: List[Holding]
    period: str = "3m"


@router.post("/portfolio/history")
def get_portfolio_history(req: PortfolioHistoryRequest):
    if not req.holdings:
        raise HTTPException(status_code=400, detail="No holdings provided")

    period_key = req.period.lower()
    config = PERIOD_CONFIG.get(period_key)
    if not config:
        raise HTTPException(status_code=400, detail=f"Invalid period. Use: {', '.join(PERIOD_CONFIG.keys())}")

    # Fetch price history for each symbol
    price_series = {}  # symbol -> {date_str -> close_price}
    for h in req.holdings:
        sym = h.symbol.upper()
        try:
            ticker = yf_session.Ticker(sym)
            hist = ticker.history(period=config["period"], interval=config["interval"])
            if hist.empty:
                continue
            series = {}
            for date, row in hist.iterrows():
                label = str(date.date())
                series[label] = float(row["Close"])
            price_series[sym] = series
        except Exception:
            continue

    if not price_series:
        raise HTTPException(status_code=404, detail="Could not fetch price history for any holdings")

    # Find dates common to all fetched symbols
    all_date_sets = [set(s.keys()) for s in price_series.values()]
    common_dates = sorted(set.intersection(*all_date_sets)) if all_date_sets else []

    if not common_dates:
        raise HTTPException(status_code=404, detail="No overlapping dates found across holdings")

    # Build total portfolio value per date
    total_cost = sum(h.shares * h.buyPrice for h in req.holdings if h.symbol.upper() in price_series)

    result = []
    for date in common_dates:
        total_value = 0.0
        for h in req.holdings:
            sym = h.symbol.upper()
            if sym in price_series and date in price_series[sym]:
                total_value += h.shares * price_series[sym][date]
        result.append({"date": date, "value": round(total_value, 2)})

    return {
        "history": result,
        "cost_basis": round(total_cost, 2),
        "period": period_key,
    }
