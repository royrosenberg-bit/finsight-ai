"""
Smart Alerts — detects unusual stock activity and generates
intelligent alerts for watchlist/portfolio stocks.
"""

from fastapi import APIRouter
import yfinance as yf
import yf_session
from datetime import datetime, timezone, timedelta

router = APIRouter()

POPULAR_SYMBOLS = ["AAPL", "TSLA", "NVDA", "META", "MSFT", "AMZN", "GOOGL", "AMD"]


def get_alerts_for_symbol(symbol: str) -> list[dict]:
    alerts = []
    try:
        ticker = yf_session.Ticker(symbol.upper())
        info = ticker.info

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
        avg_volume = info.get("averageVolume") or info.get("averageVolume10days")
        cur_volume = info.get("regularMarketVolume")
        name = info.get("longName") or info.get("shortName", symbol)
        beta = info.get("beta")
        earnings_ts = info.get("earningsTimestamp")

        if not price or not prev:
            return alerts

        change_pct = (price - prev) / prev * 100
        ts = datetime.now(tz=timezone.utc).isoformat()

        # 1. Unusual price move
        threshold = 2.0
        if beta and beta > 1.5:
            threshold = 3.0  # higher threshold for volatile stocks
        if abs(change_pct) >= threshold:
            severity = "critical" if abs(change_pct) >= 5 else ("high" if abs(change_pct) >= 3 else "medium")
            direction = "up" if change_pct > 0 else "down"
            alerts.append({
                "id": f"{symbol}_move_{ts}",
                "symbol": symbol, "name": name,
                "type": "unusual_move",
                "severity": severity,
                "message": f"{symbol} is {direction} {abs(change_pct):.1f}% today — larger than its typical daily range.",
                "timestamp": ts,
                "read": False,
            })

        # 2. Unusual volume
        if avg_volume and cur_volume and avg_volume > 0:
            vol_ratio = cur_volume / avg_volume
            if vol_ratio >= 1.8:
                severity = "high" if vol_ratio >= 3 else "medium"
                alerts.append({
                    "id": f"{symbol}_volume_{ts}",
                    "symbol": symbol, "name": name,
                    "type": "unusual_volume",
                    "severity": severity,
                    "message": f"{symbol} volume is {vol_ratio:.1f}x its daily average — unusual activity detected.",
                    "timestamp": ts,
                    "read": False,
                })

        # 3. Earnings soon (within 14 days)
        if earnings_ts:
            earnings_date = datetime.fromtimestamp(earnings_ts, tz=timezone.utc)
            days_until = (earnings_date.date() - datetime.now(tz=timezone.utc).date()).days
            if 0 <= days_until <= 14:
                severity = "high" if days_until <= 3 else "medium"
                when = "today" if days_until == 0 else (f"in {days_until} day{'s' if days_until > 1 else ''}")
                alerts.append({
                    "id": f"{symbol}_earnings_{ts}",
                    "symbol": symbol, "name": name,
                    "type": "earnings_soon",
                    "severity": severity,
                    "message": f"{symbol} reports earnings {when} ({earnings_date.strftime('%b %d')}). Expect higher volatility.",
                    "timestamp": ts,
                    "read": False,
                })

        # 4. 52-week high/low approach
        high52 = info.get("fiftyTwoWeekHigh")
        low52 = info.get("fiftyTwoWeekLow")
        if high52 and price >= high52 * 0.97:
            alerts.append({
                "id": f"{symbol}_52high_{ts}",
                "symbol": symbol, "name": name,
                "type": "milestone",
                "severity": "medium",
                "message": f"{symbol} is within 3% of its 52-week high of ${high52:.2f}.",
                "timestamp": ts,
                "read": False,
            })
        elif low52 and price <= low52 * 1.03:
            alerts.append({
                "id": f"{symbol}_52low_{ts}",
                "symbol": symbol, "name": name,
                "type": "milestone",
                "severity": "high",
                "message": f"{symbol} is near its 52-week low of ${low52:.2f} — potential support level.",
                "timestamp": ts,
                "read": False,
            })

    except Exception:
        pass

    return alerts


@router.get("/alerts")
def get_alerts(symbols: str = ""):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else []
    all_symbols = list(dict.fromkeys(sym_list + POPULAR_SYMBOLS))[:15]

    all_alerts = []
    for sym in all_symbols:
        all_alerts.extend(get_alerts_for_symbol(sym))

    # Sort by severity then timestamp
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_alerts.sort(key=lambda a: (order.get(a["severity"], 4), a["timestamp"]))

    return all_alerts
