"""Synorix skills — upload category (Step 1 : DCE upload / classification).

Importing this package self-registers every upload skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.upload.detection_date_limite import DetectionDateLimite  # noqa: F401
from synorix.skills.upload.detection_doublons_versions import DetectionDoublonsVersions  # noqa: F401
from synorix.skills.upload.detection_plateforme_depot import DetectionPlateformeDepot  # noqa: F401
from synorix.skills.upload.detection_visite_obligatoire import DetectionVisiteObligatoire  # noqa: F401
from synorix.skills.upload.recherche_types_documents import RechercheTypesDocuments  # noqa: F401
