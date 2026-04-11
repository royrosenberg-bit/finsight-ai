from fastapi import APIRouter, HTTPException
import yfinance as yf

router = APIRouter()


@router.get("/dcf/prefill/{symbol}")
def dcf_prefill(symbol: str):
    ticker = yf.Ticker(symbol.upper())
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
    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev_close) / prev_close * 100) if prev_close else None

    # 1-year daily history for chart
    hist = ticker.history(period="1y")
    history = [
        {"date": str(date.date()), "close": round(row["Close"], 2)}
        for date, row in hist.iterrows()
    ]

    return {
        "symbol": symbol.upper(),
        "name": info.get("longName") or info.get("shortName", symbol.upper()),
        "price": round(price, 2),
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "history": history,
    }
