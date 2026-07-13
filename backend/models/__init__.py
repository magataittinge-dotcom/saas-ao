from .organization import Organization
from .user import User
from .document import Document
from .team_member import TeamMember
from .reference import Reference
from .project import Project, ProjectDocument
from .compliance_item import ComplianceItem
from .checklist_item import ChecklistItem
from .memoire import MemoireTechnique
from .memoire_template import MemoireTemplate
from .memoire_config import MemoireConfig
from .audit_log import AuditLog
from .quota_consumption import QuotaConsumption
from .notification import Notification

# R14 — MemoireConfig était OMIS ici : `import models` (utilisé par alembic
# env.py) ne l'enregistrait donc pas avec Base.metadata, alors que l'app le
# voyait via l'import des routers. Résultat : autogenerate croyait devoir
# SUPPRIMER la table memoire_configs. Enregistré ici → metadata complète et
# cohérente entre l'app et alembic.
__all__ = [
    "Organization",
    "User",
    "Document",
    "TeamMember",
    "Reference",
    "Project",
    "ProjectDocument",
    "ComplianceItem",
    "ChecklistItem",
    "MemoireTechnique",
    "MemoireTemplate",
    "MemoireConfig",
    "AuditLog",
    "QuotaConsumption",
    "Notification",
]
