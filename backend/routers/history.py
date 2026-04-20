from fastapi import APIRouter, HTTPException
import yfinance as yf
import yf_session

router = APIRouter()

PERIOD_CONFIG = {
    "1d":  {"period": "1d",  "interval": "5m"},
    "5d":  {"period": "5d",  "interval": "15m"},
    "1w":  {"period": "7d",  "interval": "30m"},
    "1m":  {"period": "1mo", "interval": "1d"},
    "3m":  {"period": "3mo", "interval": "1d"},
    "6m":  {"period": "6mo", "interval": "1d"},
    "1y":  {"period": "1y",  "interval": "1d"},
}


@router.get("/history/{symbol}")
def get_history(symbol: str, period: str = "3m"):
    config = PERIOD_CONFIG.get(period.lower())
    if not config:
        raise HTTPException(status_code=400, detail=f"Invalid period '{period}'. Use: {', '.join(PERIOD_CONFIG.keys())}")

    ticker = yf_session.Ticker(symbol.upper())
    hist = ticker.history(period=config["period"], interval=config["interval"])

    if hist.empty:
        raise HTTPException(status_code=404, detail=f"No history found for '{symbol}'")

    history = []
    for date, row in hist.iterrows():
        # For intraday, show time; for daily, show date
        if config["interval"] in ("5m", "15m", "30m"):
            label = date.strftime("%m/%d %H:%M")
        else:
            label = str(date.date())
        history.append({"date": label, "close": round(row["Close"], 2)})

    # For 1D, include previous close so the chart can show change-from-yesterday
    # instead of change-from-open (which is misleading when there's a gap).
    previous_close = None
    if period.lower() == "1d":
        try:
            daily = ticker.history(period="5d", interval="1d")
            if len(daily) >= 2:
                previous_close = round(float(daily["Close"].iloc[-2]), 2)
        except Exception:
            pass

    return {
        "symbol":         symbol.upper(),
        "period":         period,
        "history":        history,
        "previous_close": previous_close,
    }
