"""
Stock Screener — curated 80-stock universe, stable and rate-limit safe.
Uses the shared fetch_info cache so screener loads don't interfere with
the rest of the app (Analyze, Portfolio, DCF).
"""
import os
import json
import re
import time
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic
from dotenv import load_dotenv
import cache
from yf_helpers import fetch_info, SECTOR_FALLBACK

load_dotenv()
router = APIRouter()

# ── Curated 80-stock universe ─────────────────────────────────────────────────
# Hand-picked across all sectors — enough to make filters meaningful,
# small enough to never cause rate limit problems.
SCREENER_UNIVERSE = [
    # Technology (16)
    "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO", "AMD", "ORCL",
    "ADBE", "CRM", "INTC", "QCOM", "NOW", "INTU", "AMAT", "MU",
    # Communication Services (6)
    "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS",
    # Consumer Cyclical (8)
    "AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "BKNG",
    # Consumer Defensive (7)
    "WMT", "PG", "KO", "PEP", "COST", "PM", "MO",
    # Healthcare (12)
    "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT",
    "AMGN", "ISRG", "GILD", "VRTX", "REGN",
    # Financials (11)
    "JPM", "BAC", "WFC", "GS", "MS", "BLK", "AXP", "V", "MA", "C", "SCHW",
    # Industrials (8)
    "CAT", "HON", "UPS", "BA", "GE", "RTX", "LMT", "DE",
    # Energy (8)
    "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "MPC", "PSX",
    # Utilities (3)
    "NEE", "DUK", "SO",
    # Basic Materials (4)
    "LIN", "SHW", "FCX", "NEM",
]

CACHE_KEY = "screener"
CACHE_TTL = 7200        # 2 hours
_is_refreshing = False


def fetch_stock(symbol: str) -> dict | None:
    """Fetch enriched quote for one symbol using the shared info cache."""
    try:
        info = fetch_info(symbol)
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            return None

        prev       = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = ((price - prev) / prev * 100) if (price and prev) else None

        hi = info.get("fiftyTwoWeekHigh")
        lo = info.get("fiftyTwoWeekLow")
        week52_pos = (
            round((price - lo) / (hi - lo) * 100, 1)
            if (hi and lo and hi != lo) else None
        )

        avg_vol   = info.get("averageVolume")
        vol       = info.get("volume")
        vol_ratio = round(vol / avg_vol, 2) if (vol and avg_vol and avg_vol > 0) else None

        div_yield    = info.get("dividendYield")
        rev_growth   = info.get("revenueGrowth")
        gross_margin = info.get("grossMargins")

        sector = info.get("sector") or SECTOR_FALLBACK.get(symbol)

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
            "sector":         sector,
            "industry":       info.get("industry"),
            "week_52_high":   hi,
            "week_52_low":    lo,
            "week_52_pos":    week52_pos,
            "avg_volume":     avg_vol,
            "volume":         vol,
            "volume_ratio":   vol_ratio,
        }
    except Exception:
        return None


def _build_screener() -> list[dict]:
    """Fetch all 80 stocks with 3 workers — well within Yahoo Finance limits."""
    results = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fetch_stock, sym): sym for sym in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data:
                results.append(data)
    results.sort(key=lambda x: x["symbol"])
    return results


def _refresh_in_background() -> None:
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
    cached = cache.get(CACHE_KEY)
    if cached:
        entry = cache._store.get(CACHE_KEY)
        if entry:
            age = time.time() - (entry["expires"] - CACHE_TTL)
            if age > CACHE_TTL * 0.9 and not _is_refreshing:
                background_tasks.add_task(_refresh_in_background)
        return cached

    results = _build_screener()
    cache.set(CACHE_KEY, results, ttl=CACHE_TTL)
    return results


@router.get("/screener/meta")
def get_screener_meta():
    cached = cache.get(CACHE_KEY)
    if not cached:
        return {"total": len(SCREENER_UNIVERSE), "loaded": 0, "sectors": [], "fields": []}

    sectors = sorted({s["sector"] for s in cached if s.get("sector")})
    return {
        "total":   len(SCREENER_UNIVERSE),
        "loaded":  len(cached),
        "source":  "curated universe",
        "sectors": sectors,
        "fields":  [
            "symbol", "name", "price", "change_pct",
            "market_cap", "pe_ratio", "forward_pe", "beta",
            "dividend_yield", "revenue_growth", "gross_margin",
            "sector", "industry", "week_52_high", "week_52_low",
            "week_52_pos", "volume", "avg_volume", "volume_ratio",
        ],
    }


# ── AI Natural-Language Search ────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
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
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    stocks = cache.get(CACHE_KEY)
    if not stocks:
        raise HTTPException(status_code=503, detail="Screener data not loaded yet — open the Screener page first, then retry.")

    def _row(s: dict) -> str:
        pe  = s.get("forward_pe") or s.get("pe_ratio")
        cap = s.get("market_cap") or 0
        cap_str = f"{cap/1e12:.1f}T" if cap >= 1e12 else f"{cap/1e9:.0f}B"
        return (
            f"{s['symbol']} {(s.get('sector') or '?')[:3]}"
            f" {cap_str}"
            f" pe{round(pe) if pe else '-'}"
            f" g{round(s['revenue_growth']) if s.get('revenue_growth') is not None else '-'}%"
            f" d{round(s.get('dividend_yield') or 0,1)}%"
            f" m{round(s['gross_margin']) if s.get('gross_margin') is not None else '-'}%"
            f" 52:{round(s['week_52_pos']) if s.get('week_52_pos') is not None else '-'}"
        )

    universe_text = "\n".join(_row(s) for s in stocks)

    prompt = f"""You are a professional stock screener AI. The user described what they want in plain English.

User query: "{req.query}"

Stock universe (symbol|sector|cap|pe|revenueGrowth|divYield|grossMargin|52wPos):
{universe_text}

Select 6–10 stocks that best match. Respond ONLY with raw JSON:
{{
  "interpretation": "<1-2 sentences: what you understood>",
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
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _extract_json(msg.content[0].text.strip())
        stock_map = {s["symbol"]: s for s in stocks}
        for m in result.get("matches", []):
            m["stock"] = stock_map.get(m["symbol"])
        return result
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI search failed: {e}")
