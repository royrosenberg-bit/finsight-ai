"""
Why Did This Move? — AI-powered move explanation engine.
Uses recent news + price data + volume + earnings + Claude to explain today's stock movement.
"""

import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
import yf_session
import anthropic
from yf_helpers import fetch_info
from dotenv import load_dotenv

load_dotenv()

def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Claude response, handling markdown and extra text."""
    import re as _re
    text = text.strip()
    try:
        return __import__('json').loads(text)
    except Exception:
        pass
    m = _re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if m:
        try:
            return __import__('json').loads(m.group(1))
        except Exception:
            pass
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end > start:
        try:
            return __import__('json').loads(text[start:end + 1])
        except Exception:
            pass
    raise ValueError("Could not extract valid JSON from AI response")

router = APIRouter()

KEYWORD_CATEGORIES = {
    "earnings":    ["earnings", "eps", "revenue", "beat", "miss", "guidance", "profit", "loss", "quarter", "q1", "q2", "q3", "q4"],
    "analyst":     ["upgrade", "downgrade", "price target", "buy rating", "sell rating", "analyst", "rating", "overweight", "underweight", "outperform"],
    "ai_tech":     ["ai", "artificial intelligence", "machine learning", "chatgpt", "llm", "gpu", "chip", "semiconductor", "data center"],
    "macro":       ["fed", "federal reserve", "interest rate", "inflation", "cpi", "recession", "gdp", "economy", "jobs", "unemployment", "treasury"],
    "product":     ["launch", "product", "release", "iphone", "update", "new model", "partnership", "deal", "contract"],
    "legal":       ["lawsuit", "regulation", "fine", "sec", "doj", "antitrust", "investigation", "settlement"],
    "acquisition": ["acquisition", "merger", "buyout", "acquire", "takeover", "deal", "bid"],
    "sector":      ["sector", "industry", "market-wide", "tech stocks", "nasdaq", "s&p", "broader market"],
}


def detect_drivers(headlines: list[str]) -> list[str]:
    found = set()
    combined = " ".join(headlines).lower()
    for category, keywords in KEYWORD_CATEGORIES.items():
        if any(kw in combined for kw in keywords):
            found.add(category)
    return list(found)


def get_stock_context(symbol: str) -> dict:
    info = fetch_info(symbol.upper())

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev_close) / prev_close * 100) if price and prev_close else None
    name = info.get("longName") or info.get("shortName") or symbol.upper()
    sector = info.get("sector", "")

    volume = info.get("regularMarketVolume") or info.get("volume")
    avg_volume = info.get("averageVolume") or info.get("averageDailyVolume10Day")
    volume_ratio = round(volume / avg_volume, 2) if (volume and avg_volume and avg_volume > 0) else None

    # Next earnings date
    next_earnings = None
    try:
        cal = ticker.calendar
        if isinstance(cal, dict):
            ed = cal.get("Earnings Date")
            if ed:
                if isinstance(ed, list) and len(ed) > 0:
                    next_earnings = str(ed[0])[:10]
                else:
                    next_earnings = str(ed)[:10]
        elif hasattr(cal, "columns"):
            # DataFrame format
            if "Earnings Date" in cal.columns:
                val = cal["Earnings Date"].iloc[0] if not cal.empty else None
                if val is not None:
                    next_earnings = str(val)[:10]
    except Exception:
        pass

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
        "volume_ratio": volume_ratio,
        "next_earnings": next_earnings,
        "headlines": headlines,
        "news_items": news_items[:5],
    }


def build_prompt(ctx: dict) -> str:
    direction = "up" if (ctx["change_pct"] or 0) >= 0 else "down"
    change_str = f"{'+' if ctx['change_pct'] >= 0 else ''}{ctx['change_pct']}%" if ctx["change_pct"] is not None else "flat"
    headlines_str = "\n".join(f"- {h}" for h in ctx["headlines"]) if ctx["headlines"] else "- No recent headlines available"

    volume_str = ""
    if ctx["volume_ratio"] is not None:
        if ctx["volume_ratio"] >= 2.0:
            volume_str = f"\nVolume: {ctx['volume_ratio']}x normal — VERY unusual volume today"
        elif ctx["volume_ratio"] >= 1.5:
            volume_str = f"\nVolume: {ctx['volume_ratio']}x normal — elevated volume"
        else:
            volume_str = f"\nVolume: {ctx['volume_ratio']}x normal"

    earnings_str = f"\nNext Earnings: {ctx['next_earnings']}" if ctx["next_earnings"] else "\nNext Earnings: Unknown"

    return f"""You are a sharp financial analyst writing for everyday investors.

Stock: {ctx['name']} ({ctx['symbol']})
Today's Move: {change_str} ({direction})
Sector: {ctx['sector'] or 'N/A'}{volume_str}{earnings_str}

Recent Headlines:
{headlines_str}

Explain why this stock moved today. Also provide forward-looking guidance.

Respond with ONLY raw JSON (no markdown, no code block):
{{
  "summary": "1-2 sentence explanation. Be specific if headlines provide a clear reason. Sound like a smart friend who follows markets — not a press release.",
  "drivers": ["specific driver under 8 words", "specific driver under 8 words", "specific driver under 8 words"],
  "what_to_watch": {{
    "key_risk": "The single biggest near-term risk in one sentence",
    "next_catalyst": "The next event or data point that could move this stock",
    "watch_note": "One actionable thing investors should monitor"
  }},
  "confidence": "High" | "Medium" | "Low",
  "confidence_reason": "One sentence. High = clear catalyst. Medium = partial signal. Low = no obvious catalyst."
}}

Rules:
- Each driver must be specific (e.g. "Earnings beat analyst estimates" not "Company news")
- what_to_watch must be forward-looking and specific to this stock
- If no clear reason exists: confidence = Low, summary = "No clear catalyst today. This move may reflect broader market sentiment or normal trading volatility."
- Never start the summary with the ticker symbol or the company name"""


@router.get("/whymove/{symbol}")
def why_did_this_move(symbol: str):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    try:
        ctx = get_stock_context(symbol)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for '{symbol}': {str(e)}")

    if ctx["price"] is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    detected = detect_drivers(ctx["headlines"])

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
            messages=[{"role": "user", "content": build_prompt(ctx)}],
        )
        text = message.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
    except json.JSONDecodeError:
        result = {
            "summary": "No single clear catalyst detected. The move may be related to broader market activity or normal volatility.",
            "drivers": ["Broader market movement", "Normal daily volatility", "No specific catalyst found"],
            "what_to_watch": {
                "key_risk": "No specific risk identified from available data",
                "next_catalyst": "Earnings date or next major company announcement",
                "watch_note": "Monitor for company-specific news or sector developments",
            },
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
        "volume_ratio": ctx["volume_ratio"],
        "next_earnings": ctx["next_earnings"],
        "summary": result.get("summary", ""),
        "drivers": result.get("drivers", []),
        "what_to_watch": result.get("what_to_watch"),
        "confidence": result.get("confidence", "Low"),
        "confidence_reason": result.get("confidence_reason", ""),
        "detected_categories": detected,
        "related_news": ctx["news_items"],
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
