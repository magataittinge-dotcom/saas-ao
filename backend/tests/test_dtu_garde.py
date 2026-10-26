"""Tranche DTU 3 — garde-fou déterministe après génération : tout DTU cité hors de
la liste autorisée est retiré proprement, jamais remplacé par un autre DTU.
Chaînes inventées, 0 appel réseau."""
import json
import re

import pytest

from services.ai.dtu_autorises import appliquer_garde_dtu, retire_dtu_non_autorises


def _r(texte, ok=("41.2",)):
    return retire_dtu_non_autorises(texte, set(ok))


def test_un_autorise_deux_non_autorises_phrase_lisible():
    texte = ("La pose est conforme au NF DTU 41.2 et au NF DTU 52.2. "
             "Le support est préparé selon le DTU 59.1 (NF DTU 59.1).")
    out, retires = _r(texte)
    assert out == ("La pose est conforme au NF DTU 41.2 et aux règles de l'art. "
                   "Le support est préparé selon les règles de l'art.")
    assert retires == ["52.2", "59.1", "59.1"]


def test_parentheses_supprimee_avec_son_espace():
    out, retires = _r("Bardage ventilé (NF DTU 52.2 P1-1) posé sur ossature.")
    assert out == "Bardage ventilé posé sur ossature."
    assert retires == ["52.2"]


def test_article_et_renvoi_a_un_paragraphe_consommes():
    out, _ = _r("Travaux conformément au NF DTU 52.2 §5.2, puis contrôle.")
    assert out == "Travaux conformément aux règles de l'art, puis contrôle."
    out, _ = _r("Exécution en application du DTU 52.2 P1-1.")
    assert out == "Exécution en application des règles de l'art."
    out, _ = _r("Pose conforme à la norme NF DTU 52.2.")
    assert out == "Pose conforme aux règles de l'art."


def test_liste_mixte_on_ne_retire_que_le_non_autorise():
    out, retires = _r("Références : NF DTU 41.2, NF DTU 52.2, NF DTU 59.1.", ok=("41.2", "59.1"))
    assert out == "Références : NF DTU 41.2, NF DTU 59.1."
    assert retires == ["52.2"]
    out, _ = _r("Références : NF DTU 52.2, NF DTU 41.2 (bardage), Avis Technique.")
    assert out == "Références : NF DTU 41.2 (bardage), Avis Technique."
    out, _ = _r("Références : NF DTU 41.2, NF DTU 52.2 (carrelage), Avis Technique.")
    assert out == "Références : NF DTU 41.2, Avis Technique."


def test_enumeration_nue_et_cellule_de_tableau():
    out, _ = _r("Les DTU 41.2 et 52.2 s'appliquent.")
    assert out == "Les DTU 41.2 s'appliquent."
    out, _ = _r("| Enduits | NF DTU 52.2 |")
    assert out == "| Enduits | règles de l'art |"
    out, _ = _r("| Enduits | NF EN 998, CPT 3035 V3, NF DTU 52.2 |")
    assert out == "| Enduits | NF EN 998, CPT 3035 V3 |"


def test_puce_en_gras_avec_glose_retiree_en_entier():
    texte = ("- **NF DTU 41.2** — bardage bois ; **NF DTU 52.2** — carrelage collé ; **NF DTU 41.2** — encore ;\n"
             "- **NF DTU 52.2** — carrelage collé ;\n- **NF DTU 41.2** — fin")
    out, retires = _r(texte)
    assert out == ("- **NF DTU 41.2** — bardage bois ; **NF DTU 41.2** — encore ;\n"
                   "- **NF DTU 41.2** — fin")
    assert retires == ["52.2", "52.2"]


def test_aucun_dtu_de_remplacement_ni_texte_inchange_si_tout_est_autorise():
    texte = "Pose selon NF DTU 41.2 puis NF DTU 52.2 P1-1."
    assert _r(texte, ok=("41.2", "52.2")) == (texte, [])
    out, _ = _r("Selon le NF DTU 52.2 et le NF DTU 59.1 §3.")
    assert not re.search(r"\d{2}\.\d", out)


def test_deux_retraits_voisins_ne_se_repetent_pas():
    out, _ = _r("Conformément au DTU 52.2 et au DTU 59.1, la pose est faite.")
    assert out == "Conformément aux règles de l'art, la pose est faite."


def test_applique_au_memoire_compte_et_liste_les_retraits():
    memo = {
        "preambule": "Selon NF DTU 41.2 et NF DTU 99.9.",
        "partie_a": {"x": "Conforme au DTU 88.8.", "y": 3},
        "partie_c": {"m": "Pose NF DTU 41.2."},
        "_generation_meta": {"warnings": []},
    }
    meta = appliquer_garde_dtu(memo, {"41.2"})
    assert memo["preambule"] == "Selon NF DTU 41.2."
    assert memo["partie_a"]["x"] == "Conforme aux règles de l'art."
    assert memo["partie_a"]["y"] == 3
    assert memo["partie_c"]["m"] == "Pose NF DTU 41.2."
    assert meta == {"autorises": ["41.2"], "retraits": 2, "retires": ["88.8", "99.9"]}
    assert "DTU 88.8" not in json.dumps(meta)


@pytest.mark.asyncio
async def test_generate_applique_le_garde_fou_et_trace_dans_la_meta(monkeypatch):
    from types import SimpleNamespace
    from services.ai.memoire_generator import MemoireGenerator
    from tests.test_memoire_generator_segments import _FakeStream, _make_org, _subkeys

    def side_effect(**kw):
        instr = kw["messages"][0]["content"][-1]["text"]
        if "« partie_a »" in instr:
            return _FakeStream(json.dumps({"partie_a": {k: "Selon NF DTU 41.2 et NF DTU 77.7." for k in _subkeys("partie_a")}}))
        if "« partie_b »" in instr:
            return _FakeStream(json.dumps({"partie_b": {k: "ok" for k in _subkeys("partie_b")}}))
        if "« partie_c »" in instr:
            return _FakeStream(json.dumps({"partie_c": {k: "ok" for k in _subkeys("partie_c")}}))
        return _FakeStream(json.dumps({"preambule": "Préambule."}))

    gen = MemoireGenerator()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)
    res = await gen.generate(
        organization=_make_org(), memoire_config=None, project_name="P", maitre_ouvrage="M",
        selected_lot_name="Lot 05", compliance_items=[], references=[], variables={},
        criteres_jugement=[], reference_template_text=None, project_id=None,
        all_docs=[SimpleNamespace(type="cctp", file_name="c.pdf", related_lots=["5"],
                                  extracted_text="Prescription : NF DTU 41.2.")])
    assert res["partie_a"][_subkeys("partie_a")[0]] == "Selon NF DTU 41.2."
    assert res["_generation_meta"]["dtu"] == {
        "autorises": ["41.2"], "retraits": 11, "retires": ["77.7"]}


def test_garde_fou_en_temps_lineaire():
    import time
    texte = ("Selon le NF DTU 99.1, NF DTU 99.2 ; " + "x" * 50 + " (DTU 99.3) \n") * 20000 + "DTU" + " " * 100000
    t0 = time.monotonic()
    out, retires = _r(texte)
    assert time.monotonic() - t0 < 5
    assert len(retires) == 60000 and "99." not in out
