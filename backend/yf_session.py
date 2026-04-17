"""
yfinance Ticker wrapper.
yfinance 1.x uses curl_cffi internally for TLS fingerprinting — do NOT pass a
custom requests.Session or it overrides that mechanism and breaks Yahoo Finance.
This module is a thin passthrough that keeps all callers consistent.
"""

import yfinance as yf


def Ticker(sym: str) -> yf.Ticker:
    """Drop-in replacement for yf.Ticker() — let yfinance manage its own session."""
    return yf.Ticker(sym.upper())
