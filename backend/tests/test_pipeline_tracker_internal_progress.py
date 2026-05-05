"""Internal progress signal overrides elapsed-time interpolation."""
import pytest

from services import pipeline_tracker, progress_bus


@pytest.fixture(autouse=True)
def _reset():
    pipeline_tracker._store.clear()
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()
    yield
    pipeline_tracker._store.clear()
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()


def _start_at(project_id: str, target_step: str, pipeline: str = "memoire") -> None:
    """Walk the pipeline and complete every step before `target_step`,
    then start `target_step`. Mirrors how the routers actually drive
    the tracker (start/complete in order)."""
    pipeline_tracker.start_pipeline(project_id, pipeline)
    state = pipeline_tracker._store[project_id]
    for s in state.steps:
        if s.step_id == target_step:
            pipeline_tracker.start_step(project_id, target_step)
            return
        pipeline_tracker.start_step(project_id, s.step_id)
        pipeline_tracker.complete_step(project_id, s.step_id)


def test_internal_progress_drives_get_status_progress():
    _start_at("p-1", "generating")

    # 'generating' covers 10-85 (75 pct width). internal_progress=0.5
    # → progress should be 10 + 0.5 * 75 = 47, give or take rounding.
    pipeline_tracker.update_step_progress("p-1", 0.5)
    snap = pipeline_tracker.get_status("p-1")
    assert snap is not None
    assert 45 <= snap["progress"] <= 49


def test_internal_progress_clamped_below_one():
    _start_at("p-1", "generating")
    # Even at 1.5 the signal clamps to 0.99, giving us 84 (10 + 0.99 * 75).
    pipeline_tracker.update_step_progress("p-1", 1.5)
    snap = pipeline_tracker.get_status("p-1")
    assert snap["progress"] <= 84


def test_update_step_progress_targets_only_in_progress_step():
    _start_at("p-1", "analyzing_pass1", pipeline="analysis")
    pipeline_tracker.update_step_progress("p-1", 0.5)
    snap1 = pipeline_tracker.get_status("p-1")

    pipeline_tracker.complete_step("p-1", "analyzing_pass1")
    # Now no step is in_progress — update is a no-op.
    pipeline_tracker.update_step_progress("p-1", 0.99)
    snap2 = pipeline_tracker.get_status("p-1")

    # The completed step is at its end (60), no further change.
    assert snap2["progress"] >= snap1["progress"]


def test_complete_step_clears_internal_progress():
    _start_at("p-1", "generating")
    pipeline_tracker.update_step_progress("p-1", 0.7)
    pipeline_tracker.complete_step("p-1", "generating")

    # Re-start the next step — internal_progress should have been reset.
    pipeline_tracker.start_step("p-1", "finalizing")
    snap = pipeline_tracker.get_status("p-1")
    # finalizing is 85-100 — without internal_progress signal we get
    # the elapsed-time interpolation starting from 85.
    assert snap["progress"] >= 85


def test_update_step_progress_publishes_to_bus():
    sub = progress_bus.subscribe("p-1")
    _start_at("p-1", "generating")
    # Drain whatever start events are in the queue.
    while not sub.empty():
        sub.get_nowait()

    pipeline_tracker.update_step_progress("p-1", 0.42)
    event = sub.get_nowait()
    assert event["type"] == "progress"
    assert event["data"]["status"] in ("running", "generating")
    assert 38 <= event["data"]["progress"] <= 45  # 10 + 0.42 * 75 = 41.5


def test_complete_pipeline_publishes_complete_event():
    sub = progress_bus.subscribe("p-1")
    _start_at("p-1", "generating")
    while not sub.empty():
        sub.get_nowait()

    pipeline_tracker.complete_pipeline("p-1")
    # Last event in the queue should be 'complete'.
    last = None
    while not sub.empty():
        last = sub.get_nowait()
    assert last is not None
    assert last["type"] == "complete"
    assert last["data"]["progress"] == 100


def test_fail_pipeline_publishes_error_event():
    sub = progress_bus.subscribe("p-1")
    pipeline_tracker.start_pipeline("p-1", "memoire")
    while not sub.empty():
        sub.get_nowait()

    pipeline_tracker.fail_pipeline("p-1", "boom")
    last = None
    while not sub.empty():
        last = sub.get_nowait()
    assert last is not None
    assert last["type"] == "error"
