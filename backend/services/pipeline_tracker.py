"""
In-memory pipeline progress tracker.

Each project gets a PipelineState with ordered steps and real timestamps.
The /processing-status endpoint reads from here for structured progress.
Falls back to DB fields (processing_status) for upload/extraction phases
that predate this tracker.
"""

import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Optional

# ── Step definitions with progress ranges and estimated durations ────────────

ANALYSIS_STEPS = [
    ("upload",          "Upload des fichiers",                     0,  10,  5),
    ("extraction",      "Extraction des documents",               10,  25, 13),
    ("detecting_lots",  "Détection des lots",                     25,  35,  4),
    ("analyzing_pass1", "Analyse IA — Passe 1 (administratif)",   35,  60, 50),
    ("analyzing_pass2", "Analyse IA — Passe 2 (technique)",       60,  85, 50),
    ("finalizing",      "Finalisation",                           85, 100,  5),
]

MEMOIRE_STEPS = [
    ("preparing",       "Préparation des données",                 0,  10,  3),
    ("generating",      "Rédaction par Synorix IA",               10,  85, 120),
    ("finalizing",      "Finalisation du mémoire",                85, 100,  5),
]

# (step_id, label, pct_start, pct_end, estimated_seconds)


@dataclass
class StepState:
    step_id: str
    label: str
    pct_start: int
    pct_end: int
    estimated_s: int
    status: str = "pending"          # pending | in_progress | completed
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    duration_s: Optional[float] = None


@dataclass
class PipelineState:
    pipeline_type: str               # "analysis" | "memoire"
    status: str = "pending"          # pending | running | completed | error
    started_at: Optional[float] = None
    steps: list[StepState] = field(default_factory=list)
    error_message: Optional[str] = None


_store: dict[str, PipelineState] = {}
_lock = Lock()


def _make_steps(definitions: list[tuple]) -> list[StepState]:
    return [
        StepState(
            step_id=s[0], label=s[1],
            pct_start=s[2], pct_end=s[3], estimated_s=s[4],
        )
        for s in definitions
    ]


# ── Public API ───────────────────────────────────────────────────────────────

def start_pipeline(project_id: str, pipeline_type: str = "analysis") -> None:
    """Initialize tracking for a project pipeline."""
    defs = ANALYSIS_STEPS if pipeline_type == "analysis" else MEMOIRE_STEPS
    with _lock:
        _store[project_id] = PipelineState(
            pipeline_type=pipeline_type,
            status="running",
            started_at=time.time(),
            steps=_make_steps(defs),
        )


def start_step(project_id: str, step_id: str) -> None:
    """Mark a step as in_progress."""
    with _lock:
        state = _store.get(project_id)
        if not state:
            return
        for s in state.steps:
            if s.step_id == step_id:
                s.status = "in_progress"
                s.started_at = time.time()
                break


def complete_step(project_id: str, step_id: str) -> None:
    """Mark a step as completed and record duration."""
    with _lock:
        state = _store.get(project_id)
        if not state:
            return
        for s in state.steps:
            if s.step_id == step_id:
                s.status = "completed"
                s.completed_at = time.time()
                s.duration_s = round(s.completed_at - s.started_at, 1) if s.started_at else None
                break


def complete_pipeline(project_id: str) -> None:
    """Mark entire pipeline as completed."""
    with _lock:
        state = _store.get(project_id)
        if not state:
            return
        state.status = "completed"
        # Mark all remaining steps as completed
        for s in state.steps:
            if s.status != "completed":
                s.status = "completed"
                s.completed_at = time.time()


def fail_pipeline(project_id: str, message: str = "") -> None:
    """Mark pipeline as failed."""
    with _lock:
        state = _store.get(project_id)
        if not state:
            return
        state.status = "error"
        state.error_message = message


def get_status(project_id: str) -> Optional[dict]:
    """
    Build the structured status response.
    Returns None if no pipeline is tracked for this project.
    """
    with _lock:
        state = _store.get(project_id)
        if not state:
            return None

    now = time.time()

    # Find current step and compute progress
    current_step_label = ""
    progress = 0
    current_step_status = state.status

    for s in state.steps:
        if s.status == "completed":
            progress = s.pct_end
        elif s.status == "in_progress":
            current_step_label = s.label
            # Interpolate progress within the step based on elapsed time
            elapsed = now - s.started_at if s.started_at else 0
            ratio = min(elapsed / max(s.estimated_s, 1), 0.95)  # cap at 95% of step
            progress = s.pct_start + int((s.pct_end - s.pct_start) * ratio)
            break
        else:
            # First pending step — we're between previous completed and this
            current_step_label = s.label
            progress = s.pct_start
            break

    if state.status == "completed":
        progress = 100
        current_step_label = "Terminé"
    elif state.status == "error":
        current_step_label = state.error_message or "Erreur"

    # Estimate remaining time
    estimated_remaining_s = 0
    for s in state.steps:
        if s.status == "in_progress":
            elapsed = now - s.started_at if s.started_at else 0
            estimated_remaining_s += max(s.estimated_s - elapsed, 0)
        elif s.status == "pending":
            estimated_remaining_s += s.estimated_s

    elapsed_s = round(now - state.started_at, 1) if state.started_at else 0

    # Determine overall status string for frontend
    active_step_id = None
    for s in state.steps:
        if s.status == "in_progress":
            active_step_id = s.step_id
            break

    status_str = state.status
    if active_step_id:
        status_str = active_step_id

    return {
        "status": status_str,
        "progress": min(progress, 100),
        "current_step": current_step_label,
        "steps": [
            {
                "name": s.label,
                "status": s.status,
                **({"duration_s": s.duration_s} if s.duration_s is not None else {}),
                **({"started_at": s.started_at} if s.started_at else {}),
            }
            for s in state.steps
        ],
        "estimated_remaining_s": round(max(estimated_remaining_s, 0)),
        "started_at": state.started_at,
        "elapsed_s": elapsed_s,
        "pipeline_type": state.pipeline_type,
    }


def clear(project_id: str) -> None:
    """Remove tracking data for a project."""
    with _lock:
        _store.pop(project_id, None)
