"""Tests du correctif de troncature DCE (Option A — chunking).

Contexte : avant, `analysis.py` coupait le CCAP à 30 000 chars (`text[:cap]`),
perdant ~71 % des exigences d'un CCAP de 120k (assurances, pénalités, DOE…).
Cf. docs/rag/PHASE0-investigation-troncature.md.

Le correctif envoie le document ENTIER, découpé en tranches par l'analyzer
(`_split_into_chunks` / `_split_segments` / `_build_call_texts`) puis fusionné
et dédupliqué (`_dedup_requirements`). Ces fonctions sont PURES → testées ici
sans aucun appel API.
"""
import re
from pathlib import Path

import pytest

from services.ai.dce_analyzer import (
    _split_into_chunks,
    _split_segments,
    _build_call_texts,
    _dedup_requirements,
    _CHUNK_CHARS,
)

# Chemin du CCAP de Gueux (texte réellement envoyé au modèle lors du test A/B)
_CCAP = Path(__file__).resolve().parents[2] / "docs" / "comparaison-AB" / "_input_CCAP.txt"


# ── _split_into_chunks ────────────────────────────────────────────────────────

def test_short_text_single_chunk():
    assert _split_into_chunks("petit texte") == ["petit texte"]


def test_empty_text_no_chunk():
    assert _split_into_chunks("") == []
    assert _split_into_chunks("   \n  ") == []


def test_chunks_respect_max_size():
    text = "a" * 100_000
    chunks = _split_into_chunks(text, max_chars=10_000, overlap=500)
    assert len(chunks) > 1
    assert all(len(c) <= 10_000 for c in chunks)


def test_chunks_cover_100_percent_of_text():
    """Aucun caractère ne doit être perdu : chaque position du texte original
    doit être présente dans au moins une tranche (couverture totale)."""
    # Texte avec des frontières de ligne réalistes.
    text = "\n".join(f"ligne {i} " + "x" * 80 for i in range(3000))
    chunks = _split_into_chunks(text, max_chars=5_000, overlap=200)
    # Marqueurs uniques disséminés du début à la toute fin.
    for i in range(0, 3000, 137):
        marker = f"ligne {i} "
        assert any(marker in c for c in chunks), f"perdu: {marker!r}"
    # La toute fin du document doit être couverte (régression "fin tronquée").
    assert text[-200:] in "".join(chunks) or any(text[-200:] in c for c in chunks)


def test_overlap_creates_boundary_redundancy():
    text = ("phrase. " * 20_000)
    chunks = _split_into_chunks(text, max_chars=8_000, overlap=300)
    assert len(chunks) >= 2
    # Le recouvrement => la somme des longueurs dépasse l'original.
    assert sum(len(c) for c in chunks) > len(text)


# ── _split_segments ───────────────────────────────────────────────────────────

def test_split_segments_parses_doc_headers():
    text = "=== RC — a.pdf ===\ncorps rc\n=== CCAP — b.pdf ===\ncorps ccap"
    segs = _split_segments(text)
    assert [h for h, _ in segs] == ["=== RC — a.pdf ===", "=== CCAP — b.pdf ==="]
    assert "corps rc" in segs[0][1]
    assert "corps ccap" in segs[1][1]


def test_split_segments_no_header():
    segs = _split_segments("juste du texte sans entête")
    assert len(segs) == 1
    assert segs[0][0] == ""


# ── _build_call_texts ─────────────────────────────────────────────────────────

def test_build_call_texts_reinjects_header_in_every_chunk():
    """Chaque tranche d'un gros document doit reporter l'en-tête du document
    → l'attribution source_document reste correcte même au milieu du doc."""
    big = "=== CCAP — x.pdf ===\n" + ("mot " * 40_000)  # > _CHUNK_CHARS
    calls = _build_call_texts(big)
    assert len(calls) > 1
    assert all(c.startswith("=== CCAP — x.pdf ===") for c in calls)


def test_build_call_texts_small_doc_single_call():
    calls = _build_call_texts("=== RC — a.pdf ===\npetit corps")
    assert len(calls) == 1


# ── _dedup_requirements ───────────────────────────────────────────────────────

def test_dedup_removes_boundary_duplicates_stable_order():
    reqs = [
        {"exigence": "Fournir attestation URSSAF"},
        {"exigence": "  fournir   ATTESTATION urssaf  "},   # même, casse/espaces
        {"exigence": "Assurance décennale"},
    ]
    out = _dedup_requirements(reqs)
    assert [r["exigence"] for r in out] == ["Fournir attestation URSSAF", "Assurance décennale"]


def test_dedup_drops_empty_and_non_dict():
    assert _dedup_requirements([{"exigence": ""}, "x", {"foo": 1}]) == []


# ── Preuve de couverture sur le CCAP réel de Gueux (0 appel API) ──────────────

@pytest.mark.skipif(not _CCAP.exists(), reason="CCAP Gueux indisponible")
def test_gueux_ccap_lost_content_now_sent_to_model():
    """Régression directe du bug : les exigences situées au-delà du cap 30k
    (assurance 8 M€, pénalités 300 €, Chorus Pro, DOE/récolement) doivent
    désormais être présentes dans les textes envoyés au modèle."""
    ccap = _CCAP.read_text(encoding="utf-8", errors="replace")
    assert len(ccap) > 100_000  # ~120k

    # Assemblage façon production (analysis.py) : en-tête doc + texte ENTIER.
    pass1_text = f"=== CCAP — 2829 - CCAP.pdf ===\n{ccap}"
    calls = _build_call_texts(pass1_text)
    joined = "\n".join(calls)

    lost_beyond_30k = ["8 M€", "300 €", "Chorus", "récolement", "Tous dommages confondus"]
    for needle in lost_beyond_30k:
        assert needle in joined, f"contenu critique toujours absent: {needle!r}"
        # Et il était bien au-delà de l'ancien cap (sinon le test ne prouve rien).
        assert ccap.find(needle) > 30_000


@pytest.mark.skipif(not _CCAP.exists(), reason="CCAP Gueux indisponible")
def test_old_cap_would_have_dropped_that_content():
    """Contre-preuve : l'ancien comportement (text[:30000]) ne contenait PAS
    ce contenu critique → confirme que le correctif change réellement les choses."""
    ccap = _CCAP.read_text(encoding="utf-8", errors="replace")
    old_capped = ccap[:30_000]
    for needle in ["8 M€", "300 €", "Chorus", "récolement"]:
        assert needle not in old_capped


@pytest.mark.skipif(not _CCAP.exists(), reason="CCAP Gueux indisponible")
def test_gueux_ccap_chunk_count_reasonable():
    """Le CCAP 120k doit produire un petit nombre de tranches (coût/latence
    maîtrisés), pas une explosion."""
    ccap = _CCAP.read_text(encoding="utf-8", errors="replace")
    calls = _build_call_texts(f"=== CCAP — x.pdf ===\n{ccap}")
    expected = (len(ccap) // _CHUNK_CHARS) + 2
    assert 2 <= len(calls) <= expected
