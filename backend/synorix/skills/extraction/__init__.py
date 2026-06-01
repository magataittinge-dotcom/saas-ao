"""Synorix skills — extraction category (Step 3 : requirement / alert extraction).

Importing this package self-registers every extraction skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.extraction.extraction_exigences_administratives import (  # noqa: F401
    ExtractionExigencesAdministratives,
)
from synorix.skills.extraction.calculatrice_retenue_garantie import (  # noqa: F401
    CalculatriceRetenueGarantie,
)
from synorix.skills.extraction.detection_cautionnement_garanties import (  # noqa: F401
    DetectionCautionnementGaranties,
)
from synorix.skills.extraction.detection_documents_a_completer import (  # noqa: F401
    DetectionDocumentsACompleter,
)
from synorix.skills.extraction.detection_incoherences_dce import DetectionIncoherencesDce  # noqa: F401
from synorix.skills.extraction.detection_criteres_disproportionnes import (  # noqa: F401
    DetectionCriteresDisproportionnes,
)
from synorix.skills.extraction.detection_pieges_dce import DetectionPiegesDce  # noqa: F401
from synorix.skills.extraction.liaison_coffre_fort import LiaisonCoffreFort  # noqa: F401
from synorix.skills.extraction.surlignage_exigence_complete import (  # noqa: F401
    SurlignageExigenceComplete,
)
from synorix.skills.extraction.synthese_executive_dce import SyntheseExecutiveDce  # noqa: F401
from synorix.skills.extraction.detection_visite_obligatoire_analyse import (  # noqa: F401
    DetectionVisiteObligatoireAnalyse,
)
from synorix.skills.extraction.enrichissement_source_document import (  # noqa: F401
    EnrichissementSourceDocument,
)
from synorix.skills.extraction.extraction_criteres_jugement import (  # noqa: F401
    ExtractionCriteresJugement,
)
from synorix.skills.extraction.extraction_exigences_techniques import (  # noqa: F401
    ExtractionExigencesTechniques,
)
from synorix.skills.extraction.extraction_pieces_offre import ExtractionPiecesOffre  # noqa: F401
from synorix.skills.extraction.validation_completude_document import (  # noqa: F401
    ValidationCompletudeDocument,
)
from synorix.skills.extraction.validation_piece_coffre_fort import (  # noqa: F401
    ValidationPieceCoffreFort,
)
