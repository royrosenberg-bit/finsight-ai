"""
Shared yfinance helpers — all routers import from here.
Uses a two-layer strategy:
  1. fast_info  — lightweight endpoint, always reliable for price/market cap
  2. ticker.info — full fundamentals (sector, PE, name…), cached 4h to survive rate limits
"""
import time
import yf_session
import cache

INFO_TTL = 14400  # 4 hours


def fetch_info(sym: str, retries: int = 3) -> dict:
    """Return merged fast_info + ticker.info for a symbol.
    Caches raw ticker.info for INFO_TTL seconds so sector/name survive rate-limit windows."""
    sym = sym.upper()
    ticker = yf_session.Ticker(sym)

    # Layer 1: fast_info — reliable price data
    fast = {}
    try:
        fi = ticker.fast_info
        price = fi.last_price
        prev = getattr(fi, "previous_close", None) or getattr(fi, "regular_market_previous_close", None)
        if price:
            fast["currentPrice"] = float(price)
        if prev:
            fast["previousClose"] = float(prev)
        mc = getattr(fi, "market_cap", None)
        if mc:
            fast["marketCap"] = int(mc)
        yh = getattr(fi, "year_high", None)
        yl = getattr(fi, "year_low", None)
        if yh:
            fast["fiftyTwoWeekHigh"] = float(yh)
        if yl:
            fast["fiftyTwoWeekLow"] = float(yl)
    except Exception:
        pass

    # Layer 2: check info cache before hitting Yahoo Finance
    cached_info = cache.get(f"info:{sym}")
    if cached_info:
        return {**cached_info, **fast}

    # Fetch full info — retry on rate limit or empty response
    for attempt in range(retries):
        try:
            info = ticker.info or {}
            if info and (info.get("longName") or info.get("shortName")):
                cache.set(f"info:{sym}", info, ttl=INFO_TTL)
                return {**info, **fast}
            # Empty dict — retry with short backoff
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as e:
            msg = str(e).lower()
            if ("too many requests" in msg or "429" in msg or "rate" in msg) and attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                break

    return fast
