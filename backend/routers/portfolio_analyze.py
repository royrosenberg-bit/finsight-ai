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
    beta: float = 1.0


class PortfolioRequest(BaseModel):
    holdings: list[Holding]


def compute_metrics(holdings: list[Holding]):
    total_value = sum(h.currentPrice * h.shares for h in holdings)
    total_cost  = sum(h.buyPrice * h.shares for h in holdings)
    total_pnl   = total_value - total_cost
    pnl_pct     = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    # Daily P&L (based on today's change_pct for each holding)
    daily_pnl = sum((h.currentPrice * h.shares) * (h.change_pct / 100) for h in holdings)

    # Per-holding weights + enriched data
    enriched = []
    for h in holdings:
        value    = h.currentPrice * h.shares
        weight   = (value / total_value * 100) if total_value > 0 else 0
        pnl      = value - h.buyPrice * h.shares
        cost     = h.buyPrice * h.shares
        pnl_pct_h = (pnl / cost * 100) if cost > 0 else 0
        daily_chg = value * (h.change_pct / 100)
        enriched.append({
            "symbol": h.symbol, "name": h.name,
            "shares": h.shares, "buyPrice": round(h.buyPrice, 2),
            "currentPrice": round(h.currentPrice, 2),
            "value": round(value, 2), "weight": round(weight, 2),
            "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct_h, 2),
            "daily_change_pct": round(h.change_pct, 2),
            "daily_change_value": round(daily_chg, 2),
            "sector": h.sector or "Unknown",
        })

    enriched.sort(key=lambda x: x["weight"], reverse=True)

    # Sector weights
    sector_map = {}
    for h in enriched:
        sec = h["sector"]
        sector_map[sec] = round(sector_map.get(sec, 0) + h["weight"], 2)
    sector_map = dict(sorted(sector_map.items(), key=lambda x: x[1], reverse=True))

    # Concentration metrics
    top1_weight = enriched[0]["weight"] if enriched else 0
    top3_weight = sum(e["weight"] for e in enriched[:3])
    top_sector_weight = list(sector_map.values())[0] if sector_map else 0
    top_sector_name   = list(sector_map.keys())[0] if sector_map else ""

    # Portfolio beta (weighted average)
    beta_map = {h.symbol: h.beta for h in holdings}
    portfolio_beta = sum(
        beta_map.get(e["symbol"], 1.0) * e["weight"] / 100
        for e in enriched
    )

    # Best / worst performer
    sorted_by_pnl = sorted(enriched, key=lambda x: x["pnl_pct"])
    worst = sorted_by_pnl[0]  if sorted_by_pnl else None
    best  = sorted_by_pnl[-1] if sorted_by_pnl else None

    # Diversification score (0–100)
    top2_weight = sum(e["weight"] for e in enriched[:2])
    sector_count  = len(sector_map)
    holding_count = len(holdings)
    concentration_penalty = max(0, top2_weight - 30)
    score = max(0, min(100, round(
        100 - concentration_penalty * 0.8
        + min(sector_count * 5, 20)
        + min(holding_count * 2, 10)
    )))

    # Risk flags
    flags = []
    if top1_weight > 30:
        flags.append(f"{enriched[0]['symbol']} alone is {top1_weight:.0f}% of the portfolio — single-stock concentration risk.")
    if top2_weight > 50:
        flags.append(f"Top 2 holdings ({enriched[0]['symbol']}, {enriched[1]['symbol'] if len(enriched)>1 else ''}) = {top2_weight:.0f}% — consider trimming.")
    if top_sector_weight > 50:
        flags.append(f"{top_sector_name} is {top_sector_weight:.0f}% of the portfolio — heavy sector concentration.")
    if portfolio_beta > 1.4:
        flags.append(f"Estimated portfolio beta of {portfolio_beta:.2f} — this portfolio is significantly more volatile than the market.")
    if holding_count < 4:
        flags.append("Fewer than 4 holdings — very concentrated; consider adding more positions.")
    if holding_count > 15:
        flags.append("15+ holdings — some positions may be too small to meaningfully impact returns.")

    return {
        "total_value":       round(total_value, 2),
        "total_cost":        round(total_cost, 2),
        "total_pnl":         round(total_pnl, 2),
        "pnl_pct":           round(pnl_pct, 2),
        "daily_pnl":         round(daily_pnl, 2),
        "holdings":          enriched,
        "sector_weights":    sector_map,
        "diversification_score": score,
        "portfolio_beta":    round(portfolio_beta, 2),
        "top1_weight":       round(top1_weight, 2),
        "top3_weight":       round(top3_weight, 2),
        "top_sector":        {"name": top_sector_name, "weight": round(top_sector_weight, 2)},
        "best_performer":    {"symbol": best["symbol"],  "pnl_pct": best["pnl_pct"]}  if best  else None,
        "worst_performer":   {"symbol": worst["symbol"], "pnl_pct": worst["pnl_pct"]} if worst else None,
        "risk_flags":        flags,
    }


def build_prompt(metrics: dict) -> str:
    top_holdings = "\n".join(
        f"  - {h['symbol']} ({h['name']}): {h['weight']:.1f}% weight, P&L {h['pnl_pct']:+.1f}%, daily {h['daily_change_pct']:+.1f}%"
        for h in metrics["holdings"][:8]
    )
    sectors = "\n".join(f"  - {k}: {v:.1f}%" for k, v in metrics["sector_weights"].items())

    return f"""You are a senior portfolio analyst at a top asset management firm. Analyze this portfolio with precision.

Portfolio Data:
- Total value: ${metrics['total_value']:,.0f} | Cost basis: ${metrics['total_cost']:,.0f}
- Total return: {metrics['pnl_pct']:+.1f}% | Today's P&L: ${metrics['daily_pnl']:+,.0f}
- Diversification score: {metrics['diversification_score']}/100
- Estimated portfolio beta: {metrics['portfolio_beta']:.2f}
- Top holding concentration: {metrics['top1_weight']:.1f}% | Top 3: {metrics['top3_weight']:.1f}%
- Holdings: {len(metrics['holdings'])} | Sectors: {len(metrics['sector_weights'])}

Holdings (by weight):
{top_holdings}

Sector Breakdown:
{sectors}

Respond with ONLY raw JSON (no markdown, no code fences):
{{
  "summary": "2-3 sentences. Characterize the portfolio style (growth/value/blend/concentrated). Name the dominant theme. Be specific about numbers.",
  "insights": [
    "Specific observation about concentration or a single holding",
    "Specific observation about sector exposure or diversification",
    "Specific observation about risk profile, volatility, or beta",
    "Specific observation about performance — what's driving gains or losses"
  ],
  "risk_level": "Low" | "Medium" | "High",
  "rebalance_suggestions": [
    "Concrete suggestion with specific ticker and target (e.g. Trim X from 28% to ~15%)",
    "Sector or diversification suggestion",
    "Optional third suggestion if warranted"
  ]
}}

Style: Bloomberg analyst, not chatbot. Be direct. Use numbers. No filler phrases."""


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
            max_tokens=600,
            messages=[{"role": "user", "content": build_prompt(metrics)}],
        )
        text = msg.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"): text = text[4:]
        ai = json.loads(text.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned malformed JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    return {**metrics, **ai}
