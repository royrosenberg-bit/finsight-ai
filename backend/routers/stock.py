from fastapi import APIRouter, HTTPException
import yfinance as yf
import yf_session
import cache
import time

router = APIRouter()


def _fetch_info(sym: str, retries: int = 3) -> dict:
    """Fetch stock data using fast_info (reliable) + info (for name/sector/PE)."""
    ticker = yf_session.Ticker(sym)

    # fast_info hits a lighter endpoint — use it as the primary price source
    result = {}
    try:
        fi = ticker.fast_info
        price = fi.last_price
        prev = getattr(fi, "previous_close", None) or getattr(fi, "regular_market_previous_close", None)
        if price:
            result["currentPrice"] = float(price)
        if prev:
            result["previousClose"] = float(prev)
        mc = getattr(fi, "market_cap", None)
        if mc:
            result["marketCap"] = int(mc)
        yh = getattr(fi, "year_high", None)
        yl = getattr(fi, "year_low", None)
        if yh:
            result["fiftyTwoWeekHigh"] = float(yh)
        if yl:
            result["fiftyTwoWeekLow"] = float(yl)
    except Exception:
        pass

    # Try full info for name, sector, industry, PE — but don't fail if it's unavailable
    for attempt in range(retries):
        try:
            info = ticker.info or {}
            if info and (info.get("longName") or info.get("shortName")):
                # Merge: fast_info prices take priority, info fills in the rest
                merged = {**info, **result}
                return merged
        except Exception as e:
            msg = str(e).lower()
            if "too many requests" in msg or "429" in msg or "rate" in msg:
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                    continue
        break

    return result


@router.get("/dcf/prefill/{symbol}")
def dcf_prefill(symbol: str):
    ticker = yf_session.Ticker(symbol.upper())
    info = ticker.info

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if not price:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    name = info.get("longName") or info.get("shortName", symbol.upper())

    revenue_raw = info.get("totalRevenue")
    revenue_b = round(revenue_raw / 1e9, 2) if revenue_raw else None

    op_margin = info.get("operatingMargins")
    op_margin_pct = round(op_margin * 100, 1) if op_margin else None

    shares_raw = info.get("sharesOutstanding")
    shares_b = round(shares_raw / 1e9, 3) if shares_raw else None

    total_debt = info.get("totalDebt") or 0
    total_cash = info.get("totalCash") or 0
    net_debt_b = round((total_debt - total_cash) / 1e9, 1)

    return {
        "symbol": symbol.upper(),
        "name": name,
        "price": round(price, 2),
        "revenue": revenue_b,
        "operating_margin": op_margin_pct,
        "tax_rate": 21,
        "shares_out": shares_b,
        "net_debt": net_debt_b,
    }


@router.get("/stock/{symbol}")
def get_stock(symbol: str):
    sym = symbol.upper()
    cached = cache.get(f"stock:{sym}")
    if cached:
        return cached
    try:
        info = _fetch_info(sym)

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close and price else None

        # 1-year daily history for chart
        try:
            hist = yf_session.Ticker(sym).history(period="1y")
            history = [
                {"date": str(date.date()), "close": round(row["Close"], 2)}
                for date, row in hist.iterrows()
            ]
        except Exception:
            history = []

        result = {
            "symbol": sym,
            "name": info.get("longName") or info.get("shortName", sym),
            "price": round(price, 2),
            "change_pct": change_pct,
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "week_52_high": info.get("fiftyTwoWeekHigh"),
            "week_52_low": info.get("fiftyTwoWeekLow"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "history": history,
        }
        cache.set(f"stock:{sym}", result, ttl=1800)  # 30 min
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch {sym}: {str(e)}")
