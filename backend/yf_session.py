"""
Shared yfinance session with browser-like headers.
Yahoo Finance rate-limits cloud IPs aggressively when requests look like bots.
Passing a real browser User-Agent + Referer dramatically reduces 429 errors.

Usage:
    import yf_session
    ticker = yf_session.Ticker("AAPL")   # drop-in for yf.Ticker("AAPL")
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import yfinance as yf


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://finance.yahoo.com/",
        "Origin": "https://finance.yahoo.com",
        "DNT": "1",
    })
    retry = Retry(
        total=3,
        backoff_factor=2,          # 2s, 4s, 8s between retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


# One session shared across all requests for this process lifetime
SESSION = _make_session()


def Ticker(sym: str) -> yf.Ticker:
    """Drop-in replacement for yf.Ticker() that uses the browser session."""
    return yf.Ticker(sym.upper(), session=SESSION)
