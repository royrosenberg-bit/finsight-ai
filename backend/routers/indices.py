from fastapi import APIRouter
import yfinance as yf
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
            ticker = yf.Ticker(symbol)
            info = ticker.info
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
            change_pct = ((price - prev) / prev * 100) if (price and prev) else None
            result.append({
                "name": name,
                "symbol": symbol,
                "price": round(price, 2) if price else None,
                "change_pct": round(change_pct, 2) if change_pct is not None else None,
            })
        except Exception:
            result.append({"name": name, "symbol": symbol, "price": None, "change_pct": None})
    cache.set("indices", result, ttl=300)
    return result
