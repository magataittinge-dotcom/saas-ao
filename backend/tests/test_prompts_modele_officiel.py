"""
Invites d'analyse : le DC1 et le DC2 ne sont pas des « formulaires Cerfa ».

Source (vérifiée le 25/10/2026, notes nuit-25-10/B1, §« Côté écran ») : service-public
(fiches F32144 et F32106) classe le DC1, le DC2 et le DUME en « Modèle de document » ;
ils n'ont aucun numéro Cerfa. Les invites parlent de « modèles officiels du ministère
de l'Économie ». Test sur le texte seul, aucun appel.
"""
import re

import pytest

from services.ai import prompts

CERFA = re.compile(r"cerfa", re.IGNORECASE)


@pytest.mark.parametrize("nom", ["DCE_ANALYSIS_SYSTEM", "DCE_PASS1_SYSTEM"])
def test_invite_sans_cerfa_et_avec_modele_officiel(nom):
    texte = getattr(prompts, nom)
    assert not CERFA.findall(texte)
    assert "modèles officiels du ministère de l'Économie" in texte
