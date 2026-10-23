"""Mémoire rédigé en parallèle (0 API) : le préambule part SEUL (il écrit le
prompt cache), puis les parties A, B et C partent ENSEMBLE (elles le relisent).

Client Anthropic simulé : chaque appel dure 0,2 s. Vérifie l'ordre (le
préambule finit avant que les parties commencent), le chevauchement des
parties, la durée totale (≈ 2 appels au lieu de 4), l'avancement agrégé
(monotone, borné) et la remontée d'une erreur d'authentification.
"""

import json
import threading
import time
from types import SimpleNamespace

import anthropic
import httpx
import pytest

import services.ai.memoire_generator as mg
from services.ai.memoire_generator import MemoireGenerator, _MEMOIRE_SEGMENTS

DUREE_APPEL = 0.2


def _partie(instr: str) -> str:
    for k in ("partie_a", "partie_b", "partie_c"):
        if f"« {k} »" in instr:
            return k
    return "preambule"


class _FluxLent:
    def __init__(self, partie: str, journal: list, verrou: threading.Lock):
        self.partie, self.journal, self.verrou = partie, journal, verrou

    def __enter__(self):
        with self.verrou:
            self.journal.append(("debut", self.partie, time.monotonic()))
        return self

    def __exit__(self, *a):
        with self.verrou:
            self.journal.append(("fin", self.partie, time.monotonic()))
        return False

    @property
    def text_stream(self):
        sous = next(sub for k, sub in _MEMOIRE_SEGMENTS if k == self.partie)
        corps = ({"preambule": "Préambule."} if sous is None
                 else {self.partie: {s: f"contenu {s}" for s in sous}})
        texte = json.dumps(corps, ensure_ascii=False)
        moitie = len(texte) // 2
        time.sleep(DUREE_APPEL / 2)
        yield texte[:moitie]
        time.sleep(DUREE_APPEL / 2)
        yield texte[moitie:]

    def get_final_message(self):
        usage = SimpleNamespace(input_tokens=10, output_tokens=20,
                                cache_read_input_tokens=0, cache_creation_input_tokens=5)
        return SimpleNamespace(stop_reason="end_turn", usage=usage)


def _org():
    return SimpleNamespace(
        id="org", name="ENTREPRISE TEST", siret="12345678901234", address=None,
        historique=None, activites=None, organigramme=None,
        moyens_informatiques=None, vehicules=None, materiel=None, fournisseurs=None,
    )


async def _generer(gen, project_id=None):
    return await gen.generate(
        organization=_org(), memoire_config=None, project_name="Projet Test",
        maitre_ouvrage="MOA Test", selected_lot_name="Lot 05 — Façade – ITE",
        all_docs=[SimpleNamespace(type="cctp", file_name="cctp.pdf", extracted_text="Texte CCTP façade.")],
        compliance_items=[], references=[], variables={}, criteres_jugement=[],
        reference_template_text=None, project_id=project_id,
    )


def _brancher(monkeypatch, gen):
    journal, verrou = [], threading.Lock()

    def flux(**kwargs):
        return _FluxLent(_partie(kwargs["messages"][0]["content"][-1]["text"]), journal, verrou)

    monkeypatch.setattr(gen.client.messages, "stream", flux)
    return journal


@pytest.mark.asyncio
async def test_preambule_seul_puis_parties_en_parallele(monkeypatch):
    gen = MemoireGenerator()
    journal = _brancher(monkeypatch, gen)

    t0 = time.monotonic()
    resultat = await _generer(gen)
    duree = time.monotonic() - t0

    instant = {(e, p): t for e, p, t in journal}
    # le préambule (qui écrit le cache) finit avant que la 1re partie commence
    debuts_parties = [instant[("debut", k)] for k in ("partie_a", "partie_b", "partie_c")]
    assert instant[("fin", "preambule")] <= min(debuts_parties)
    # les trois parties se chevauchent : chacune commence avant la fin des autres
    fins_parties = [instant[("fin", k)] for k in ("partie_a", "partie_b", "partie_c")]
    assert max(debuts_parties) < min(fins_parties)
    # ≈ 2 appels (préambule + la plus longue partie) au lieu de 4 en séquence
    assert duree < 3 * DUREE_APPEL, f"{duree:.2f} s : les parties ne sont pas parallèles"
    # contrat de sortie intact, dans l'ordre des parties
    assert [s["segment"] for s in resultat["_generation_meta"]["segments"]] == [k for k, _ in _MEMOIRE_SEGMENTS]
    assert resultat["_generation_meta"]["mode"] == "per-partie-parallele"
    assert resultat["_generation_meta"]["warnings"] == []
    assert len(resultat["partie_a"]) == 11 and len(resultat["partie_c"]) == 7


@pytest.mark.asyncio
async def test_avancement_agrege_monotone_et_borne(monkeypatch):
    gen = MemoireGenerator()
    _brancher(monkeypatch, gen)
    publies = []
    monkeypatch.setattr(mg, "_safe_update_progress", lambda pid, r: publies.append(r))
    # publication à chaque morceau reçu (au lieu de toutes les 0,3 s)
    reel = time.time
    horloge = {"t": reel()}

    def avance():
        horloge["t"] += 1.0
        return horloge["t"]

    monkeypatch.setattr(mg.time, "time", avance)

    await _generer(gen, project_id="proj-parallele")

    assert publies, "aucun avancement publié"
    assert all(0.02 <= r <= 0.99 for r in publies)
    assert publies == sorted(publies), "l'avancement a reculé"
    assert publies[-1] >= 0.95


@pytest.mark.asyncio
async def test_erreur_d_authentification_dans_une_partie_remonte(monkeypatch):
    gen = MemoireGenerator()
    journal, verrou = [], threading.Lock()
    reponse = httpx.Response(401, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))

    def flux(**kwargs):
        partie = _partie(kwargs["messages"][0]["content"][-1]["text"])
        if partie == "partie_b":
            raise anthropic.AuthenticationError("clé refusée", response=reponse, body=None)
        return _FluxLent(partie, journal, verrou)

    monkeypatch.setattr(gen.client.messages, "stream", flux)
    with pytest.raises(anthropic.AuthenticationError):
        await _generer(gen)
