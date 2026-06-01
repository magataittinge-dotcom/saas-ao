"""Synorix skills — memoire category (Step 4 : technical memo generation).

Importing this package self-registers every memoire skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.memoire.recuperation_profil_entreprise import (  # noqa: F401
    RecuperationProfilEntreprise,
)
from synorix.skills.memoire.selection_references_pertinentes import (  # noqa: F401
    SelectionReferencesPertinentes,
)
from synorix.skills.memoire.recuperation_bibliotheque_memoire import (  # noqa: F401
    RecuperationBibliothequeMemoire,
)
from synorix.skills.memoire.redacteur_preambule import RedacteurPreambule  # noqa: F401
from synorix.skills.memoire.redacteur_presentation_entreprise import (  # noqa: F401
    RedacteurPresentationEntreprise,
)
from synorix.skills.memoire.redacteur_equipe_dediee import RedacteurEquipeDediee  # noqa: F401
from synorix.skills.memoire.redacteur_references_chantiers import (  # noqa: F401
    RedacteurReferencesChantiers,
)
from synorix.skills.memoire.redacteur_presentation_prestation import (  # noqa: F401
    RedacteurPresentationPrestation,
)
