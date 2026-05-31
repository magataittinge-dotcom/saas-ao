"""Synorix skills — lots category (Step 2 : lot detection).

Importing this package self-registers every lots skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.lots.detection_corps_de_metier_lot import DetectionCorpsDeMetierLot  # noqa: F401
from synorix.skills.lots.detection_incoherences_lots import DetectionIncoherencesLots  # noqa: F401
from synorix.skills.lots.extraction_description_lot import ExtractionDescriptionLot  # noqa: F401
from synorix.skills.lots.recherche_lots import RechercheLots  # noqa: F401
