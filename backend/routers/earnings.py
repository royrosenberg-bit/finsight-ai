from fastapi import APIRouter
import yfinance as yf
from datetime import datetime, timezone

router = APIRouter()

POPULAR = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "NFLX", "AMD"]


def get_earnings_date(symbol):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        name = info.get("longName") or info.get("shortName", symbol)

        # Try calendar first
        cal = ticker.calendar
        date_str = None

        if cal is not None and not cal.empty:
            if "Earnings Date" in cal.index:
                val = cal.loc["Earnings Date"]
                if hasattr(val, '__iter__'):
                    val = list(val)[0]
                if val:
                    date_str = str(val)[:10]

        # Fallback to earningsTimestamp in info
        if not date_str:
            ts = info.get("earningsTimestamp") or info.get("earningsTimestampStart")
            if ts:
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")

        if not date_str:
            return None

        # Days until earnings
        today = datetime.now(tz=timezone.utc).date()
        earnings_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        days_until = (earnings_date - today).days

        return {
            "symbol": symbol,
            "name": name,
            "earnings_date": date_str,
            "days_until": days_until,
        }
    except Exception:
        return None


@router.get("/earnings")
def get_earnings(symbols: str = ""):
    # Accept comma-separated symbols, fallback to popular list
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else POPULAR
    # Merge with popular list, deduplicate
    all_syms = list(dict.fromkeys(sym_list + POPULAR))[:20]

    results = []
    for sym in all_syms:
        data = get_earnings_date(sym)
        if data:
            results.append(data)

    # Sort by days until earnings
    results.sort(key=lambda x: x["days_until"] if x["days_until"] >= 0 else 9999)
    return results
