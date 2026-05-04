"""In-process pub/sub for project progress events.

Publishers (pipeline_tracker, lot_detector, AI services) push events from
synchronous code via :func:`publish`. Subscribers (the SSE endpoint) read
them via an :class:`queue.Queue` returned by :func:`subscribe`.

Why a thread-safe ``queue.Queue`` rather than ``asyncio.Queue``:

* The producers are synchronous code (FastAPI sync handlers, background
  threads, the Anthropic stream consumer). Pushing into an ``asyncio.Queue``
  from sync code requires ``loop.call_soon_threadsafe`` and a reference to
  the right loop, which is fragile.
* The consumer (SSE handler) is async, but it can poll the sync queue via
  ``await asyncio.to_thread(queue.get, timeout=...)``. The queue blocks the
  thread, never the event loop.

The bus is in-process — no Redis, no broker. Synorix runs as a single
``uvicorn --workers N`` process per host today. If we ever scale to
multiple hosts, swap this module for a Redis pub/sub implementation; the
public API is small enough to keep stable.
"""
from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

# Per-project subscriber list.
_subscribers: dict[str, list[queue.Queue]] = {}
_lock = threading.Lock()

# Last event per project — used to "catch up" a fresh subscriber.
_last_event: dict[str, dict] = {}

# Hard cap to avoid runaway memory if a queue is never drained.
_QUEUE_MAXSIZE = 500


def subscribe(project_id: str) -> queue.Queue:
    """Add a new subscriber and return its queue.

    Caller must call :func:`unsubscribe` in a ``finally`` block to avoid
    queue leaks on disconnect.
    """
    q: queue.Queue = queue.Queue(maxsize=_QUEUE_MAXSIZE)
    with _lock:
        _subscribers.setdefault(project_id, []).append(q)
    logger.debug("progress_bus: subscribe project=%s subs=%d", project_id, len(_subscribers[project_id]))
    return q


def unsubscribe(project_id: str, q: queue.Queue) -> None:
    """Remove a subscriber's queue. Idempotent."""
    with _lock:
        subs = _subscribers.get(project_id)
        if not subs:
            return
        try:
            subs.remove(q)
        except ValueError:
            pass
        if not subs:
            _subscribers.pop(project_id, None)


def publish(project_id: str, event_type: str, payload: dict[str, Any]) -> None:
    """Push an event to every subscriber of ``project_id``.

    Never raises. If a queue is full (slow consumer) we drop the event for
    that subscriber rather than block the publisher.
    """
    event = {
        "type": event_type,
        "data": payload,
        "ts": time.time(),
    }

    # Remember the latest event so a new subscriber sees it on connect.
    if event_type in ("init", "progress", "complete", "error"):
        _last_event[project_id] = event

    with _lock:
        subs = list(_subscribers.get(project_id, ()))

    for q in subs:
        try:
            q.put_nowait(event)
        except queue.Full:
            logger.warning(
                "progress_bus: queue full for project %s — dropping %s event",
                project_id, event_type,
            )


def get_last_event(project_id: str) -> dict | None:
    """Return the most recent published event, or None."""
    return _last_event.get(project_id)


def clear(project_id: str) -> None:
    """Wipe state for a finished project (call on cleanup, not strictly required)."""
    with _lock:
        _subscribers.pop(project_id, None)
    _last_event.pop(project_id, None)


def stats() -> dict:
    """For /api/metrics."""
    with _lock:
        return {
            "projects": len(_subscribers),
            "subscribers": sum(len(s) for s in _subscribers.values()),
            "remembered_events": len(_last_event),
        }
