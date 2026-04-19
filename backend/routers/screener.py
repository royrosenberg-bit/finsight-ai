"""
Stock Screener — expanded universe, enriched data fields, stale-while-revalidate caching,
and AI natural-language search powered by Claude.
"""
import os
import json
import re
import time
import urllib.request
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic
from dotenv import load_dotenv
import yf_session
import cache

load_dotenv()

router = APIRouter()

# ── Stock universe ────────────────────────────────────────────────────────────
# Primary: fetch current S&P 500 constituents from Wikipedia at startup.
# Fallback: hardcoded ~450-stock list used if Wikipedia is unreachable.

_FALLBACK_UNIVERSE = [
    # ── Information Technology ────────────────────────────────────────
    "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "CSCO", "ADBE", "AMD", "ACN",
    "TXN", "QCOM", "INTC", "AMAT", "KLAC", "LRCX", "MU", "NOW", "PANW", "SNPS",
    "CDNS", "FTNT", "APH", "IT", "KEYS", "ANSS", "NTAP", "GDDY", "VRSN", "CTSH",
    "GLW", "HPQ", "HPE", "STX", "MPWR", "MCHP", "SWKS", "AKAM", "ZBRA", "CDW",
    "WDC", "FFIV", "JNPR", "GEN", "ON", "MRVL", "SMCI", "FSLR", "ENPH", "TDY",

    # ── Communication Services ────────────────────────────────────────
    "GOOGL", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "CHTR",
    "PARA", "WBD", "OMC", "IPG", "EA", "TTWO", "MTCH", "NWSA", "NWS",
    "FOX", "FOXA", "LYV", "NYT",

    # ── Consumer Discretionary ────────────────────────────────────────
    "AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG",
    "CMG", "YUM", "ORLY", "AZO", "ROST", "DHI", "LEN", "PHM", "NVR",
    "ULTA", "RL", "HAS", "MAT", "MGM", "CZR", "WYNN", "LVS", "RCL",
    "CCL", "NCLH", "MAR", "HLT", "EXPE", "ABNB", "DKNG", "F", "GM",
    "APTV", "BWA", "LKQ", "KMX", "AN", "POOL", "LULU", "DRI", "EAT",
    "QSR", "DPZ", "GRMN", "BOOT",

    # ── Consumer Staples ──────────────────────────────────────────────
    "WMT", "PG", "KO", "PEP", "COST", "PM", "MO", "CL", "MDLZ", "KHC",
    "STZ", "GIS", "K", "HSY", "SJM", "CPB", "MKC", "HRL", "CHD", "CLX",
    "EL", "TSN", "CAG", "KR", "SYY", "BG", "ADM",

    # ── Healthcare ────────────────────────────────────────────────────
    "UNH", "LLY", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
    "AMGN", "ISRG", "SYK", "GILD", "MDT", "CI", "HCA", "BSX", "EW",
    "VRTX", "REGN", "ZTS", "IQV", "CVS", "HUM", "CNC", "MCK", "CAH",
    "ABC", "BIIB", "ILMN", "DXCM", "HOLX", "RMD", "BDX", "ZBH",
    "IDXX", "WAT", "A", "MRNA", "GEHC", "PODD", "ALGN", "MTD", "CRL",
    "BAX", "HSIC", "MOH", "ELV", "PFE", "VTRS",

    # ── Financials ────────────────────────────────────────────────────
    "BRK-B", "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW",
    "AXP", "V", "MA", "COF", "DFS", "SYF", "ALLY", "USB", "PNC",
    "TFC", "MTB", "CFG", "FITB", "HBAN", "KEY", "RF", "STT", "BK",
    "NTRS", "TRV", "AIG", "MET", "PRU", "AFL", "ALL", "PGR", "CB",
    "MMC", "AON", "AJG", "WTW", "HIG", "CINF", "ICE", "CME", "NDAQ",
    "CBOE", "SPGI", "MCO", "FDS", "MSCI", "RJF", "TROW", "IVZ", "BEN",
    "ACGL", "RE", "WRB", "MKL", "COIN", "PYPL", "SQ", "SOFI",

    # ── Energy ────────────────────────────────────────────────────────
    "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY",
    "DVN", "HAL", "BKR", "FANG", "HES", "APA", "MRO", "EQT", "CTRA",
    "OKE", "WMB", "KMI", "TRGP", "LNG",

    # ── Utilities ─────────────────────────────────────────────────────
    "NEE", "DUK", "SO", "D", "AES", "EXC", "XEL", "PCG", "ED", "ETR",
    "FE", "ES", "WEC", "PPL", "DTE", "LNT", "AEE", "EVRG", "NI",
    "PNW", "ATO", "NRG", "CEG", "SRE", "AWK",

    # ── Real Estate ───────────────────────────────────────────────────
    "AMT", "PLD", "EQIX", "CCI", "SPG", "O", "DLR", "WELL", "PSA",
    "EXR", "AVB", "EQR", "UDR", "CPT", "ESS", "MAA", "NNN", "VICI",
    "WPC", "BXP", "VNO", "KIM", "REG", "FRT", "HST", "SBAC", "IRM",
    "CUBE", "COLD",

    # ── Materials ─────────────────────────────────────────────────────
    "LIN", "APD", "SHW", "ECL", "PPG", "NEM", "FCX", "NUE", "STLD",
    "RS", "AA", "DOW", "DD", "LYB", "EMN", "CE", "ALB", "FMC", "MOS",
    "CF", "IFF", "RPM", "PKG", "IP", "SEE", "AVY", "CCK", "BALL",

    # ── Industrials ───────────────────────────────────────────────────
    "RTX", "HON", "GE", "UNP", "BA", "CAT", "LMT", "DE", "MMM",
    "ETN", "EMR", "PH", "ITW", "GD", "NOC", "TDG", "TXT", "HII",
    "CSX", "NSC", "UPS", "FDX", "JBHT", "WM", "RSG", "VRSK",
    "FAST", "GWW", "CARR", "OTIS", "IR", "XYL", "GNRC", "AME", "ROP",
    "IEX", "IDEX", "NDSN", "MAS", "SWK", "HUBB", "AOS", "LII", "TT",
    "JCI", "EXPD", "CHRW", "XPO", "CPRT", "CTAS", "ROK", "LDOS",
    "ODFL", "SAIA", "URI", "AXON",
]


def _fetch_sp500_universe() -> list[str]:
    """
    Pull the current S&P 500 constituents from Wikipedia.
    Returns a list of Yahoo-Finance-compatible ticker symbols, or [] on failure.
    Wikipedia table format: first <td> of each constituent row is an <a> tag
    whose text content is the ticker symbol.
    """
    try:
        url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8")

        # Extract tickers: first-column links in the constituents wikitable.
        # Pattern: <td><a href="...">TICKER</a></td>
        symbols = re.findall(
            r'<td><a\s[^>]*>([A-Z]{1,5}(?:\.[A-Z]{1,2})?)</a></td>',
            html,
        )
        # Sanity-check: S&P 500 has ~503 companies
        if len(symbols) < 400:
            return []

        # Yahoo Finance uses '-' instead of '.' (BRK.B → BRK-B)
        return list(dict.fromkeys(s.replace(".", "-") for s in symbols))
    except Exception:
        return []


# Build the universe once at module load.
# Uses Wikipedia when available (~503 stocks); falls back to ~450 curated stocks.
_sp500 = _fetch_sp500_universe()
SCREENER_UNIVERSE: list[str] = _sp500 if len(_sp500) >= 400 else _FALLBACK_UNIVERSE
_universe_source = "S&P 500 (Wikipedia)" if len(_sp500) >= 400 else "curated fallback"
print(f"[screener] Universe loaded: {len(SCREENER_UNIVERSE)} stocks from {_universe_source}")

# Deduplicate preserving order (safety net for fallback list)
SCREENER_UNIVERSE = list(dict.fromkeys(SCREENER_UNIVERSE))

CACHE_KEY = "screener"
CACHE_TTL = 7200        # 2 hours
_is_refreshing = False  # guard against concurrent background refreshes


def fetch_stock(symbol: str) -> dict | None:
    """Fetch enriched quote + fundamentals for one symbol. Returns None on any failure."""
    try:
        info = yf_session.Ticker(symbol).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            return None

        prev       = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = ((price - prev) / prev * 100) if (price and prev) else None

        hi = info.get("fiftyTwoWeekHigh")
        lo = info.get("fiftyTwoWeekLow")
        week52_pos = (
            round((price - lo) / (hi - lo) * 100, 1)
            if (hi and lo and hi != lo)
            else None
        )

        avg_vol   = info.get("averageVolume")
        vol       = info.get("volume")
        vol_ratio = (
            round(vol / avg_vol, 2)
            if (vol and avg_vol and avg_vol > 0)
            else None
        )

        div_yield    = info.get("dividendYield")
        rev_growth   = info.get("revenueGrowth")
        gross_margin = info.get("grossMargins")

        return {
            "symbol":         symbol,
            "name":           info.get("longName") or info.get("shortName", symbol),
            "price":          round(price, 2),
            "change_pct":     round(change_pct, 2) if change_pct is not None else None,
            "market_cap":     info.get("marketCap"),
            "pe_ratio":       info.get("trailingPE"),
            "forward_pe":     info.get("forwardPE"),
            "beta":           info.get("beta"),
            "dividend_yield": round(div_yield * 100, 2) if div_yield else None,
            "revenue_growth": round(rev_growth * 100, 1) if rev_growth else None,
            "gross_margin":   round(gross_margin * 100, 1) if gross_margin else None,
            "sector":         info.get("sector"),
            "industry":       info.get("industry"),
            "week_52_high":   hi,
            "week_52_low":    lo,
            "week_52_pos":    week52_pos,   # 0=at 52w low, 100=at 52w high
            "avg_volume":     avg_vol,
            "volume":         vol,
            "volume_ratio":   vol_ratio,    # vs avg; >1.5 = elevated volume
        }
    except Exception:
        return None


def _build_screener() -> list[dict]:
    """Fetch all stocks in the universe concurrently. ~5 workers to stay under rate limits."""
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_stock, sym): sym for sym in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data:
                results.append(data)
    results.sort(key=lambda x: x["symbol"])
    return results


def _refresh_in_background() -> None:
    """Rebuild screener data and store in cache. Runs in a background thread."""
    global _is_refreshing
    if _is_refreshing:
        return
    _is_refreshing = True
    try:
        results = _build_screener()
        if results:
            cache.set(CACHE_KEY, results, ttl=CACHE_TTL)
    finally:
        _is_refreshing = False


@router.get("/screener")
def get_screener(background_tasks: BackgroundTasks):
    """
    Return screener data.
    - If cache is warm: return immediately, refresh in background if stale.
    - If cache is cold: fetch synchronously (first load or after long downtime).
    """
    cached = cache.get(CACHE_KEY)
    if cached:
        # Kick off a background refresh if data is older than 90% of TTL
        entry = cache._store.get(CACHE_KEY)
        if entry:
            age = time.time() - (entry["expires"] - CACHE_TTL)
            if age > CACHE_TTL * 0.9 and not _is_refreshing:
                background_tasks.add_task(_refresh_in_background)
        return cached

    # Cold start — must wait
    results = _build_screener()
    cache.set(CACHE_KEY, results, ttl=CACHE_TTL)
    return results


@router.get("/screener/meta")
def get_screener_meta():
    """
    Return metadata about the current screener dataset:
    available sectors, stock count, and field list.
    Useful for building dynamic filter UIs.
    """
    cached = cache.get(CACHE_KEY)
    if not cached:
        return {
            "total": len(SCREENER_UNIVERSE),
            "loaded": 0,
            "sectors": [],
            "fields": [],
        }

    sectors = sorted({s["sector"] for s in cached if s.get("sector")})
    return {
        "total":   len(SCREENER_UNIVERSE),
        "loaded":  len(cached),
        "source":  _universe_source,
        "sectors": sectors,
        "fields": [
            "symbol", "name", "price", "change_pct",
            "market_cap", "pe_ratio", "forward_pe", "beta",
            "dividend_yield", "revenue_growth", "gross_margin",
            "sector", "industry",
            "week_52_high", "week_52_low", "week_52_pos",
            "volume", "avg_volume", "volume_ratio",
        ],
    }


# ── AI Natural-Language Search ────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Claude's response."""
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    raise ValueError("Could not extract valid JSON from AI response")


class AISearchRequest(BaseModel):
    query: str


@router.post("/screener/ai-search")
def ai_screener_search(req: AISearchRequest):
    """
    Natural-language stock search powered by Claude.
    Reads the screener cache, builds a compact summary, asks Claude to find
    matching stocks, and returns matches with per-stock explanations.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    stocks = cache.get(CACHE_KEY)
    if not stocks:
        raise HTTPException(
            status_code=503,
            detail="Screener data not loaded yet — visit /api/screener first, then retry.",
        )

    # Compact one-line summary per stock (~55 chars each → ~12 k tokens for 220 stocks)
    def _row(s: dict) -> str:
        pe  = s.get("forward_pe") or s.get("pe_ratio")
        cap = f"{round(s['market_cap'] / 1e9)}B" if s.get("market_cap") else "N/A"
        return (
            f"{s['symbol']}|{s.get('sector','?')[:4]}"
            f"|cap={cap}"
            f"|pe={round(pe,1) if pe else 'N/A'}"
            f"|gr={s.get('revenue_growth','N/A')}%"
            f"|div={round(s.get('dividend_yield') or 0,1)}%"
            f"|gm={s.get('gross_margin','N/A')}%"
            f"|b={s.get('beta','N/A')}"
            f"|52w={s.get('week_52_pos','N/A')}%"
            f"|chg={s.get('change_pct','N/A')}%"
        )

    universe_text = "\n".join(_row(s) for s in stocks)

    prompt = f"""You are a professional stock screener AI. The user described what they want in plain English.

User query: "{req.query}"

Stock universe (symbol|sector|cap|pe|revenueGrowth|divYield|grossMargin|beta|52wPos|dayChange):
{universe_text}

Task:
1. Interpret what the user is looking for (be specific about which metrics matter).
2. Select the 8–12 stocks from the universe that BEST match the query.
3. For each, write a 1-sentence reason citing actual numbers from the data above.
4. Suggest filter values the user could apply (null if not applicable).

Respond ONLY with raw JSON (no markdown):
{{
  "interpretation": "<1–2 sentences: what you understood the user wants>",
  "matches": [
    {{"symbol": "AAPL", "reason": "<specific reason with numbers>", "confidence": "High|Medium|Low"}},
    ...
  ],
  "suggested_filters": {{
    "sector": "<exact sector name or null>",
    "minRevGrowth": <number or null>,
    "maxPE": <number or null>,
    "minDivYield": <number or null>,
    "minWeek52Pos": <number or null>,
    "maxWeek52Pos": <number or null>,
    "minCap": <number in $B or null>
  }}
}}"""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1400,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _extract_json(msg.content[0].text.strip())

        # Enrich each match with its full stock data from cache
        stock_map = {s["symbol"]: s for s in stocks}
        for m in result.get("matches", []):
            m["stock"] = stock_map.get(m["symbol"])

        return result
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI search failed: {e}")
