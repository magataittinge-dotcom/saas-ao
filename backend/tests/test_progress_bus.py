"""Tests for the in-process progress bus."""
import queue
import threading

import pytest

from services import progress_bus


@pytest.fixture(autouse=True)
def _reset_bus():
    """Wipe the bus between tests so cases never leak state into each other."""
    # Direct access — only used by tests.
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()
    yield
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()


def test_subscribe_returns_independent_queue():
    q1 = progress_bus.subscribe("p-1")
    q2 = progress_bus.subscribe("p-1")
    assert q1 is not q2
    assert progress_bus.stats()["subscribers"] == 2


def test_publish_delivers_to_every_subscriber():
    q1 = progress_bus.subscribe("p-1")
    q2 = progress_bus.subscribe("p-1")
    progress_bus.publish("p-1", "progress", {"x": 42})
    e1 = q1.get_nowait()
    e2 = q2.get_nowait()
    assert e1["type"] == "progress"
    assert e1["data"] == {"x": 42}
    assert e2["data"] == {"x": 42}


def test_publish_isolates_projects():
    q_a = progress_bus.subscribe("p-A")
    q_b = progress_bus.subscribe("p-B")
    progress_bus.publish("p-A", "progress", {"only": "A"})
    assert q_a.get_nowait()["data"] == {"only": "A"}
    with pytest.raises(queue.Empty):
        q_b.get_nowait()


def test_unsubscribe_cleans_up_per_project():
    q = progress_bus.subscribe("p-1")
    progress_bus.unsubscribe("p-1", q)
    # Project key gone when last subscriber leaves.
    assert "p-1" not in progress_bus._subscribers


def test_unsubscribe_idempotent():
    q = progress_bus.subscribe("p-1")
    progress_bus.unsubscribe("p-1", q)
    progress_bus.unsubscribe("p-1", q)  # no error
    progress_bus.unsubscribe("p-unknown", q)  # no error
    assert progress_bus.stats()["projects"] == 0


def test_publish_remembers_last_event_per_project():
    progress_bus.subscribe("p-1")
    progress_bus.publish("p-1", "progress", {"v": 1})
    progress_bus.publish("p-1", "progress", {"v": 2})
    last = progress_bus.get_last_event("p-1")
    assert last is not None
    assert last["data"] == {"v": 2}


def test_publish_drops_event_when_queue_full(monkeypatch):
    """Slow consumer mustn't block the publisher."""
    monkeypatch.setattr(progress_bus, "_QUEUE_MAXSIZE", 2)
    q = progress_bus.subscribe("p-1")
    # Fill the queue beyond capacity — publisher must NOT raise.
    for i in range(5):
        progress_bus.publish("p-1", "progress", {"i": i})
    # 2 events buffered, the rest dropped silently.
    drained = 0
    while True:
        try:
            q.get_nowait()
            drained += 1
        except queue.Empty:
            break
    assert drained == 2


def test_thread_safe_publish_and_subscribe():
    """100 concurrent publishes from N threads, no exceptions."""
    progress_bus.subscribe("p-1")

    def worker(worker_id: int):
        for i in range(20):
            progress_bus.publish("p-1", "progress", {"w": worker_id, "i": i})

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    # 5 workers × 20 events = 100, all stored in last event tracking.
    assert progress_bus.stats()["projects"] == 1


def test_clear_wipes_project_state():
    progress_bus.subscribe("p-1")
    progress_bus.publish("p-1", "progress", {})
    progress_bus.clear("p-1")
    assert "p-1" not in progress_bus._subscribers
    assert "p-1" not in progress_bus._last_event
