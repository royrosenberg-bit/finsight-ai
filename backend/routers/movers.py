"""
Market-wide movers endpoint.
Primary: Yahoo Finance built-in screeners (day_gainers / day_losers) via yf.screen().
Fallback: curated ~60-stock universe sorted by change_pct — used when market
is closed or the screener API is unavailable.
"""

import yfinance as yf
from fastapi import APIRouter
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import cache

router = APIRouter()

# Fallback universe — ~60 stocks, diverse across sectors and market caps
FALLBACK_UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
    # Large-cap tech / software
    "AMD", "INTC", "QCOM", "ADBE", "CRM", "ORCL", "NOW", "SNOW",
    "PLTR", "PANW", "CRWD", "NET",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC", "V", "MA", "AXP", "BLK", "SCHW",
    # Healthcare
    "UNH", "JNJ", "PFE", "ABBV", "MRK", "LLY", "AMGN", "GILD", "VRTX",
    # Consumer
    "WMT", "COST", "HD", "NKE", "SBUX", "MCD", "PG", "KO", "PEP",
    # Energy
    "XOM", "CVX", "COP", "OXY",
    # Industrials / transport
    "BA", "CAT", "GE", "UPS", "FDX", "DE",
    # Growth / high-beta
    "NFLX", "SHOP", "UBER", "RBLX", "COIN",
    # ETFs (for reference)
    "SPY", "QQQ", "IWM",
]


def _parse_screener_quote(q: dict) -> dict | None:
    price = q.get("regularMarketPrice")
    change_pct = q.get("regularMarketChangePercent")
    if not price or change_pct is None:
        return None
    name = q.get("shortName") or q.get("longName") or q.get("symbol", "")
    return {
        "symbol": q.get("symbol", ""),
        "name": name[:40],  # truncate long names
        "price": round(price, 2),
        "change_pct": round(change_pct, 2),
    }


def _try_yahoo_screeners() -> tuple[list, list, str]:
    """
    Query Yahoo Finance's built-in day_gainers / day_losers screeners.
    Returns (gainers, losers, source_label) or ([], [], '') on failure.
    """
    try:
        g_raw = yf.screen("day_gainers", count=10)
        l_raw = yf.screen("day_losers", count=10)

        gainers = [
            q for q in (_parse_screener_quote(r) for r in g_raw.get("quotes", []))
            if q and q["change_pct"] > 0
        ]
        losers = [
            q for q in (_parse_screener_quote(r) for r in l_raw.get("quotes", []))
            if q and q["change_pct"] < 0
        ]

        if gainers or losers:
            return gainers, losers, "Yahoo Finance screener"
    except Exception:
        pass
    return [], [], ""


def _fetch_one(symbol: str) -> dict | None:
    try:
        info = yf.Ticker(symbol).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
        if not price or not prev:
            return None
        change_pct = (price - prev) / prev * 100
        name = info.get("shortName") or info.get("longName") or symbol
        return {
            "symbol": symbol,
            "name": name[:40],
            "price": round(price, 2),
            "change_pct": round(change_pct, 2),
        }
    except Exception:
        return None


def _fallback_from_universe() -> tuple[list, list, str]:
    stocks = []
    with ThreadPoolExecutor(max_workers=15) as ex:
        futures = {ex.submit(_fetch_one, sym): sym for sym in FALLBACK_UNIVERSE}
        for f in as_completed(futures):
            result = f.result()
            if result and result["change_pct"] is not None:
                stocks.append(result)

    gainers = sorted(
        [s for s in stocks if s["change_pct"] > 0],
        key=lambda x: x["change_pct"], reverse=True
    )[:8]
    losers = sorted(
        [s for s in stocks if s["change_pct"] < 0],
        key=lambda x: x["change_pct"]
    )[:8]
    return gainers, losers, "curated universe (market may be closed)"


@router.get("/movers")
def get_movers():
    cached = cache.get("movers")
    if cached:
        return cached

    gainers, losers, source = _try_yahoo_screeners()

    if not gainers and not losers:
        gainers, losers, source = _fallback_from_universe()

    timestamp = datetime.now(timezone.utc).strftime("%-I:%M %p UTC")

    result = {
        "gainers": gainers,
        "losers": losers,
        "source": source,
        "timestamp": timestamp,
    }
    cache.set("movers", result, ttl=300)  # cache movers for 5 minutes
    return result
