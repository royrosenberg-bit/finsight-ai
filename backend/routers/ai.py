"""
AI Stock Analysis — comprehensive fundamental + sentiment analysis via Claude.
Returns structured verdict with bull/bear case, price target, and key risks.
"""

import os
import json
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


def _fmt(v, suffix="", scale=1, digits=1):
    if v is None:
        return "N/A"
    return f"{round(v * scale, digits)}{suffix}"


def _fmt_large(v):
    if v is None:
        return "N/A"
    if v >= 1e12:
        return f"${v/1e12:.2f}T"
    if v >= 1e9:
        return f"${v/1e9:.1f}B"
    if v >= 1e6:
        return f"${v/1e6:.0f}M"
    return f"${v:,.0f}"


@router.get("/recommend/{symbol}")
def get_recommendation(symbol: str):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    sym = symbol.upper()
    info = fetch_info(sym)

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if not price:
        raise HTTPException(status_code=404, detail=f"Symbol '{sym}' not found")

    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev_close) / prev_close * 100) if (price and prev_close) else None

    # ── Fundamentals ───────────────────────────────────────────────────────
    name          = info.get("longName") or sym
    sector        = info.get("sector", "N/A")
    industry      = info.get("industry", "N/A")
    market_cap    = info.get("marketCap")
    pe            = info.get("trailingPE")
    fwd_pe        = info.get("forwardPE")
    peg           = info.get("pegRatio")
    ps            = info.get("priceToSalesTrailing12Months")
    pb            = info.get("priceToBook")
    ev_ebitda     = info.get("enterpriseToEbitda")
    week_52_high  = info.get("fiftyTwoWeekHigh")
    week_52_low   = info.get("fiftyTwoWeekLow")
    beta          = info.get("beta")

    # Growth & margins
    revenue_growth = info.get("revenueGrowth")
    earnings_growth= info.get("earningsGrowth")
    gross_margin   = info.get("grossMargins")
    op_margin      = info.get("operatingMargins")
    profit_margin  = info.get("profitMargins")
    roe            = info.get("returnOnEquity")
    roa            = info.get("returnOnAssets")
    de_ratio       = info.get("debtToEquity")
    current_ratio  = info.get("currentRatio")

    # Analyst consensus
    target_mean    = info.get("targetMeanPrice")
    target_high    = info.get("targetHighPrice")
    target_low     = info.get("targetLowPrice")
    rec_mean       = info.get("recommendationMean")   # 1=Strong Buy … 5=Sell
    analyst_count  = info.get("numberOfAnalystOpinions")

    upside_to_target = ((target_mean - price) / price * 100) if target_mean and price else None

    # Short interest
    short_float    = info.get("shortPercentOfFloat")
    short_ratio    = info.get("shortRatio")

    # Recent headlines
    raw_news  = ticker.news or []
    headlines = []
    for item in raw_news[:6]:
        content = item.get("content", {})
        title   = content.get("title") or item.get("title", "")
        if title:
            headlines.append(title)

    # ── Prompt ─────────────────────────────────────────────────────────────
    prompt = f"""You are a senior equity analyst at a top-tier investment bank. Provide a rigorous, data-driven investment analysis for {name} ({sym}).

MARKET DATA:
- Price: ${price:.2f} | Today: {_fmt(change_pct, '%', digits=2) if change_pct else 'N/A'}
- 52-Week Range: ${week_52_low} – ${week_52_high}
- Market Cap: {_fmt_large(market_cap)} | Beta: {_fmt(beta, digits=2)}
- Sector: {sector} | Industry: {industry}

VALUATION MULTIPLES:
- Trailing P/E: {_fmt(pe, 'x')} | Forward P/E: {_fmt(fwd_pe, 'x')} | PEG: {_fmt(peg, 'x')}
- P/S: {_fmt(ps, 'x')} | P/B: {_fmt(pb, 'x')} | EV/EBITDA: {_fmt(ev_ebitda, 'x')}

GROWTH & PROFITABILITY:
- Revenue Growth (YoY): {_fmt(revenue_growth, '%', scale=100)}
- Earnings Growth (YoY): {_fmt(earnings_growth, '%', scale=100)}
- Gross Margin: {_fmt(gross_margin, '%', scale=100)} | Op Margin: {_fmt(op_margin, '%', scale=100)} | Net Margin: {_fmt(profit_margin, '%', scale=100)}
- ROE: {_fmt(roe, '%', scale=100)} | ROA: {_fmt(roa, '%', scale=100)}
- Debt/Equity: {_fmt(de_ratio, 'x')} | Current Ratio: {_fmt(current_ratio, 'x')}

ANALYST CONSENSUS ({analyst_count or 'N/A'} analysts):
- Mean Target: {f'${target_mean:.2f}' if target_mean else 'N/A'} (implied {_fmt(upside_to_target, '%', digits=1)} upside)
- Target Range: {f'${target_low:.2f}' if target_low else 'N/A'} – {f'${target_high:.2f}' if target_high else 'N/A'}
- Consensus Score: {_fmt(rec_mean, digits=2)} (1=Strong Buy, 3=Hold, 5=Sell)
- Short Float: {_fmt(short_float, '%', scale=100)} | Short Ratio: {_fmt(short_ratio, 'x')}

RECENT NEWS:
{chr(10).join(f'- {h}' for h in headlines) if headlines else '- No recent news available'}

Respond ONLY with raw JSON (no markdown, no code fences):
{{
  "verdict": "Buy" | "Hold" | "Sell",
  "confidence": "High" | "Medium" | "Low",
  "price_target": <your fair value estimate as a number, or null>,
  "upside_pct": <% upside/downside to your price target, or null>,
  "summary": "<2-3 sentences: overall thesis, what drives the stock, and why now>",
  "bull_case": [
    "<specific catalyst or strength #1 — cite actual numbers>",
    "<specific catalyst or strength #2>",
    "<specific catalyst or strength #3>"
  ],
  "bear_case": [
    "<specific risk or weakness #1 — cite actual numbers>",
    "<specific risk or weakness #2>"
  ],
  "key_metric": "<the single most important metric that will determine if this thesis plays out>",
  "risk_level": "Low" | "Medium" | "High"
}}

Be direct and specific. Cite actual numbers from the data. No disclaimers in the JSON fields."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=900,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        result = _extract_json(text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned malformed JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    return {
        "symbol": sym,
        "name": name,
        "price": round(price, 2),
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "analyst_target": round(target_mean, 2) if target_mean else None,
        "analyst_count": analyst_count,
        **result,
    }
