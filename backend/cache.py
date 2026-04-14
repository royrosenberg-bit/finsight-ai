"""
Simple in-memory TTL cache.
Prevents hammering Yahoo Finance with duplicate requests.
"""
import time

_store: dict = {}


def get(key: str):
    entry = _store.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["value"]
    return None


def set(key: str, value, ttl: int):
    _store[key] = {"value": value, "expires": time.time() + ttl}
