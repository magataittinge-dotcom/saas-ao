"""TTL cache smoke tests."""
import time

import pytest

from services.cache import _OrgCache, org_cache


def test_set_get():
    c = _OrgCache()
    c.set("k", {"v": 1}, ttl=60)
    assert c.get("k") == {"v": 1}


def test_get_missing_returns_none():
    c = _OrgCache()
    assert c.get("absent") is None


def test_ttl_expires():
    c = _OrgCache()
    c.set("k", "x", ttl=0.01)
    time.sleep(0.05)
    assert c.get("k") is None


def test_invalidate_by_prefix():
    c = _OrgCache()
    c.set("dashboard_stats:org-1", "a")
    c.set("dashboard_stats:org-2", "b")
    c.set("other:foo", "c")
    removed = c.invalidate("dashboard_stats:")
    assert removed == 2
    assert c.get("dashboard_stats:org-1") is None
    assert c.get("dashboard_stats:org-2") is None
    assert c.get("other:foo") == "c"


def test_clear():
    c = _OrgCache()
    c.set("a", 1); c.set("b", 2)
    c.clear()
    assert c.stats()["size"] == 0


def test_dashboard_endpoint_uses_cache(client, db_session, test_org):
    """Hit /api/dashboard/stats twice — second call must be served from cache.
    We assert via the org_cache.stats() that the key is alive afterwards."""
    org_cache.clear()

    resp1 = client.get("/api/dashboard/stats")
    assert resp1.status_code == 200

    # Cache should now hold one alive entry for this org.
    s = org_cache.stats()
    assert s["size"] >= 1

    # Second call returns the same payload without hitting DB aggregation.
    resp2 = client.get("/api/dashboard/stats")
    assert resp2.status_code == 200
    assert resp1.json() == resp2.json()
