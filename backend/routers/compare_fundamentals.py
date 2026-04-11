"""
Premium Compare — fetches fundamental metrics for 2+ stocks
and generates an AI comparison summary.
"""

import os
import json
from fastapi import APIRouter, HTTPException
import yfinance as yf
import anthropic
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()


def fetch_fundamentals(symbol: str) -> dict:
    info = yf.Ticker(symbol.upper()).info
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((price - prev) / prev * 100) if price and prev else None

    return {
        "symbol": symbol.upper(),
        "name": info.get("longName") or info.get("shortName", symbol),
        "price": round(price, 2) if price else None,
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "ps_ratio": info.get("priceToSalesTrailing12Months"),
        "pb_ratio": info.get("priceToBook"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "gross_margin": info.get("grossMargins"),
        "profit_margin": info.get("profitMargins"),
        "operating_margin": info.get("operatingMargins"),
        "roe": info.get("returnOnEquity"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "dividend_yield": info.get("dividendYield"),
        "beta": info.get("beta"),
        "sector": info.get("sector"),
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
    }


def pick_winner(stocks: list[dict], key: str, lower_is_better: bool = False) -> str | None:
    """Return the symbol with the best value for a given metric."""
    candidates = [(s["symbol"], s.get(key)) for s in stocks if s.get(key) is not None]
    if len(candidates) < 2:
        return None
    candidates.sort(key=lambda x: x[1], reverse=not lower_is_better)
    return candidates[0][0]


def build_comparison_prompt(stocks: list[dict]) -> str:
    lines = []
    for s in stocks:
        lines.append(f"""
{s['symbol']} ({s['name']}):
  Price: ${s['price']} ({s['change_pct']:+.2f}% today)
  Market Cap: ${s['market_cap']:,.0f if s['market_cap'] else 'N/A'}
  P/E: {s['pe_ratio']:.1f if s['pe_ratio'] else 'N/A'} | Forward P/E: {s['forward_pe']:.1f if s['forward_pe'] else 'N/A'}
  Revenue Growth: {f"{s['revenue_growth']*100:.1f}%" if s['revenue_growth'] else 'N/A'}
  Profit Margin: {f"{s['profit_margin']*100:.1f}%" if s['profit_margin'] else 'N/A'}
  ROE: {f"{s['roe']*100:.1f}%" if s['roe'] else 'N/A'}
  Beta: {s['beta'] if s['beta'] else 'N/A'}""")

    return f"""You are a financial analyst comparing these stocks side by side:
{"".join(lines)}

Respond with ONLY raw JSON:
{{
  "summary": "2-3 sentence sharp comparison. Name which looks stronger overall and why.",
  "stronger_growth": "{stocks[0]['symbol']} or {stocks[1]['symbol'] if len(stocks)>1 else ''}",
  "better_value": "{stocks[0]['symbol']} or {stocks[1]['symbol'] if len(stocks)>1 else ''}",
  "lower_risk": "{stocks[0]['symbol']} or {stocks[1]['symbol'] if len(stocks)>1 else ''}",
  "verdict": "One sentence bottom line for a long-term investor."
}}

Be specific, name real metrics, avoid generic statements."""


@router.get("/compare/fundamentals")
def compare_fundamentals(symbols: str):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:4]
    if len(syms) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 comma-separated symbols")

    stocks = []
    for sym in syms:
        try:
            stocks.append(fetch_fundamentals(sym))
        except Exception:
            pass

    if len(stocks) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch data for enough symbols")

    # Determine winners per metric
    winners = {
        "revenue_growth": pick_winner(stocks, "revenue_growth"),
        "profit_margin":  pick_winner(stocks, "profit_margin"),
        "pe_ratio":       pick_winner(stocks, "pe_ratio", lower_is_better=True),
        "beta":           pick_winner(stocks, "beta", lower_is_better=True),
        "roe":            pick_winner(stocks, "roe"),
    }

    # AI summary
    ai = {"summary": "", "stronger_growth": "", "better_value": "", "lower_risk": "", "verdict": ""}
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        try:
            client = anthropic.Anthropic(api_key=api_key)
            msg = client.messages.create(
                model="claude-sonnet-4-6", max_tokens=400,
                messages=[{"role": "user", "content": build_comparison_prompt(stocks)}],
            )
            text = msg.content[0].text.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"): text = text[4:]
            ai = json.loads(text.strip())
        except Exception:
            pass

    return {"stocks": stocks, "winners": winners, "ai": ai}
