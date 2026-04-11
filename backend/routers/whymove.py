"""
Why Did This Move? — AI-powered move explanation engine.
Uses recent news + price data + Claude to explain today's stock movement.
"""

import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
import yfinance as yf
import anthropic
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

# Keywords used to classify the type of driver
KEYWORD_CATEGORIES = {
    "earnings":      ["earnings", "eps", "revenue", "beat", "miss", "guidance", "profit", "loss", "quarter", "q1", "q2", "q3", "q4"],
    "analyst":       ["upgrade", "downgrade", "price target", "buy rating", "sell rating", "analyst", "rating", "overweight", "underweight", "outperform"],
    "ai_tech":       ["ai", "artificial intelligence", "machine learning", "chatgpt", "llm", "gpu", "chip", "semiconductor", "data center"],
    "macro":         ["fed", "federal reserve", "interest rate", "inflation", "cpi", "recession", "gdp", "economy", "jobs", "unemployment", "treasury"],
    "product":       ["launch", "product", "release", "iphone", "update", "new model", "partnership", "deal", "contract"],
    "legal":         ["lawsuit", "regulation", "fine", "sec", "doj", "antitrust", "investigation", "settlement"],
    "acquisition":   ["acquisition", "merger", "buyout", "acquire", "takeover", "deal", "bid"],
    "sector":        ["sector", "industry", "market-wide", "tech stocks", "nasdaq", "s&p", "broader market"],
}


def detect_drivers(headlines: list[str]) -> list[str]:
    """Detect likely driver categories from headlines."""
    found = set()
    combined = " ".join(headlines).lower()
    for category, keywords in KEYWORD_CATEGORIES.items():
        if any(kw in combined for kw in keywords):
            found.add(category)
    return list(found)


def get_stock_context(symbol: str) -> dict:
    """Fetch price change and recent news for the symbol."""
    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev_close) / prev_close * 100) if price and prev_close else None
    name = info.get("longName") or info.get("shortName", symbol.upper())
    sector = info.get("sector", "")

    # Collect recent headlines
    raw_news = ticker.news or []
    headlines = []
    news_items = []
    for item in raw_news[:10]:
        content = item.get("content", {})
        title = content.get("title") or item.get("title", "")
        url = content.get("canonicalUrl", {}).get("url") or item.get("link", "")
        publisher = content.get("provider", {}).get("displayName") or item.get("publisher", "")
        if title:
            headlines.append(title)
            news_items.append({"title": title, "url": url, "publisher": publisher})

    return {
        "symbol": symbol.upper(),
        "name": name,
        "price": round(price, 2) if price else None,
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "sector": sector,
        "headlines": headlines,
        "news_items": news_items[:5],
    }


def build_prompt(ctx: dict) -> str:
    direction = "up" if (ctx["change_pct"] or 0) >= 0 else "down"
    change_str = f"{'+' if ctx['change_pct'] >= 0 else ''}{ctx['change_pct']}%" if ctx["change_pct"] is not None else "flat"
    headlines_str = "\n".join(f"- {h}" for h in ctx["headlines"]) if ctx["headlines"] else "- No recent headlines available"

    return f"""You are a sharp financial analyst writing a brief, natural-sounding explanation for everyday investors — not for Wall Street professionals.

Stock: {ctx['name']} ({ctx['symbol']})
Today's Move: {change_str} ({direction})
Sector: {ctx['sector'] or 'N/A'}

Recent Headlines:
{headlines_str}

Your job: explain why this stock moved today in 1-2 clear, confident sentences. Sound like a smart friend who follows markets — not a press release.

Respond with ONLY raw JSON (no markdown, no code block):
{{
  "summary": "1-2 sentence explanation. Be specific if the headlines provide a clear reason. Avoid generic filler phrases like 'investors are reacting' — say what actually happened.",
  "drivers": ["short specific driver", "short specific driver", "short specific driver"],
  "confidence": "High" | "Medium" | "Low",
  "confidence_reason": "One sentence. High = clear catalyst in news. Medium = partial signal. Low = no obvious catalyst."
}}

Rules:
- Each driver must be under 8 words and specific (e.g. "Earnings beat analyst estimates" not "Company news")
- If no clear reason exists: confidence = Low, summary = "No clear catalyst today. This move may reflect broader market sentiment or normal trading volatility."
- Never start the summary with the ticker symbol or the company name
- Write the summary as if explaining to a smart friend over text"""


@router.get("/whymove/{symbol}")
def why_did_this_move(symbol: str):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    # 1. Fetch stock context
    try:
        ctx = get_stock_context(symbol)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for '{symbol}': {str(e)}")

    if ctx["price"] is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    # 2. Detect keyword drivers for context
    detected = detect_drivers(ctx["headlines"])

    # 3. Call Claude
    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            messages=[{"role": "user", "content": build_prompt(ctx)}],
        )
        text = message.content[0].text.strip()

        # Strip markdown if Claude wrapped it
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        result = json.loads(text.strip())
    except json.JSONDecodeError:
        result = {
            "summary": "No single clear catalyst detected. The move may be related to broader market activity or normal volatility.",
            "drivers": ["Broader market movement", "Normal daily volatility", "No specific catalyst found"],
            "confidence": "Low",
            "confidence_reason": "Could not parse AI response.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    return {
        "symbol": ctx["symbol"],
        "name": ctx["name"],
        "price": ctx["price"],
        "change_pct": ctx["change_pct"],
        "summary": result.get("summary", ""),
        "drivers": result.get("drivers", []),
        "confidence": result.get("confidence", "Low"),
        "confidence_reason": result.get("confidence_reason", ""),
        "detected_categories": detected,
        "related_news": ctx["news_items"],
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
