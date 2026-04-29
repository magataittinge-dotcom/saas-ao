"""audit_log table + soft-delete columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-30 04:00:00

Captures the schema changes added in commit a1a2fea (Phase 2.2):
  • new audit_logs table (org-scoped, indexed)
  • deleted_at column added on projects/documents/references

Idempotent: each operation checks whether the column/table already exists
so this migration coexists cleanly with the runtime _ensure_schema_columns()
that already created them on the dev DB.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # ── audit_logs ──────────────────────────────────────────────────
    if not _has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("organization_id", sa.String(), nullable=True),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("target_type", sa.String(32), nullable=True),
            sa.Column("target_id", sa.String(), nullable=True),
            sa.Column("extra", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
        op.create_index("ix_audit_logs_organization_id", "audit_logs", ["organization_id"])
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
        op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
        op.create_index("ix_audit_logs_org_created", "audit_logs", ["organization_id", "created_at"])
        op.create_index("ix_audit_logs_user_created", "audit_logs", ["user_id", "created_at"])

    # ── deleted_at columns (only if the parent table already exists) ─
    if _has_table("projects") and not _has_column("projects", "deleted_at"):
        op.add_column("projects", sa.Column("deleted_at", sa.DateTime(), nullable=True))
        op.create_index("ix_projects_deleted_at", "projects", ["deleted_at"])

    if _has_table("documents") and not _has_column("documents", "deleted_at"):
        op.add_column("documents", sa.Column("deleted_at", sa.DateTime(), nullable=True))
        op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])

    if _has_table("references") and not _has_column("references", "deleted_at"):
        op.add_column("references", sa.Column("deleted_at", sa.DateTime(), nullable=True))
        op.create_index("ix_references_deleted_at", "references", ["deleted_at"])


def downgrade() -> None:
    if _has_column("references", "deleted_at"):
        op.drop_index("ix_references_deleted_at", table_name="references")
        op.drop_column("references", "deleted_at")
    if _has_column("documents", "deleted_at"):
        op.drop_index("ix_documents_deleted_at", table_name="documents")
        op.drop_column("documents", "deleted_at")
    if _has_column("projects", "deleted_at"):
        op.drop_index("ix_projects_deleted_at", table_name="projects")
        op.drop_column("projects", "deleted_at")
    if _has_table("audit_logs"):
        op.drop_index("ix_audit_logs_user_created", table_name="audit_logs")
        op.drop_index("ix_audit_logs_org_created", table_name="audit_logs")
        op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
        op.drop_index("ix_audit_logs_action", table_name="audit_logs")
        op.drop_index("ix_audit_logs_organization_id", table_name="audit_logs")
        op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
        op.drop_table("audit_logs")
