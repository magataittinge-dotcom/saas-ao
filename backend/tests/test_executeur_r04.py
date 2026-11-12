"""R-04 (audit données, solidité, coûts) — l'exécuteur par défaut d'`asyncio.to_thread` a `min(32, cpu + 4)` fils :
5 sur le serveur à 1 vCPU, partagés par tous les appels courts à l'IA (10 à 60 s), les copies vers le coffre et les
aperçus PDF. Au démarrage, l'API pose un exécuteur nommé et borné (`SYNORIX_FILS_TO_THREAD`, 16 par défaut : ces fils
attendent le réseau ou un processus PDFium, pas le CPU). Aucun appel réel."""
import asyncio
import os
import time

import pytest

from services import executeur


@pytest.fixture
def un_vcpu(monkeypatch):
    monkeypatch.setattr(os, "cpu_count", lambda: 1)


def _sept_appels(installer: bool) -> float:
    """Six `to_thread` lents (2 s) en vol, puis un court : durée du court, en secondes."""
    async def scenario():
        if installer:
            executeur.installer()
        lents = [asyncio.create_task(asyncio.to_thread(time.sleep, 2.0)) for _ in range(6)]
        await asyncio.sleep(0.05)
        t0 = time.monotonic()
        await asyncio.to_thread(lambda: None)
        duree = time.monotonic() - t0
        await asyncio.gather(*lents)
        return duree
    return asyncio.run(scenario())


def test_sans_reglage_un_vcpu_le_septieme_attend(un_vcpu):
    assert _sept_appels(installer=False) > 1.0          # le constat : 5 fils, le 7e attend qu'un lent finisse


def test_avec_reglage_le_septieme_passe_tout_de_suite(un_vcpu):
    assert _sept_appels(installer=True) < 1.0


def test_taille_reglable_et_bornee(monkeypatch):
    monkeypatch.delenv("SYNORIX_FILS_TO_THREAD", raising=False)
    assert executeur.taille() == 16
    monkeypatch.setenv("SYNORIX_FILS_TO_THREAD", "24")
    assert executeur.taille() == 24
    for illisible in ("0", "-3", "abc", ""):
        monkeypatch.setenv("SYNORIX_FILS_TO_THREAD", illisible)
        assert executeur.taille() == 16
    monkeypatch.setenv("SYNORIX_FILS_TO_THREAD", "500")
    assert executeur.taille() == 64


def test_l_executeur_pose_est_nomme_et_de_la_bonne_taille(monkeypatch):
    monkeypatch.setenv("SYNORIX_FILS_TO_THREAD", "12")

    async def scenario():
        pool = executeur.installer()
        nom = await asyncio.to_thread(lambda: __import__("threading").current_thread().name)
        return pool, nom
    pool, nom = asyncio.run(scenario())
    assert pool._max_workers == 12
    assert nom.startswith("synorix-to-thread")


def test_l_api_le_pose_au_demarrage():
    """Le cycle de vie de l'application (uvicorn, TestClient en contexte) installe l'exécuteur."""
    from fastapi.testclient import TestClient
    from main import app
    vus = []
    reel = executeur.installer

    def espion(*a, **kw):
        pool = reel(*a, **kw)
        vus.append(pool._max_workers)
        return pool
    executeur.installer = espion
    try:
        with TestClient(app):
            pass
    finally:
        executeur.installer = reel
    assert vus == [executeur.taille()]
