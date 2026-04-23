"""
Multi-Agent AI Debate — 4 AI analysts debate a stock from distinct perspectives.
Agents: Hedge Fund Analyst, Sell-Side Analyst, Growth Investor, News Analyst
"""

import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
import yf_session
import anthropic
from yf_helpers import fetch_info
from dotenv import load_dotenv
import cache

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


def get_debate_context(symbol: str) -> dict:
    sym = symbol.upper()
    info = fetch_info(sym)
    ticker = yf_session.Ticker(sym)

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = round((price - prev) / prev * 100, 2) if price and prev else None
    name = info.get("longName") or info.get("shortName", symbol.upper())

    # Fundamentals
    pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    peg = info.get("pegRatio")
    ps_ratio = info.get("priceToSalesTrailing12Months")
    market_cap = info.get("marketCap")
    rev_growth = info.get("revenueGrowth")
    earnings_growth = info.get("earningsGrowth")
    gross_margin = info.get("grossMargins")
    profit_margin = info.get("profitMargins")
    debt_equity = info.get("debtToEquity")
    roe = info.get("returnOnEquity")
    week_52_high = info.get("fiftyTwoWeekHigh")
    week_52_low = info.get("fiftyTwoWeekLow")
    analyst_target = info.get("targetMeanPrice")
    analyst_rec = info.get("recommendationKey", "").replace("_", " ").title()
    short_ratio = info.get("shortRatio")
    sector = info.get("sector", "")

    # 52-week range position
    price_range_pct = None
    if price and week_52_low and week_52_high and week_52_high != week_52_low:
        price_range_pct = round((price - week_52_low) / (week_52_high - week_52_low) * 100, 1)

    # Recent headlines
    raw_news = ticker.news or []
    headlines = []
    for item in raw_news[:6]:
        content = item.get("content", {})
        title = content.get("title") or item.get("title", "")
        if title:
            headlines.append(title)

    return {
        "symbol": symbol.upper(),
        "name": name,
        "price": round(price, 2) if price else None,
        "change_pct": change_pct,
        "sector": sector,
        "pe": round(pe, 1) if pe else None,
        "forward_pe": round(forward_pe, 1) if forward_pe else None,
        "peg": round(peg, 2) if peg else None,
        "ps_ratio": round(ps_ratio, 2) if ps_ratio else None,
        "market_cap_b": round(market_cap / 1e9, 1) if market_cap else None,
        "rev_growth_pct": round(rev_growth * 100, 1) if rev_growth else None,
        "earnings_growth_pct": round(earnings_growth * 100, 1) if earnings_growth else None,
        "gross_margin_pct": round(gross_margin * 100, 1) if gross_margin else None,
        "profit_margin_pct": round(profit_margin * 100, 1) if profit_margin else None,
        "debt_equity": round(debt_equity, 2) if debt_equity else None,
        "roe_pct": round(roe * 100, 1) if roe else None,
        "week_52_high": round(week_52_high, 2) if week_52_high else None,
        "week_52_low": round(week_52_low, 2) if week_52_low else None,
        "price_range_pct": price_range_pct,
        "analyst_target": round(analyst_target, 2) if analyst_target else None,
        "analyst_rec": analyst_rec,
        "short_ratio": round(short_ratio, 1) if short_ratio else None,
        "headlines": headlines,
    }


def build_debate_prompt(ctx: dict) -> str:
    def fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "N/A"

    upside = None
    if ctx["price"] and ctx["analyst_target"]:
        upside = round((ctx["analyst_target"] - ctx["price"]) / ctx["price"] * 100, 1)

    headlines_str = "\n".join(f"  - {h}" for h in ctx["headlines"]) if ctx["headlines"] else "  - No recent headlines"

    return f"""You are a debate moderator. Generate a structured debate among 4 financial analysts evaluating {ctx['symbol']}.

Company: {ctx['name']} ({ctx['symbol']}) — {ctx['sector']}
Price: ${fmt(ctx['price'])} ({'+' if (ctx['change_pct'] or 0) >= 0 else ''}{fmt(ctx['change_pct'])}% today)
Market Cap: ${fmt(ctx['market_cap_b'])}B

Valuation:
  P/E (trailing): {fmt(ctx['pe'])} | Forward P/E: {fmt(ctx['forward_pe'])} | PEG: {fmt(ctx['peg'])} | P/S: {fmt(ctx['ps_ratio'])}

Growth & Profitability:
  Revenue Growth (YoY): {fmt(ctx['rev_growth_pct'])}% | Earnings Growth: {fmt(ctx['earnings_growth_pct'])}%
  Gross Margin: {fmt(ctx['gross_margin_pct'])}% | Net Margin: {fmt(ctx['profit_margin_pct'])}% | ROE: {fmt(ctx['roe_pct'])}%

Balance Sheet:
  Debt/Equity: {fmt(ctx['debt_equity'])} | Short Ratio: {fmt(ctx['short_ratio'])} days

Technical:
  52-week range: ${fmt(ctx['week_52_low'])} – ${fmt(ctx['week_52_high'])}
  Current price position: {fmt(ctx['price_range_pct'])}% of 52-week range

Analyst Consensus: {fmt(ctx['analyst_rec'])} | Mean Target: ${fmt(ctx['analyst_target'])}{f' ({upside:+.1f}% upside)' if upside is not None else ''}

Recent Headlines:
{headlines_str}

Generate a structured debate where each analyst evaluates the stock from their unique lens. Make each perspective genuinely distinct and specific to the data above — not generic. Use actual numbers.

Respond with ONLY raw JSON (no markdown, no code block):
{{
  "agents": [
    {{
      "name": "Hedge Fund Analyst",
      "icon": "🐻",
      "role": "Risk-focused, skeptical",
      "stance": "Bullish" | "Neutral" | "Bearish",
      "reasoning": "2-3 sentences. Focused on downside risk, valuation vs intrinsic value, what could go wrong. Use specific numbers.",
      "confidence": "High" | "Medium" | "Low",
      "key_point": "One-line summary of their core argument"
    }},
    {{
      "name": "Sell-Side Analyst",
      "icon": "📊",
      "role": "Fundamentals-focused, balanced",
      "stance": "Bullish" | "Neutral" | "Bearish",
      "reasoning": "2-3 sentences. Focused on earnings estimates, revenue trajectory, competitive position. Use specific numbers.",
      "confidence": "High" | "Medium" | "Low",
      "key_point": "One-line summary of their core argument"
    }},
    {{
      "name": "Growth Investor",
      "icon": "🚀",
      "role": "Narrative and momentum-oriented",
      "stance": "Bullish" | "Neutral" | "Bearish",
      "reasoning": "2-3 sentences. Focused on the long-term story, TAM, competitive moat, momentum. Use specific numbers.",
      "confidence": "High" | "Medium" | "Low",
      "key_point": "One-line summary of their core argument"
    }},
    {{
      "name": "News Analyst",
      "icon": "📰",
      "role": "News/sentiment-driven",
      "stance": "Bullish" | "Neutral" | "Bearish",
      "reasoning": "2-3 sentences. Focused on recent catalysts, sentiment shifts, near-term events from the headlines.",
      "confidence": "High" | "Medium" | "Low",
      "key_point": "One-line summary of their core argument"
    }}
  ],
  "verdict": "Buy" | "Hold" | "Sell",
  "vote_breakdown": {{"Bullish": 0, "Neutral": 0, "Bearish": 0}},
  "disagreement": "2 sentences explaining the core tension between the most opposing analysts. Be specific.",
  "consensus_note": "1 sentence on what all analysts agree on, if anything"
}}"""


@router.get("/debate/{symbol}")
def ai_debate(symbol: str):
    sym = symbol.upper()
    cached = cache.get(f"debate:{sym}")
    if cached:
        return cached

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    try:
        ctx = get_debate_context(sym)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for '{sym}': {str(e)}")

    if ctx["price"] is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{sym}' not found")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1400,
            messages=[{"role": "user", "content": build_debate_prompt(ctx)}],
        )
        text = message.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned malformed JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI debate failed: {str(e)}")

    response = {
        "symbol": sym,
        "name": ctx["name"],
        "price": ctx["price"],
        "change_pct": ctx["change_pct"],
        "agents": result.get("agents", []),
        "verdict": result.get("verdict", "Hold"),
        "vote_breakdown": result.get("vote_breakdown", {}),
        "disagreement": result.get("disagreement", ""),
        "consensus_note": result.get("consensus_note", ""),
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    cache.set(f"debate:{sym}", response, ttl=600)  # cache for 10 minutes
    return response
