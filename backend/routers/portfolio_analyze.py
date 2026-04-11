"""
AI Portfolio Analyst — analyzes a user's holdings and generates
smart insights, risk flags, sector breakdown, and rebalance suggestions.
"""

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import anthropic
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()


class Holding(BaseModel):
    symbol: str
    name: str
    shares: float
    buyPrice: float
    currentPrice: float
    sector: str = ""
    change_pct: float = 0.0


class PortfolioRequest(BaseModel):
    holdings: list[Holding]


def compute_metrics(holdings: list[Holding]):
    total_value = sum(h.currentPrice * h.shares for h in holdings)
    total_cost = sum(h.buyPrice * h.shares for h in holdings)
    total_pnl = total_value - total_cost
    pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    # Per-holding weights
    enriched = []
    for h in holdings:
        value = h.currentPrice * h.shares
        weight = (value / total_value * 100) if total_value > 0 else 0
        pnl = value - h.buyPrice * h.shares
        pnl_pct_h = (pnl / (h.buyPrice * h.shares) * 100) if h.buyPrice * h.shares > 0 else 0
        enriched.append({
            "symbol": h.symbol, "name": h.name,
            "value": round(value, 2), "weight": round(weight, 2),
            "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct_h, 2),
            "sector": h.sector or "Unknown",
        })

    enriched.sort(key=lambda x: x["weight"], reverse=True)

    # Sector weights
    sector_map = {}
    for h in enriched:
        sec = h["sector"]
        sector_map[sec] = round(sector_map.get(sec, 0) + h["weight"], 2)
    sector_map = dict(sorted(sector_map.items(), key=lambda x: x[1], reverse=True))

    # Diversification score (0-100): penalise top-2 concentration + few sectors
    top2_weight = sum(e["weight"] for e in enriched[:2])
    sector_count = len(sector_map)
    holding_count = len(holdings)
    concentration_penalty = max(0, top2_weight - 30)  # penalty above 30%
    score = max(0, min(100, 100 - concentration_penalty * 0.8 + min(sector_count * 5, 20) + min(holding_count * 2, 10)))

    # Risk flags
    flags = []
    if top2_weight > 50:
        flags.append(f"Top 2 holdings make up {top2_weight:.0f}% of your portfolio — high concentration risk.")
    if sector_map and list(sector_map.values())[0] > 50:
        flags.append(f"Over 50% of your portfolio is in {list(sector_map.keys())[0]}.")
    if holding_count < 4:
        flags.append("Fewer than 4 holdings — consider diversifying across more stocks.")
    if holding_count > 15:
        flags.append("More than 15 holdings — some positions may be too small to meaningfully impact returns.")

    return {
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pnl": round(total_pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "holdings": enriched,
        "sector_weights": sector_map,
        "diversification_score": round(score),
        "risk_flags": flags,
    }


def build_prompt(metrics: dict) -> str:
    top_holdings = "\n".join(
        f"  - {h['symbol']} ({h['name']}): {h['weight']}% of portfolio, P&L {h['pnl_pct']:+.1f}%"
        for h in metrics["holdings"][:6]
    )
    sectors = "\n".join(f"  - {k}: {v}%" for k, v in metrics["sector_weights"].items())

    return f"""You are an experienced portfolio analyst. Review this portfolio and give sharp, useful insights.

Portfolio Summary:
- Total value: ${metrics['total_value']:,.2f}
- Overall P&L: {metrics['pnl_pct']:+.1f}%
- Diversification score: {metrics['diversification_score']}/100
- Number of holdings: {len(metrics['holdings'])}

Top Holdings:
{top_holdings}

Sector Allocation:
{sectors}

Respond with ONLY raw JSON (no markdown):
{{
  "summary": "2-3 sentence portfolio overview. Be specific. Mention the dominant theme/style.",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "risk_level": "Low" | "Medium" | "High",
  "rebalance_suggestions": ["suggestion 1", "suggestion 2"]
}}

Rules:
- insights must be specific and actionable, not generic
- mention actual sector names and concentration percentages
- rebalance suggestions should be concrete (e.g. "Trim NVDA from 28% to ~15% to reduce semiconductor concentration")
- risk_level should reflect real concentration and sector diversity
- write like a Bloomberg analyst, not a chatbot"""


@router.post("/portfolio/analyze")
def analyze_portfolio(req: PortfolioRequest):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")
    if not req.holdings:
        raise HTTPException(status_code=400, detail="No holdings provided")

    metrics = compute_metrics(req.holdings)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            messages=[{"role": "user", "content": build_prompt(metrics)}],
        )
        text = msg.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"): text = text[4:]
        ai = json.loads(text.strip())
    except Exception:
        ai = {
            "summary": "Portfolio analysis unavailable.",
            "insights": [],
            "risk_level": "Medium",
            "rebalance_suggestions": [],
        }

    return {**metrics, **ai}
