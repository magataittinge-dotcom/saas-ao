"""Server-Sent Events for project progress.

One open SSE connection per project replaces the legacy 2 s polling on
``/processing-status``. The legacy endpoint is preserved for fallback
when the browser cannot keep an SSE connection open (rare).

Wire format::

    event: <type>
    data: <json>

    event: <type>
    data: <json>

Each block is terminated with a blank line (``\\n\\n``). Types we emit:

* ``init``      — initial state on connection (most recent known event)
* ``progress``  — periodic updates from the tracker
* ``complete``  — pipeline finished successfully
* ``error``     — pipeline failed
* ``heartbeat`` — sent every 25 s if no other event has been published
                  (keeps proxies / WSL2 NAT from killing the TCP)
"""
from __future__ import annotations

import asyncio
import json
import logging
import queue
import time
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.project import Project
from models.user import User
from routers.auth import get_auth_user
from services import pipeline_tracker, progress_bus

logger = logging.getLogger(__name__)

router = APIRouter()

_HEARTBEAT_INTERVAL_S = 25.0
_QUEUE_TIMEOUT_S = 1.0  # poll the queue with this timeout to allow heartbeat ticks


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404


def _format_event(event_type: str, payload: dict) -> bytes:
    """Encode an event in the SSE wire format."""
    body = json.dumps(payload, default=str, ensure_ascii=False)
    return f"event: {event_type}\ndata: {body}\n\n".encode("utf-8")


@router.get("/{project_id}/progress-stream")
async def progress_stream(
    project_id: str,
    request: Request,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Long-lived SSE stream of progress events for a single project.

    Authorisation: project must belong to the user's organisation.
    """
    _get_project_or_404(project_id, user.organization_id, db)

    # Subscribe BEFORE we yield the initial state so we don't miss any
    # events that arrive between the snapshot and the first iteration.
    q = progress_bus.subscribe(project_id)

    async def stream() -> AsyncIterator[bytes]:
        try:
            # 1. Initial state — most recent known event (catch-up) OR
            # the current pipeline_tracker snapshot.
            last = progress_bus.get_last_event(project_id)
            if last is not None:
                yield _format_event("init", last)
            else:
                snap = pipeline_tracker.get_status(project_id)
                if snap is not None:
                    yield _format_event("init", snap)
                else:
                    # No state yet — emit an empty init so the client
                    # knows the connection is alive.
                    yield _format_event("init", {"status": "idle", "progress": 0})

            last_emit = time.monotonic()

            while True:
                # Bail out promptly if the client disconnected.
                if await request.is_disconnected():
                    break

                # Poll the sync queue without blocking the event loop.
                try:
                    event = await asyncio.to_thread(q.get, True, _QUEUE_TIMEOUT_S)
                except queue.Empty:
                    event = None

                if event is not None:
                    yield _format_event(event["type"], event["data"])
                    last_emit = time.monotonic()
                    if event["type"] in ("complete", "error"):
                        # Stream is done — send one final event then exit.
                        break
                else:
                    # Queue timed out. Emit a heartbeat if we've been
                    # silent for too long.
                    if time.monotonic() - last_emit >= _HEARTBEAT_INTERVAL_S:
                        yield _format_event("heartbeat", {"ts": time.time()})
                        last_emit = time.monotonic()
        finally:
            progress_bus.unsubscribe(project_id, q)
            logger.debug("progress_stream: cleaned up project=%s", project_id)

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        # X-Accel-Buffering disables nginx buffering for this response only,
        # so events flush immediately even if the global config didn't
        # explicitly disable proxy_buffering for /api/projects/.
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)
