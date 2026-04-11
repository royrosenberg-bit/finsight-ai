"""
Premium DCF Valuation — comprehensive financial data + AI-generated assumptions
"""

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import anthropic
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()


def _safe(df, row_candidates, col):
    """Safely extract a float value from a DataFrame, trying multiple row names."""
    if df is None or df.empty or col is None:
        return None
    try:
        for row in row_candidates:
            if row in df.index:
                val = df.loc[row, col]
                if val is None:
                    continue
                f = float(val)
                if f == f:   # NaN != NaN
                    return f
    except Exception:
        pass
    return None


def _col0(df):
    """Return the first (most recent) column of a DataFrame, or None."""
    if df is None or df.empty:
        return None
    return df.columns[0]


@router.get("/dcf/data/{symbol}")
def get_dcf_data(symbol: str):
    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if not price:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

    # ── Financial statements ───────────────────────────────────────────────
    fin = None
    for attr in ("income_stmt", "financials"):
        try:
            df = getattr(ticker, attr, None)
            if df is not None and not df.empty:
                fin = df
                break
        except Exception:
            pass

    cf = None
    for attr in ("cash_flow", "cashflow"):
        try:
            df = getattr(ticker, attr, None)
            if df is not None and not df.empty:
                cf = df
                break
        except Exception:
            pass

    fin_col = _col0(fin)
    cf_col  = _col0(cf)

    # ── Income statement ───────────────────────────────────────────────────
    total_revenue = info.get("totalRevenue")

    ebit = _safe(fin, ["EBIT", "Operating Income", "Total Operating Income As Reported"], fin_col)
    if ebit is None and info.get("operatingMargins") and total_revenue:
        ebit = info["operatingMargins"] * total_revenue

    ebitda     = _safe(fin, ["EBITDA", "Normalized EBITDA"], fin_col)
    net_income = _safe(fin, [
        "Net Income", "Net Income Common Stockholders",
        "Net Income Including Noncontrolling Interests",
    ], fin_col)

    # ── Cash flow ──────────────────────────────────────────────────────────
    fcf = _safe(cf, ["Free Cash Flow", "FreeCashFlow"], cf_col)
    if fcf is None:
        fcf = info.get("freeCashflow")

    capex = _safe(cf, [
        "Capital Expenditure", "Capital Expenditures",
        "Purchase Of Property Plant And Equipment",
        "Purchase Of PPE", "Purchases of property and equipment",
    ], cf_col)

    da = _safe(cf, [
        "Depreciation And Amortization",
        "Depreciation & Amortization",
        "Depreciation",
        "Depreciation Amortization Depletion",
        "Reconciled Depreciation",
    ], cf_col)

    # ── Computed margins / percentages ─────────────────────────────────────
    ebit_margin = None
    if ebit and total_revenue:
        ebit_margin = round(ebit / total_revenue * 100, 1)
    elif info.get("operatingMargins"):
        ebit_margin = round(info["operatingMargins"] * 100, 1)

    fcf_margin  = round(fcf  / total_revenue * 100, 1) if fcf  and total_revenue else None
    capex_abs   = abs(capex) if capex else None
    capex_pct   = round(capex_abs / total_revenue * 100, 1) if capex_abs and total_revenue else None
    da_pct      = round(da        / total_revenue * 100, 1) if da         and total_revenue else None

    # ── Balance sheet ──────────────────────────────────────────────────────
    total_cash = info.get("totalCash")  or 0
    total_debt = info.get("totalDebt")  or 0
    net_debt_b = round((total_debt - total_cash) / 1e9, 2)

    # ── Revenue history (up to 4 years, oldest first) ──────────────────────
    revenue_history = []
    if fin is not None and not fin.empty:
        rev_row = next(
            (r for r in ["Total Revenue", "Revenue", "TotalRevenue"] if r in fin.index),
            None,
        )
        if rev_row:
            for col in list(fin.columns)[:4]:
                try:
                    val = fin.loc[rev_row, col]
                    f = float(val)
                    if f == f:
                        year = col.year if hasattr(col, "year") else str(col)[:4]
                        revenue_history.append({"year": str(year), "revenue": round(f / 1e9, 2)})
                except Exception:
                    pass
            revenue_history = list(reversed(revenue_history))

    rev_growth = info.get("revenueGrowth")
    eff_tax    = info.get("effectiveTaxRate")

    return {
        "symbol":            symbol.upper(),
        "name":              info.get("longName") or info.get("shortName", symbol.upper()),
        "price":             round(price, 2),
        "sector":            info.get("sector", ""),
        "industry":          info.get("industry", ""),
        "market_cap":        info.get("marketCap"),
        "enterprise_value":  info.get("enterpriseValue"),
        "shares_outstanding":info.get("sharesOutstanding"),
        "total_cash":        total_cash,
        "total_debt":        total_debt,
        "net_debt":          net_debt_b,
        "revenue":           round(total_revenue / 1e9, 2) if total_revenue else None,
        "revenue_growth_yoy":round(rev_growth * 100, 1)   if rev_growth    else None,
        "ebit":              round(ebit       / 1e9, 2)   if ebit          else None,
        "ebit_margin":       ebit_margin,
        "ebitda":            round(ebitda     / 1e9, 2)   if ebitda        else None,
        "net_income":        round(net_income / 1e9, 2)   if net_income    else None,
        "free_cash_flow":    round(fcf        / 1e9, 2)   if fcf           else None,
        "fcf_margin":        fcf_margin,
        "capex":             round(capex_abs  / 1e9, 2)   if capex_abs     else None,
        "capex_pct":         capex_pct,
        "da":                round(da         / 1e9, 2)   if da            else None,
        "da_pct":            da_pct,
        "beta":              info.get("beta"),
        "revenue_history":   revenue_history,
        "effective_tax_rate":round(eff_tax * 100, 1)      if eff_tax       else 21.0,
    }


# ── AI Assumptions ─────────────────────────────────────────────────────────

class AssumptionsRequest(BaseModel):
    symbol:            str
    name:              str
    sector:            str            = ""
    revenue:           Optional[float] = None
    revenue_growth_yoy:Optional[float] = None
    ebit_margin:       Optional[float] = None
    beta:              Optional[float] = None
    fcf_margin:        Optional[float] = None
    capex_pct:         Optional[float] = None
    da_pct:            Optional[float] = None
    net_debt:          Optional[float] = None
    ai_toggles:        dict           = {}


@router.post("/dcf/assumptions")
def generate_assumptions(req: AssumptionsRequest):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    def v(val, suffix=""):
        return f"{val}{suffix}" if val is not None else "N/A"

    prompt = f"""You are an expert financial analyst performing a DCF valuation for {req.name} ({req.symbol}).

Real financial data:
- Sector: {req.sector or "N/A"}
- Revenue: ${v(req.revenue)}B
- YoY Revenue Growth: {v(req.revenue_growth_yoy)}%
- EBIT Margin: {v(req.ebit_margin)}%
- FCF Margin: {v(req.fcf_margin)}%
- CapEx % Revenue: {v(req.capex_pct)}%
- D&A % Revenue: {v(req.da_pct)}%
- Beta: {v(req.beta)}
- Net Debt: ${v(req.net_debt)}B

Generate precise, company-specific DCF assumptions. Leverage your knowledge of {req.symbol}'s business model, competitive position, and growth trajectory.

Respond with ONLY raw JSON (no markdown, no code block):
{{
  "forecast_years": 10,
  "near_growth": <years 1-5 avg revenue growth %>,
  "long_growth": <years 6-10 avg revenue growth %, lower than near_growth>,
  "ebit_margin": <stabilized EBIT margin %>,
  "tax_rate": <effective tax rate %>,
  "capex_pct": <CapEx as % of revenue>,
  "da_pct": <D&A as % of revenue>,
  "wc_pct": <working capital change as % of revenue change, 1-5 typical>,
  "wacc": <WACC % — reference beta and sector, typically 7-14>,
  "terminal_growth": <terminal growth rate %, 1.5-3.5 typical>,
  "explanations": {{
    "revenue_growth": "<1-2 sentences specific to {req.symbol}'s growth drivers>",
    "ebit_margin": "<1-2 sentences referencing actual margin history and trajectory>",
    "wacc": "<1 sentence referencing beta={v(req.beta)} and {req.sector} sector>",
    "terminal_growth": "<1 sentence justification>",
    "capex": "<1 sentence on capital intensity>"
  }},
  "confidence": {{
    "revenue_growth": "<High|Medium|Low>",
    "ebit_margin": "<High|Medium|Low>",
    "wacc": "High",
    "terminal_growth": "Medium"
  }},
  "summary": "<2-3 sentences: what drives {req.symbol}'s DCF value, terminal value dependency, and key model risks>"
}}

All percentages as plain numbers (e.g. 15 not 0.15). Be specific — mention {req.symbol} by name."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")
