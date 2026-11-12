"""P2-2 (relecture du serveur, 12/11) — le bloc « exigences » de la relecture (B4) passe par un index des racines
du mémoire (préfixes) au lieu de comparer chaque racine à toutes celles de chaque paragraphe et de chaque section.

Le résultat doit être IDENTIQUE : l'ancien calcul est recopié ici tel quel (référence) et comparé au nouveau sur des
cas variés (racines courtes de 3 et 4 lettres, préfixes, préambule, listes, égalités, mémoire vide). Mots inventés.
"""
import random
import time

import pytest

from services import exigences_memoire as em


# ── Référence : l'ancien calcul, recopié tel qu'il était avant l'index ─────────────────────────────────────────────

def _communes_ref(exigence, texte):
    return sum(1 for r in exigence if any(em._meme_racine(r, t) for t in texte))


def _relier_ref(memoire, cible):
    total = len(cible)
    notes = [(_communes_ref(cible, p[4]), -i, p) for i, p in enumerate(memoire.paragraphes)]
    sections = [(_communes_ref(cible, r), -memoire.ordre[a], a) for a, r in memoire.par_section.items()]
    for avec_preambule in (False, True):
        permis = [n for n in notes if avec_preambule or n[2][0] != "preambule"]
        meilleur = max(permis, default=None)
        if meilleur and em._suffit(meilleur[0], total):
            return em._lien(meilleur[2])
        permises = [s for s in sections if avec_preambule or s[2] != "preambule"]
        proche = max(permises, default=None)
        if proche and em._suffit(proche[0], total):
            return em._lien(max(n for n in notes if n[2][0] == proche[2])[2])
    proche = max(sections, default=None)
    ancre = proche[2] if proche and proche[0] > 0 else None
    return {"statut": em.A_COUVRIR, "libelle": em._LIBELLES[em.A_COUVRIR], "ancre": ancre,
            "section": memoire.titres.get(ancre or ""), "paragraphe": None, "extrait": None}


def _relier_exigences_ref(contenu, exigences, monkeypatch):
    with monkeypatch.context() as m:
        m.setattr(em._Memoire, "relier", _relier_ref)
        return em.relier_exigences(contenu, exigences)


# ── Cas inventés ───────────────────────────────────────────────────────────────────────────────────────────────

def _vocabulaire(rng):
    """Des familles de mots qui se recouvrent par préfixe (« evacu », « evacuation », « evacues »…) et des mots courts."""
    lettres = "abcdefgilmnoprstuv"
    racines = ["".join(rng.choice(lettres) for _ in range(rng.randint(3, 6))) for _ in range(120)]
    mots = []
    for r in racines:
        mots.append(r)
        for _ in range(rng.randint(0, 3)):
            mots.append(r + "".join(rng.choice(lettres) for _ in range(rng.randint(1, 5))))
    mots += ["".join(rng.choice(lettres) for _ in range(n)) for n in (2, 3, 3, 4, 4, 4) for _ in range(15)]
    return mots


def _phrase(rng, vocab, n):
    return " ".join(rng.choice(vocab) for _ in range(n)) + "."


def _memoire(rng, vocab, sections, paragraphes, mots, fixe=False):
    from services.docx_exporter import _PART_A, _PART_B, _PART_C
    contenu = {"preambule": "\n".join(_phrase(rng, vocab, mots) for _ in range(2)),
               "partie_a": {}, "partie_b": {}, "partie_c": {}}
    cles = ([("partie_a", k) for k, _ in _PART_A] + [("partie_b", k) for k, _ in _PART_B]
            + [("partie_c", k) for k, _ in _PART_C])
    for partie, cle in cles[:sections]:
        contenu[partie][cle] = "\n".join(_phrase(rng, vocab, mots if fixe else rng.randint(2, mots))
                                          for _ in range(paragraphes))
    return contenu


def _exigences(rng, vocab, n):
    sortie = []
    for i in range(n):
        tirage = rng.random()
        if tirage < 0.3:
            texte = _phrase(rng, vocab, 4) + " comprenant : " + ", ".join(
                _phrase(rng, vocab, rng.randint(1, 3))[:-1] for _ in range(rng.randint(2, 5)))
        elif tirage < 0.45:
            texte = rng.choice(vocab)                                     # exigence d'un seul mot
        else:
            texte = _phrase(rng, vocab, rng.randint(2, 14))
        sortie.append({"id": f"e{i}", "texte": texte, "categorie": rng.choice(["offre", "criteres_notation"]),
                       "source": {"type": "exigence", "id": f"e{i}", "document": "RC.pdf", "page": 1}})
    return sortie


@pytest.mark.parametrize("graine", range(12))
def test_p2_2_meme_resultat_que_l_ancien_calcul(graine, monkeypatch):
    rng = random.Random(graine)
    vocab = _vocabulaire(rng)
    contenu = _memoire(rng, vocab, sections=rng.randint(0, 14), paragraphes=rng.randint(1, 8),
                       mots=rng.randint(3, 18))
    exigences = _exigences(rng, vocab, rng.randint(5, 40))
    attendu = _relier_exigences_ref(contenu, exigences, monkeypatch)
    assert em.relier_exigences(contenu, exigences) == attendu
    assert attendu, "le cas doit relier des exigences"


def test_p2_2_cas_limites_des_racines_courtes(monkeypatch):
    # 3 lettres / 4 lettres, préfixe de 4 lettres au moins, égalité d'un préambule et d'une partie.
    contenu = {"preambule": "abc abcd evacuation chantier",
               "partie_a": {"organisation": "abcd evac chantier\nevacuations des dechets tries"},
               "partie_b": {}, "partie_c": {}}
    exigences = [{"id": str(i), "texte": t, "categorie": "offre", "source": {"type": "exigence", "id": str(i)}}
                 for i, t in enumerate(["abc", "abcd", "evacuer dechets", "abcde", "zzz evacu",
                                        "le tri : evacuation, dechets, abc", "chantier abcd"])]
    assert em.relier_exigences(contenu, exigences) == _relier_exigences_ref(contenu, exigences, monkeypatch)
    assert em.relier_exigences({}, exigences) == _relier_exigences_ref({}, exigences, monkeypatch)


def test_p2_2_le_pire_cas_mesure_par_la_revue_passe_sous_une_seconde():
    """Banc de la revue (outils-revue/bench_relecture_b4.py) : 200 exigences sur 25 sections de 30 paragraphes de
    22 mots, vocabulaire tiré au hasard (pire cas) : 20 s avant l'index."""
    rng = random.Random(7)
    lettres = "abcdefghijlmnoprstuv"
    vocab = ["".join(rng.choice(lettres) for _ in range(rng.randint(5, 11))) for _ in range(4000)]
    contenu = _memoire(rng, vocab, sections=25, paragraphes=30, mots=22, fixe=True)
    exigences = _exigences(rng, vocab, 200)
    debut = time.perf_counter()
    em.relier_exigences(contenu, exigences)
    assert time.perf_counter() - debut < 1.0
