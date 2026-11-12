"""Index de lecture à l'échelle (audit données, solidité, coûts : D-07, D-06).

Revision ID: 0037
Revises: 0036

- D-07 : `notifications (organization_id, created_at)`. La liste des 50 dernières notifications d'une organisation
  parcourait l'index de date de TOUTES les organisations et jetait les autres (9 756 lignes pour 50 à 100 000
  notifications) ; avec l'index composé : 50 lignes lues, 0 jetée.
- D-06 : extension `pg_trgm` + index GIN trigrammes sur `avis_veille.objet` et `avis_veille.acheteur` (PostgreSQL
  seulement) : la recherche texte de la veille (`ilike '%mot%'`, services/veille/comptes.py) ne parcourt plus toute la
  table. `pg_trgm` est une extension « de confiance » (PostgreSQL ≥ 13) : le propriétaire de la base la crée sans
  superutilisateur.

Additive seulement. Idempotent. SQLite (tests) : l'index composé seulement.
Downgrade : les index sont retirés ; l'extension reste (elle peut servir ailleurs).
"""
import sqlalchemy as sa
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None

INDEX_NOTIFICATIONS = "ix_notifications_org_created"
COLONNES_TRGM = ("objet", "acheteur")


def _index(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    if INDEX_NOTIFICATIONS not in _index("notifications"):
        op.create_index(INDEX_NOTIFICATIONS, "notifications", ["organization_id", "created_at"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        for colonne in COLONNES_TRGM:
            op.execute(
                f"CREATE INDEX IF NOT EXISTS ix_avis_veille_{colonne}_trgm "
                f"ON avis_veille USING gin ({colonne} gin_trgm_ops)"
            )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for colonne in COLONNES_TRGM:
            op.execute(f"DROP INDEX IF EXISTS ix_avis_veille_{colonne}_trgm")
    if INDEX_NOTIFICATIONS in _index("notifications"):
        op.drop_index(INDEX_NOTIFICATIONS, table_name="notifications")
