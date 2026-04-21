from fastapi import APIRouter
import yfinance as yf
import yf_session
import cache

router = APIRouter()

INDICES = {
    "S&P 500": "^GSPC",
    "NASDAQ":  "^IXIC",
    "DOW":     "^DJI",
}


@router.get("/indices")
def get_indices():
    cached = cache.get("indices")
    if cached:
        return cached
    result = []
    for name, symbol in INDICES.items():
        try:
            ticker = yf_session.Ticker(symbol)
            # fast_info is more reliable than .info for index symbols
            fi = ticker.fast_info
            price = fi.last_price
            prev = getattr(fi, "previous_close", None) or getattr(fi, "regular_market_previous_close", None)
            change_pct = round((price - prev) / prev * 100, 2) if (price and prev) else None
            result.append({
                "name": name,
                "symbol": symbol,
                "price": round(float(price), 2) if price else None,
                "change_pct": change_pct,
            })
        except Exception:
            result.append({"name": name, "symbol": symbol, "price": None, "change_pct": None})
    cache.set("indices", result, ttl=1800)  # 30 min
    return result
