"""
Invites d'analyse : plus de règle de signature fausse (mission V, tranche 5).

Sources (vérifiées le 25/10/2026, notes nuit-25-10/B1 §2 lignes 9-10 et §5) :
  • service-public F32144 et F32106 : la réglementation n'impose pas que le
    DUME ni les formulaires DC1, DC2 soient signés ; l'acheteur peut l'exiger
    dans les documents de la consultation ;
  • ATTRI1, R17445, F23784 : l'acte d'engagement se signe à l'attribution.
Les invites disaient « Compléter, dater et signer le formulaire DC1 »,
« AE non signé = irrecevable »… : l'IA reformulait chaque pièce avec
« signer » et en faisait une règle. Test sur le texte seul, aucun appel.
"""
import re

import pytest

from services.ai import prompts

FAUX = re.compile(
    r"dater et signer|et signer le formulaire|signer l'acte d'engagement|AE non signé"
    r"|AE/ATTRI1 signé|\(Lettre de candidature\) signé|complété, daté et signé"
    r"|complété, daté et signé par le candidat|à compléter et signer|à compléter, dater, signer",
    re.IGNORECASE,
)


@pytest.mark.parametrize("nom", ["DCE_ANALYSIS_SYSTEM", "DCE_PASS1_SYSTEM"])
def test_aucune_signature_imposee_par_defaut(nom):
    texte = getattr(prompts, nom)
    assert not FAUX.findall(texte), FAUX.findall(texte)


@pytest.mark.parametrize("nom", ["DCE_ANALYSIS_SYSTEM", "DCE_PASS1_SYSTEM"])
def test_la_vraie_regle_est_dite(nom):
    texte = getattr(prompts, nom)
    assert "se signe à l'attribution" in texte
    assert "sauf si le RC" in texte
