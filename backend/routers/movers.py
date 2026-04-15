"""
Market-wide movers endpoint.
Primary: Yahoo Finance built-in screeners (day_gainers / day_losers) via yf.screen().
Fallback: batch yf.download() for 20 large-caps — single HTTP request, rate-limit safe.
"""

import yfinance as yf
from fastapi import APIRouter
from datetime import datetime, timezone
import cache

router = APIRouter()

# Fallback universe — 20 large-caps with static names (no .info needed)
FALLBACK_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
    "META", "TSLA", "JPM", "V", "UNH",
    "XOM", "JNJ", "WMT", "AVGO", "AMD",
    "NFLX", "BAC", "MA", "LLY", "COST",
]

FALLBACK_NAMES = {
    "AAPL": "Apple Inc.", "MSFT": "Microsoft Corp.", "NVDA": "NVIDIA Corp.",
    "GOOGL": "Alphabet Inc.", "AMZN": "Amazon.com Inc.", "META": "Meta Platforms Inc.",
    "TSLA": "Tesla Inc.", "JPM": "JPMorgan Chase & Co.", "V": "Visa Inc.",
    "UNH": "UnitedHealth Group", "XOM": "Exxon Mobil Corp.", "JNJ": "Johnson & Johnson",
    "WMT": "Walmart Inc.", "AVGO": "Broadcom Inc.", "AMD": "Advanced Micro Devices",
    "NFLX": "Netflix Inc.", "BAC": "Bank of America Corp.", "MA": "Mastercard Inc.",
    "LLY": "Eli Lilly and Co.", "COST": "Costco Wholesale Corp.",
}


def _parse_screener_quote(q: dict) -> dict | None:
    price = q.get("regularMarketPrice")
    change_pct = q.get("regularMarketChangePercent")
    if not price or change_pct is None:
        return None
    name = q.get("shortName") or q.get("longName") or q.get("symbol", "")
    return {
        "symbol": q.get("symbol", ""),
        "name": name[:40],
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


def _fallback_from_universe() -> tuple[list, list, str]:
    """
    Single yf.download() batch call — far less likely to trigger rate limits
    than fetching .info for each ticker individually.
    """
    try:
        import pandas as pd
        tickers_str = " ".join(FALLBACK_UNIVERSE)
        data = yf.download(tickers_str, period="2d", auto_adjust=True,
                           progress=False, threads=False)

        if data.empty or len(data) < 2:
            return [], [], "curated universe (market may be closed)"

        closes = data["Close"]
        today_row = closes.iloc[-1]
        prev_row = closes.iloc[-2]

        stocks = []
        for sym in FALLBACK_UNIVERSE:
            try:
                price = float(today_row[sym])
                prev = float(prev_row[sym])
                if pd.isna(price) or pd.isna(prev) or prev == 0:
                    continue
                change_pct = (price - prev) / prev * 100
                stocks.append({
                    "symbol": sym,
                    "name": FALLBACK_NAMES.get(sym, sym),
                    "price": round(price, 2),
                    "change_pct": round(change_pct, 2),
                })
            except Exception:
                continue

        gainers = sorted(
            [s for s in stocks if s["change_pct"] > 0],
            key=lambda x: x["change_pct"], reverse=True
        )[:8]
        losers = sorted(
            [s for s in stocks if s["change_pct"] < 0],
            key=lambda x: x["change_pct"]
        )[:8]
        return gainers, losers, "curated universe (market may be closed)"
    except Exception:
        return [], [], "curated universe (market may be closed)"


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
    cache.set("movers", result, ttl=300)
    return result
