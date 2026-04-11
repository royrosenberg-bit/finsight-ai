from fastapi import APIRouter
import yfinance as yf

router = APIRouter()


@router.get("/search")
def search_stocks(q: str = ""):
    if not q or len(q) < 1:
        return []
    try:
        results = yf.Search(q, max_results=8)
        quotes = results.quotes
        suggestions = []
        for item in quotes:
            symbol = item.get("symbol", "")
            name = item.get("longname") or item.get("shortname", "")
            type_ = item.get("quoteType", "")
            exchange = item.get("exchange", "")
            if symbol and type_ in ("EQUITY", "ETF"):
                suggestions.append({
                    "symbol": symbol,
                    "name": name,
                    "type": type_,
                    "exchange": exchange,
                })
        return suggestions
    except Exception:
        return []
