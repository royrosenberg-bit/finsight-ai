from fastapi import APIRouter
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
import cache

router = APIRouter()

SCREENER_UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO",
    # Large-cap tech / software
    "AMD", "INTC", "QCOM", "TXN", "MU", "AMAT",
    "ADBE", "CRM", "ORCL", "NOW", "SNOW", "PLTR", "PANW", "CRWD", "NET",
    "TEAM", "ZM", "DDOG", "MDB",
    # Finance
    "BRK-B", "JPM", "BAC", "GS", "MS", "WFC", "C", "V", "MA", "AXP",
    "BLK", "SCHW", "COF", "USB", "PNC", "TFC",
    # Healthcare
    "UNH", "JNJ", "PFE", "ABBV", "MRK", "LLY", "BMY", "AMGN", "GILD",
    "ISRG", "VRTX", "REGN", "MRNA",
    # Consumer / retail
    "WMT", "COST", "TGT", "HD", "LOW", "NKE", "SBUX", "MCD", "YUM",
    "PG", "KO", "PEP", "PM", "CL", "EL",
    # Energy
    "XOM", "CVX", "COP", "SLB", "OXY", "PSX", "VLO",
    # Industrials / transport
    "BA", "CAT", "GE", "MMM", "HON", "RTX", "LMT", "NOC", "DE",
    "UPS", "FDX", "CSX",
    # Media / comms
    "DIS", "NFLX", "CMCSA", "T", "VZ", "CHTR",
    # Growth / high-beta
    "SHOP", "UBER", "LYFT", "RBLX", "COIN", "HOOD", "SOFI",
    # Real estate / utilities
    "AMT", "PLD", "EQIX", "NEE", "DUK",
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
    cached = cache.get("screener")
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fetch_stock, sym): sym for sym in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data and data["price"]:
                results.append(data)

    results.sort(key=lambda x: x["symbol"])
    cache.set("screener", results, ttl=900)  # cache for 15 minutes
    return results
