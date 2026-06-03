"""Tests (0 API) du découpage par partie de MemoireGenerator.

Mocke le client Anthropic (aucun appel réseau). Vérifie :
- 4 appels séquentiels (preambule, partie_a, partie_b, partie_c),
- `temperature` JAMAIS transmis (déprécié pour opus-4-7),
- `max_tokens` relevé (32000),
- assemblage au contrat de sortie {preambule, partie_a, partie_b, partie_c},
- récupération GRACIEUSE : une sous-section manquante → placeholder + warning,
  jamais de ValueError qui jetterait tout le mémoire.
"""

import json
from types import SimpleNamespace

import pytest

from services.ai.memoire_generator import (
    MemoireGenerator,
    _MEMOIRE_SEGMENTS,
    _MEMOIRE_SEGMENT_MODELS,
)


def _segment_of(instr: str) -> str:
    if "« partie_a »" in instr:
        return "partie_a"
    if "« partie_b »" in instr:
        return "partie_b"
    if "« partie_c »" in instr:
        return "partie_c"
    return "preambule"


class _FakeStream:
    def __init__(self, text: str, stop_reason: str = "end_turn"):
        self._text = text
        self._stop = stop_reason

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self):
        yield self._text

    def get_final_message(self):
        usage = SimpleNamespace(
            input_tokens=10, output_tokens=20,
            cache_read_input_tokens=0, cache_creation_input_tokens=5,
        )
        return SimpleNamespace(stop_reason=self._stop, usage=usage)


def _make_org():
    return SimpleNamespace(
        id="org", name="ENTREPRISE TEST", siret="12345678901234", address=None,
        historique=None, activites=None, organigramme=None,
        moyens_informatiques=None, vehicules=None, materiel=None, fournisseurs=None,
    )


def _subkeys(key: str) -> list[str]:
    return next(sub for k, sub in _MEMOIRE_SEGMENTS if k == key)


def _build_side_effect(*, drop_delai: bool = False):
    """Retourne une réponse JSON canonique selon la partie demandée.

    Si drop_delai=True, partie_c omet la sous-section 'delai' ET renvoie
    stop_reason=max_tokens → simule une troncature partielle (test gracieux).
    """
    calls = {"kwargs": []}

    def side_effect(**kwargs):
        calls["kwargs"].append(kwargs)
        instr = kwargs["messages"][0]["content"][-1]["text"]
        if "« partie_a »" in instr:
            body = {k: f"contenu {k}" for k in _subkeys("partie_a")}
            return _FakeStream(json.dumps({"partie_a": body}))
        if "« partie_b »" in instr:
            body = {k: f"contenu {k}" for k in _subkeys("partie_b")}
            return _FakeStream(json.dumps({"partie_b": body}))
        if "« partie_c »" in instr:
            sub = _subkeys("partie_c")
            if drop_delai:
                sub = [s for s in sub if s != "delai"]
            body = {k: f"contenu {k}" for k in sub}
            stop = "max_tokens" if drop_delai else "end_turn"
            return _FakeStream(json.dumps({"partie_c": body}), stop_reason=stop)
        # preambule
        return _FakeStream(json.dumps({"preambule": "Préambule de test."}))

    return side_effect, calls


async def _run(gen):
    return await gen.generate(
        organization=_make_org(),
        memoire_config=None,
        project_name="Projet Test",
        maitre_ouvrage="MOA Test",
        selected_lot_name="Lot 02 - Étanchéité - Couverture",
        all_docs=[SimpleNamespace(type="cctp", file_name="cctp.pdf", extracted_text="Texte CCTP étanchéité.")],
        compliance_items=[],
        references=[],
        variables={},
        criteres_jugement=[],
        reference_template_text=None,
        project_id=None,
    )


@pytest.mark.asyncio
async def test_four_calls_no_temperature_full_assembly(monkeypatch):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)

    result = await _run(gen)

    # 4 appels = une partie chacun
    assert len(calls["kwargs"]) == 4
    # temperature JAMAIS transmis ; max_tokens relevé
    for kw in calls["kwargs"]:
        assert "temperature" not in kw
        assert kw["max_tokens"] == 32000
    # contrat de sortie préservé
    assert set(["preambule", "partie_a", "partie_b", "partie_c"]).issubset(result.keys())
    assert result["preambule"] == "Préambule de test."
    # 26 sous-sections complètes, aucune manquante
    assert len(result["partie_a"]) == 11
    assert len(result["partie_b"]) == 7
    assert len(result["partie_c"]) == 7
    assert result["_generation_meta"]["warnings"] == []
    # aucun placeholder
    flat = json.dumps(result, ensure_ascii=False)
    assert "À RÉGÉNÉRER" not in flat


@pytest.mark.asyncio
async def test_caching_preserved_dynamic_block_cached(monkeypatch):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)

    await _run(gen)

    # Sur chaque appel : org + bloc DCE dynamique cachés, consigne segment NON cachée
    for kw in calls["kwargs"]:
        content = kw["messages"][0]["content"]
        assert content[0].get("cache_control") == {"type": "ephemeral"}  # org
        assert content[1].get("cache_control") == {"type": "ephemeral"}  # dynamic DCE
        assert "cache_control" not in content[-1]                         # consigne segment


@pytest.mark.asyncio
async def test_model_per_segment_and_cache_grouping(monkeypatch):
    """Chaque segment utilise le modèle du mapping centralisé. Le mapping étant
    configurable, on vérifie la cohérence (modèle appliqué = modèle mappé) et le
    regroupement cache : les segments d'un même modèle doivent être consécutifs
    (≤1 changement de modèle sur la séquence) pour partager le préfixe caché.
    Avec le mapping full-Sonnet courant : 4× Sonnet, 0 changement → 1 seul groupe
    cache. Le contexte caché (org + DCE) est présent à chaque appel."""
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)

    result = await _run(gen)

    # 1) bon modèle par segment (selon le mapping centralisé)
    seq = []
    for kw in calls["kwargs"]:
        seg = _segment_of(kw["messages"][0]["content"][-1]["text"])
        assert kw["model"] == _MEMOIRE_SEGMENT_MODELS[seg], (seg, kw["model"])
        seq.append(kw["model"])

    # 2) regroupement cache : segments d'un même modèle consécutifs → switches
    #    = (nb de modèles distincts - 1). Avec full-Sonnet : 0 switch, 1 groupe.
    switches = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
    distinct_models = len(set(seq))
    assert switches == distinct_models - 1, f"modèles non groupés (cache cassé): {seq}"

    # 3) contexte caché présent à chaque appel (org + DCE)
    for kw in calls["kwargs"]:
        content = kw["messages"][0]["content"]
        assert content[0].get("cache_control") == {"type": "ephemeral"}
        assert content[1].get("cache_control") == {"type": "ephemeral"}

    # 4) meta logge le modèle par segment
    assert result["_generation_meta"]["models"] == _MEMOIRE_SEGMENT_MODELS
    for s in result["_generation_meta"]["segments"]:
        assert s["model"] == _MEMOIRE_SEGMENT_MODELS[s["segment"]]


@pytest.mark.asyncio
async def test_graceful_recovery_missing_subsection(monkeypatch):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect(drop_delai=True)
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)

    result = await _run(gen)

    # Pas de ValueError : on récupère le partiel + placeholder sur 'delai'
    assert result["partie_c"]["delai"] == "[SECTION À RÉGÉNÉRER : partie_c.delai]"
    assert "partie_c.delai" in result["_generation_meta"]["warnings"]
    # les autres sous-sections de partie_c sont bien là
    assert result["partie_c"]["methodologie"] == "contenu methodologie"
    # le reste du mémoire est intact
    assert len(result["partie_a"]) == 11
    assert result["preambule"] == "Préambule de test."
