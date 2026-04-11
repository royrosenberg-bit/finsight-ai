from fastapi import APIRouter
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed

router = APIRouter()

SCREENER_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "XOM", "JNJ", "WMT", "MA", "PG", "HD", "CVX",
    "MRK", "ABBV", "BAC", "KO", "PEP", "AVGO", "COST", "ADBE", "NFLX",
    "AMD", "CRM", "ORCL", "INTC", "DIS", "NKE", "PYPL", "UBER", "SHOP",
]


def fetch_stock(symbol):
    try:
        info = yf.Ticker(symbol).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = ((price - prev) / prev * 100) if price and prev else None
        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName", symbol),
            "price": round(price, 2) if price else None,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "week_52_high": info.get("fiftyTwoWeekHigh"),
            "week_52_low": info.get("fiftyTwoWeekLow"),
        }
    except Exception:
        return None


@router.get("/screener")
def get_screener():
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_stock, sym): sym for sym in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data and data["price"]:
                results.append(data)
    results.sort(key=lambda x: x["symbol"])
    return results
