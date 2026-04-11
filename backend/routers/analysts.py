from fastapi import APIRouter, HTTPException
import yfinance as yf

router = APIRouter()


@router.get("/analysts/{symbol}")
def get_analysts(symbol: str):
    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    if not info:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    recommendations = info.get("recommendationKey", "").replace("_", " ").title()
    target_price = info.get("targetMeanPrice")

    # Analyst counts
    strong_buy = info.get("numberOfAnalystOpinions")  # fallback

    return {
        "symbol": symbol.upper(),
        "recommendation": recommendations or None,
        "target_price": round(target_price, 2) if target_price else None,
        "strong_buy": info.get("recommendationKey") and None,  # detailed breakdown not in basic info
        "buy": None,
        "hold": None,
        "sell": None,
        "strong_sell": None,
        "num_analysts": info.get("numberOfAnalystOpinions"),
    }
