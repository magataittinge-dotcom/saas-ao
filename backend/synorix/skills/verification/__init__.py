"""Synorix skills — verification category (Step 5 : final verification / scoring).

Importing this package self-registers every verification skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.verification.recherche_format_rapport_conformite import (  # noqa: F401
    RechercheFormatRapportConformite,
)
from synorix.skills.verification.recherche_criteres_evaluation_memoire import (  # noqa: F401
    RechercheCriteresEvaluationMemoire,
)
from synorix.skills.verification.recherche_nomenclature_fichiers_ao import (  # noqa: F401
    RechercheNomenclatureFichiersAo,
)
from synorix.skills.verification.recherche_procedures_depot_plateformes import (  # noqa: F401
    RechercheProceduresDepotPlateformes,
)
from synorix.skills.verification.detection_pieces_manquantes_vs_ao import (  # noqa: F401
    DetectionPiecesManquantesVsAo,
)
from synorix.skills.verification.detection_validite_pieces_administratives import (  # noqa: F401
    DetectionValiditePiecesAdministratives,
)
from synorix.skills.verification.synorix_score_evaluateur import (  # noqa: F401
    SynorixScoreEvaluateur,
)
from synorix.skills.verification.synorix_score_suggestions import (  # noqa: F401
    SynorixScoreSuggestions,
)
from synorix.skills.verification.simulateur_prix_daj import SimulateurPrixDaj  # noqa: F401
from synorix.skills.verification.rao_predictif import RaoPredictif  # noqa: F401
from synorix.skills.verification.calculateur_oab_temps_reel import (  # noqa: F401
    CalculateurOabTempsReel,
)
