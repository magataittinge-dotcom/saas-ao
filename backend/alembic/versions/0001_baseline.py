"""baseline — schema as of 2026-04-30

Revision ID: 0001
Revises:
Create Date: 2026-04-30 00:00:00

This migration is intentionally empty: it represents the state of the
database at the moment alembic was introduced. The schema itself is
created at startup by SQLAlchemy's Base.metadata.create_all() and the
legacy `_ensure_schema_columns()` runtime fixer.

On a brand new dev/prod DB:
    alembic upgrade head      # no-op — falls back to runtime creation

On a pre-existing prod DB (mid-migration):
    alembic stamp 0001        # mark current state as baseline, then
                              # subsequent revisions will diff cleanly.

From this revision onward, every schema change must add a new revision
file rather than rely on _ensure_schema_columns() (which we keep as a
dev fallback only).
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
