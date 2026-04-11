import os
from fastapi import APIRouter, HTTPException
import yfinance as yf
import anthropic
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()


@router.get("/recommend/{symbol}")
def get_recommendation(symbol: str):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    if not info:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev_close) / prev_close * 100) if (price and prev_close) else None

    name = info.get("longName") or symbol.upper()
    pe = info.get("trailingPE")
    week_52_high = info.get("fiftyTwoWeekHigh")
    week_52_low = info.get("fiftyTwoWeekLow")
    market_cap = info.get("marketCap")

    # Grab recent headlines
    raw_news = ticker.news or []
    headlines = []
    for item in raw_news[:5]:
        content = item.get("content", {})
        title = content.get("title") or item.get("title", "")
        if title:
            headlines.append(title)

    prompt = f"""You are a financial analyst. Analyze the following stock and provide a concise recommendation.

Stock: {name} ({symbol.upper()})
Current Price: ${price}
Today's Change: {f'{change_pct:+.2f}%' if change_pct is not None else 'N/A'}
P/E Ratio: {pe if pe else 'N/A'}
52-Week High: ${week_52_high if week_52_high else 'N/A'}
52-Week Low: ${week_52_low if week_52_low else 'N/A'}
Market Cap: ${f'{market_cap:,}' if market_cap else 'N/A'}

Recent Headlines:
{chr(10).join(f'- {h}' for h in headlines) if headlines else '- No recent news available'}

Respond in JSON with exactly these fields:
{{
  "verdict": "Buy" | "Hold" | "Sell",
  "confidence": "High" | "Medium" | "Low",
  "reasoning": "2-3 sentence explanation"
}}

Important: This is for educational purposes only. Always add that investments carry risk."""

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    text = message.content[0].text.strip()
    # Extract JSON from response (Claude may wrap it in markdown)
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    try:
        result = json.loads(text.strip())
    except json.JSONDecodeError:
        result = {"verdict": "Hold", "confidence": "Low", "reasoning": text}

    return {"symbol": symbol.upper(), **result}
