"""Synorix skills — chatbot category (Synorix Coach).

Importing this package self-registers every chatbot skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.chatbot.recherche_architecture_chatbot_saas_pro import (  # noqa: F401
    RechercheArchitectureChatbotSaasPro,
)
from synorix.skills.chatbot.recherche_mode_coaching_ao_btp import (  # noqa: F401
    RechercheModeCoachingAoBtp,
)
from synorix.skills.chatbot.recherche_suggestions_strategiques_ao import (  # noqa: F401
    RechercheSuggestionsStrategiquesAo,
)
from synorix.skills.chatbot.recherche_suivi_resultat_ao import (  # noqa: F401
    RechercheSuiviResultatAo,
)
from synorix.skills.chatbot.cotraitance_groupement import CotraitanceGroupement  # noqa: F401
