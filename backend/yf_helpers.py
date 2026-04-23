"""
Shared yfinance helpers — all routers import from here.
Uses a three-layer strategy:
  1. fast_info        — lightweight endpoint, always reliable for price/market cap
  2. ticker.info cache — full fundamentals cached 4h to survive rate limits
  3. SECTOR_FALLBACK  — hardcoded sectors for common tickers, never depends on Yahoo
"""
import time
import yf_session
import cache

INFO_TTL = 14400  # 4 hours

# Hardcoded sector fallback — used when Yahoo Finance doesn't return sector data
SECTOR_FALLBACK = {
    # Technology
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "GOOGL": "Technology", "GOOG": "Technology", "META": "Technology",
    "AVGO": "Technology", "TSM": "Technology", "ORCL": "Technology",
    "ADBE": "Technology", "CRM": "Technology", "AMD": "Technology",
    "INTC": "Technology", "QCOM": "Technology", "TXN": "Technology",
    "NOW": "Technology", "INTU": "Technology", "IBM": "Technology",
    "AMAT": "Technology", "MU": "Technology", "LRCX": "Technology",
    "KLAC": "Technology", "MRVL": "Technology", "CDNS": "Technology",
    "SNPS": "Technology", "FTNT": "Technology", "PANW": "Technology",
    "CRWD": "Technology", "NET": "Technology", "ZS": "Technology",
    "PLTR": "Technology", "SNOW": "Technology", "DDOG": "Technology",
    # Communication Services
    "META": "Communication Services", "GOOGL": "Communication Services",
    "GOOG": "Communication Services", "NFLX": "Communication Services",
    "DIS": "Communication Services", "CMCSA": "Communication Services",
    "T": "Communication Services", "VZ": "Communication Services",
    "TMUS": "Communication Services", "CHTR": "Communication Services",
    "SNAP": "Communication Services", "PINS": "Communication Services",
    "SPOT": "Communication Services", "TTWO": "Communication Services",
    # Consumer Cyclical
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical",
    "HD": "Consumer Cyclical", "MCD": "Consumer Cyclical",
    "NKE": "Consumer Cyclical", "SBUX": "Consumer Cyclical",
    "LOW": "Consumer Cyclical", "TJX": "Consumer Cyclical",
    "BKNG": "Consumer Cyclical", "ABNB": "Consumer Cyclical",
    "GM": "Consumer Cyclical", "F": "Consumer Cyclical",
    "RIVN": "Consumer Cyclical", "LCID": "Consumer Cyclical",
    # Consumer Defensive
    "WMT": "Consumer Defensive", "PG": "Consumer Defensive",
    "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
    "COST": "Consumer Defensive", "PM": "Consumer Defensive",
    "MO": "Consumer Defensive", "CL": "Consumer Defensive",
    "GIS": "Consumer Defensive", "K": "Consumer Defensive",
    # Healthcare
    "LLY": "Healthcare", "UNH": "Healthcare", "JNJ": "Healthcare",
    "ABBV": "Healthcare", "MRK": "Healthcare", "TMO": "Healthcare",
    "ABT": "Healthcare", "DHR": "Healthcare", "AMGN": "Healthcare",
    "ISRG": "Healthcare", "GILD": "Healthcare", "VRTX": "Healthcare",
    "REGN": "Healthcare", "BSX": "Healthcare", "MDT": "Healthcare",
    "SYK": "Healthcare", "CVS": "Healthcare", "CI": "Healthcare",
    "HUM": "Healthcare", "BIIB": "Healthcare", "MRNA": "Healthcare",
    "BNTX": "Healthcare", "MIRM": "Healthcare", "JAZZ": "Healthcare",
    # Financials
    "JPM": "Financial Services", "BAC": "Financial Services",
    "WFC": "Financial Services", "GS": "Financial Services",
    "MS": "Financial Services", "BLK": "Financial Services",
    "AXP": "Financial Services", "V": "Financial Services",
    "MA": "Financial Services", "PYPL": "Financial Services",
    "C": "Financial Services", "USB": "Financial Services",
    "PNC": "Financial Services", "SCHW": "Financial Services",
    "COF": "Financial Services", "CB": "Financial Services",
    "MMC": "Financial Services", "ICE": "Financial Services",
    # Industrials
    "CAT": "Industrials", "HON": "Industrials", "UPS": "Industrials",
    "BA": "Industrials", "GE": "Industrials", "RTX": "Industrials",
    "LMT": "Industrials", "DE": "Industrials", "MMM": "Industrials",
    "NOC": "Industrials", "GD": "Industrials", "FDX": "Industrials",
    "HWM": "Industrials", "POWL": "Industrials", "EMR": "Industrials",
    "ETN": "Industrials", "PH": "Industrials", "CARR": "Industrials",
    # Energy
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    "SLB": "Energy", "EOG": "Energy", "PXD": "Energy",
    "MPC": "Energy", "PSX": "Energy", "VLO": "Energy",
    "OXY": "Energy", "HES": "Energy", "DVN": "Energy",
    "LNG": "Energy", "EQT": "Energy", "AR": "Energy",
    "FANG": "Energy", "APA": "Energy", "HAL": "Energy",
    # Utilities
    "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities",
    "D": "Utilities", "AEP": "Utilities", "EXC": "Utilities",
    "SRE": "Utilities", "PCG": "Utilities", "ED": "Utilities",
    "XEL": "Utilities", "WEC": "Utilities", "ES": "Utilities",
    # Real Estate
    "PLD": "Real Estate", "AMT": "Real Estate", "EQIX": "Real Estate",
    "SPG": "Real Estate", "O": "Real Estate", "WELL": "Real Estate",
    "DLR": "Real Estate", "PSA": "Real Estate", "CBRE": "Real Estate",
    # Basic Materials
    "LIN": "Basic Materials", "APD": "Basic Materials", "SHW": "Basic Materials",
    "FCX": "Basic Materials", "NEM": "Basic Materials", "ECL": "Basic Materials",
    "DD": "Basic Materials", "NUE": "Basic Materials",
}


def fetch_info(sym: str, retries: int = 3) -> dict:
    """Return merged fast_info + ticker.info for a symbol.
    Falls back to SECTOR_FALLBACK if Yahoo Finance doesn't return sector."""
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
        result = {**cached_info, **fast}
        # Fill missing sector from fallback
        if not result.get("sector") and sym in SECTOR_FALLBACK:
            result["sector"] = SECTOR_FALLBACK[sym]
        return result

    # Layer 3: fetch full info — retry on rate limit or empty response
    for attempt in range(retries):
        try:
            info = ticker.info or {}
            if info and (info.get("longName") or info.get("shortName")):
                # Fill missing sector from fallback before caching
                if not info.get("sector") and sym in SECTOR_FALLBACK:
                    info["sector"] = SECTOR_FALLBACK[sym]
                cache.set(f"info:{sym}", info, ttl=INFO_TTL)
                return {**info, **fast}
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as e:
            msg = str(e).lower()
            if ("too many requests" in msg or "429" in msg or "rate" in msg) and attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                break

    # Even if info failed entirely, apply sector fallback to fast data
    if sym in SECTOR_FALLBACK:
        fast["sector"] = SECTOR_FALLBACK[sym]
    return fast
