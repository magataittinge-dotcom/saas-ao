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
