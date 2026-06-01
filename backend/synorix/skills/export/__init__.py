"""Synorix skills — export category (Step 6 : export / submission).

Importing this package self-registers every export skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.export.recherche_format_zip_ao_pro import (  # noqa: F401
    RechercheFormatZipAoPro,
)
from synorix.skills.export.recherche_page_garde_memoire import (  # noqa: F401
    RecherchePageGardeMemoire,
)
from synorix.skills.export.recherche_checklist_depot_plateforme import (  # noqa: F401
    RechercheChecklistDepotPlateforme,
)
from synorix.skills.export.recherche_suivi_post_depot import (  # noqa: F401
    RechercheSuiviPostDepot,
)
from synorix.skills.export.conseil_recours_eviction import ConseilRecoursEviction  # noqa: F401
