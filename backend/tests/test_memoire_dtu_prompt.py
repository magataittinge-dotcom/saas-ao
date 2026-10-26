"""Tranche DTU 2 — la consigne anti-invention ne laisse citer un DTU que s'il est
dans la liste autorisée, et cette liste voyage dans le bloc variable (jamais dans
le préfixe stable caché). 0 appel réseau, chaînes inventées."""
from types import SimpleNamespace

import pytest

from services.ai.dtu_autorises import dtu_autorises
from services.ai.memoire_generator import MemoireGenerator, formater_liste_dtu
from services.ai.prompts import MEMOIRE_GENERATION_SYSTEM
from tests.test_memoire_generator_segments import _build_side_effect, _make_org


def _docs():
    return [
        SimpleNamespace(type="cctp", file_name="cctp lot 5.pdf", related_lots=["5"],
                        extracted_text="Pied de page / Page 1 / 2 \nRien.\nPied de page / Page 2 / 2 \nPose selon NF DTU 41.2."),
        SimpleNamespace(type="autre", file_name="annexe 00.pdf", related_lots=["0"],
                        extracted_text="Voir NF DTU 20.1 P1-1."),
    ]


def test_liste_formatee_avec_piece_et_page():
    bloc = formater_liste_dtu(dtu_autorises(_docs()))
    assert "NF DTU 20.1" in bloc and "NF DTU 41.2" in bloc
    assert "cctp lot 5.pdf" in bloc and "p. 2" in bloc
    assert "annexe 00.pdf" in bloc


def test_liste_vide_interdit_toute_citation():
    bloc = formater_liste_dtu({})
    assert "aucun" in bloc.lower() and "DTU" in bloc


def test_consigne_anti_invention_est_une_liste_fermee():
    s = MEMOIRE_GENERATION_SYSTEM
    assert "LISTE DES DTU AUTORISÉS" in s
    assert "citer tout ce qui EXISTE dans le corpus" not in s
    assert "CITE SYSTÉMATIQUEMENT" not in s
    assert "qui doivent rester cités dès qu'ils figurent dans le corpus" not in s
    # les autres normes : même règle (CCTP du lot ou pièces communes)
    assert "NF EN" in s and "Avis Technique" in s


@pytest.mark.asyncio
async def test_liste_dans_le_bloc_variable_pas_dans_le_prefixe_stable(monkeypatch):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)
    await gen.generate(
        organization=_make_org(), memoire_config=None, project_name="P", maitre_ouvrage="M",
        selected_lot_name="Lot 05 - Façade", all_docs=_docs(), compliance_items=[],
        references=[], variables={}, criteres_jugement=[], reference_template_text=None,
        project_id=None)
    assert len(calls["kwargs"]) == 4
    for kw in calls["kwargs"]:
        content = kw["messages"][0]["content"]
        assert "LISTE DES DTU AUTORISÉS" in content[1]["text"]       # bloc variable
        assert "NF DTU 41.2" in content[1]["text"]
        stable = [b["text"] for b in kw["system"]] + [content[0]["text"]]
        assert not any("NF DTU 41.2" in t and "p. 2" in t for t in stable)
