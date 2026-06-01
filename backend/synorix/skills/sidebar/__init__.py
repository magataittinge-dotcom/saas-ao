"""Synorix skills — sidebar category (Bibliothèque / Entreprise / Références).

Importing this package self-registers every sidebar skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.sidebar.extraction_memoire_importe import (  # noqa: F401
    ExtractionMemoireImporte,
)
from synorix.skills.sidebar.recherche_structure_profil_entreprise_btp import (  # noqa: F401
    RechercheStructureProfilEntrepriseBtp,
)
from synorix.skills.sidebar.recherche_format_references_chantiers import (  # noqa: F401
    RechercheFormatReferencesChantiers,
)
from synorix.skills.sidebar.recherche_bibliotheque_phrases_memoire import (  # noqa: F401
    RechercheBibliothequePhrasesMemoire,
)
from synorix.skills.sidebar.recherche_coffre_fort_pieces_administratives import (  # noqa: F401
    RechercheCoffreFortPiecesAdministratives,
)
from synorix.skills.sidebar.analyse_historique_ao_entreprise import (  # noqa: F401
    AnalyseHistoriqueAoEntreprise,
)
