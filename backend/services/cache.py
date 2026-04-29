"""Tiny in-process TTL cache.

Used for hot-path read endpoints (dashboard stats, profile completion stats)
where eventually-consistent values are fine. Backed by a thread-safe ``dict``
with TTL semantics — no external dependency.

If a Redis URL is configured we *could* swap to redis-py, but for ≤ 100 paying
customers the in-process cache is more than enough and avoids a network hop.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Optional


class _OrgCache:
    """Thread-safe TTL cache. Keys must be strings (we recommend `<scope>:<id>`)."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        with self._lock:
            entry = self._data.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at < now:
                # Lazy eviction.
                del self._data[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: float = 60.0) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + ttl, value)

    def invalidate(self, prefix: str) -> int:
        """Drop every key starting with `prefix`. Returns the count removed."""
        with self._lock:
            keys = [k for k in self._data if k.startswith(prefix)]
            for k in keys:
                del self._data[k]
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def stats(self) -> dict:
        """Useful for /api/metrics."""
        with self._lock:
            now = time.monotonic()
            alive = sum(1 for exp, _ in self._data.values() if exp >= now)
            return {"size": len(self._data), "alive": alive}


org_cache = _OrgCache()
