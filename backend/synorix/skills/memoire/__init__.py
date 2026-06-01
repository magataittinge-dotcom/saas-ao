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
from synorix.skills.memoire.redacteur_methodologie import RedacteurMethodologie  # noqa: F401
from synorix.skills.memoire.redacteur_securite_ppsps import RedacteurSecuritePpsps  # noqa: F401
from synorix.skills.memoire.redacteur_environnement_soged import (  # noqa: F401
    RedacteurEnvironnementSoged,
)
from synorix.skills.memoire.redacteur_qualite_paq import RedacteurQualitePaq  # noqa: F401
from synorix.skills.memoire.redacteur_planning_gantt import RedacteurPlanningGantt  # noqa: F401
from synorix.skills.memoire.generateur_organigramme import GenerateurOrganigramme  # noqa: F401
from synorix.skills.memoire.generateur_planning_gantt_option import (  # noqa: F401
    GenerateurPlanningGanttOption,
)
from synorix.skills.memoire.generateur_photos_references import (  # noqa: F401
    GenerateurPhotosReferences,
)
from synorix.skills.memoire.generateur_ppsps import GenerateurPpsps  # noqa: F401
from synorix.skills.memoire.generateur_soged import GenerateurSoged  # noqa: F401
from synorix.skills.memoire.generateur_paq import GenerateurPaq  # noqa: F401
from synorix.skills.memoire.generateur_note_innovation import (  # noqa: F401
    GenerateurNoteInnovation,
)
from synorix.skills.memoire.generateur_note_rse import GenerateurNoteRse  # noqa: F401
