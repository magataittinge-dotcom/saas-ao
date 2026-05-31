"""Synorix skills — extraction category (Step 3 : requirement / alert extraction).

Importing this package self-registers every extraction skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.extraction.extraction_exigences_administratives import (  # noqa: F401
    ExtractionExigencesAdministratives,
)
from synorix.skills.extraction.detection_visite_obligatoire_analyse import (  # noqa: F401
    DetectionVisiteObligatoireAnalyse,
)
from synorix.skills.extraction.extraction_criteres_jugement import (  # noqa: F401
    ExtractionCriteresJugement,
)
from synorix.skills.extraction.extraction_exigences_techniques import (  # noqa: F401
    ExtractionExigencesTechniques,
)
from synorix.skills.extraction.extraction_pieces_offre import ExtractionPiecesOffre  # noqa: F401
