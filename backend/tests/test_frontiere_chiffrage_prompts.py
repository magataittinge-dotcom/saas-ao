"""
Frontière chiffrage (audit #5) — la règle produit « Synorix ne commente ni
ne conseille JAMAIS les prix » est désormais VERROUILLÉE dans les prompts
de génération (mémoire + réécriture de passage), comme elle l'est déjà
dans les services déterministes (trésorerie, dpgf_checker, typologie).
"""


def test_memoire_prompt_forbids_pricing_advice():
    from services.ai.prompts import MEMOIRE_GENERATION_SYSTEM

    assert "FRONTIÈRE CHIFFRAGE" in MEMOIRE_GENERATION_SYSTEM
    assert "JAMAIS de conseil" in MEMOIRE_GENERATION_SYSTEM
    assert "CHIFFRAGE" in MEMOIRE_GENERATION_SYSTEM
    # La nuance factuelle est préservée : citer un fait contractuel reste permis.
    assert "FAIT contractuel" in MEMOIRE_GENERATION_SYSTEM


def test_passage_rewriter_prompt_forbids_pricing_advice():
    from services.ai.passage_rewriter import _SYSTEM

    assert "PRIX" in _SYSTEM
    assert "CHIFFRAGE" in _SYSTEM
    assert "JAMAIS" in _SYSTEM
