"""Synorix skills — expert_metier category (corps de métier BTP experts).

Importing this package self-registers every expert skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.expert_metier.expert_cvc import ExpertCVC  # noqa: F401
from synorix.skills.expert_metier.expert_electricite import ExpertElectricite  # noqa: F401
from synorix.skills.expert_metier.expert_facade import ExpertFacade  # noqa: F401
from synorix.skills.expert_metier.expert_gros_oeuvre import ExpertGrosOeuvre  # noqa: F401
from synorix.skills.expert_metier.expert_ite import ExpertITE  # noqa: F401
from synorix.skills.expert_metier.expert_peinture import ExpertPeinture  # noqa: F401
from synorix.skills.expert_metier.expert_plomberie import ExpertPlomberie  # noqa: F401
from synorix.skills.expert_metier.expert_vrd import ExpertVRD  # noqa: F401
