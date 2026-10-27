"""Processus pdfium (T9) : isolé, plafonné en mémoire, avec un délai, recyclé.

Un seul processus par défaut (KVM 1 : 1 vCPU, 4 Go pour tout) ; un travail qui dépasse le
délai ou le plafond, ou qui fait planter l'enfant, lève TravailPdfiumEchoue : l'API reste debout.
"""
import os
import threading
import time

import pytest

from services import pdfium_processus as pp
from tests import pdfium_taches as t

MO = 1024 * 1024


@pytest.fixture(autouse=True)
def _processus_propres(monkeypatch):
    """Chaque test repart sans enfant, avec les réglages par défaut."""
    for nom in ("SYNORIX_PDFIUM_PROCESSUS", "SYNORIX_PDFIUM_AS_MO",
                "SYNORIX_PDFIUM_TACHES_MAX", "SYNORIX_PDFIUM_RSS_MAX_MO"):
        monkeypatch.delenv(nom, raising=False)
    pp.arreter()
    yield
    pp.arreter()


def test_la_fonction_s_execute_dans_un_autre_processus():
    assert pp.executer(t.ajouter, 2, 3, delai_s=60) == 5
    enfant = pp.executer(t.pid, delai_s=60)
    assert enfant != os.getpid()
    assert pp.executer(t.pid, delai_s=60) == enfant        # réutilisé tant qu'il est sain


def test_une_exception_de_la_fonction_est_relancee_et_l_enfant_reste():
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(ValueError, match="boum"):
        pp.executer(t.lever, "boum", delai_s=60)
    assert pp.executer(t.pid, delai_s=60) == avant


def test_au_delai_l_enfant_est_tue_et_remplace():
    avant = pp.executer(t.pid, delai_s=60)
    debut = time.monotonic()
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.dormir, 30, delai_s=1)
    assert e.value.raison == "delai"
    assert time.monotonic() - debut < 10
    assert pp.executer(t.pid, delai_s=60) != avant          # l'API continue avec un enfant neuf


def test_un_plantage_de_l_enfant_n_emporte_pas_l_appelant():
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.mourir, delai_s=60)
    assert e.value.raison == "plantage"
    assert pp.executer(t.pid, delai_s=60) != avant


def test_le_plafond_de_memoire_est_pose_dans_l_enfant(monkeypatch):
    assert pp.AS_MO_DEFAUT == 1536
    assert pp.executer(t.plafond_as, delai_s=60) == pp.AS_MO_DEFAUT * MO
    pp.arreter()
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "700")
    assert pp.executer(t.plafond_as, delai_s=60) == 700 * MO


def test_au_dela_du_plafond_refus_propre(monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "400")
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.allouer, 900, delai_s=60)
    assert e.value.raison == "memoire"
    assert pp.executer(t.pid, delai_s=60) != avant          # enfant remplacé, mémoire rendue
    assert pp.executer(t.allouer, 50, delai_s=60) == 50 * MO


def test_un_arret_natif_sous_plafond_est_dit_memoire_et_sans_plafond_plantage(monkeypatch):
    """Une bombe arrêtée par le plafond ne laisse pas de MemoryError : PDFium appelle abort() (SIGABRT).
    Avant : « plantage » ; maintenant « memoire » quand un plafond est posé (cause probable)."""
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.abandonner, delai_s=60)
    assert e.value.raison == "memoire" and "signal 6" in e.value.detail
    pp.arreter()
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "0")          # aucun plafond : rien ne dit que c'est la mémoire
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.abandonner, delai_s=60)
    assert e.value.raison == "plantage"


def test_l_enfant_ne_recoit_aucun_secret_de_l_api(monkeypatch):
    """L'enfant lit des fichiers hostiles : il ne reçoit que PATH, LANG, LC_ALL (avant : tout l'environnement
    de l'API, clés Anthropic et Stripe, URL de la base)."""
    secrets = {"ANTHROPIC_API_KEY": "sk-ant-factice-pdfium", "STRIPE_SECRET_KEY": "sk_live_factice_pdfium",
               "DATABASE_URL": "url-de-base-factice-pdfium", "SYNORIX_AUTRE": "valeur-factice-pdfium"}
    for k, v in secrets.items():
        monkeypatch.setenv(k, v)
    pp.arreter()
    env = pp.executer(t.environnement, delai_s=60)
    assert set(env) <= {"PATH", "LANG", "LC_ALL"}, sorted(env)
    assert not any(v in str(env) for v in secrets.values())


@pytest.mark.skipif(not os.path.exists("/proc/self/environ"), reason="/proc (Linux)")
def test_l_enfant_est_non_vidable_et_ne_lit_pas_l_environ_de_son_parent(monkeypatch):
    """PR_SET_DUMPABLE = 0 dans l'enfant. Et même sans durcissement du parent, l'enfant n'a de toute
    façon aucun secret à protéger (environnement minimal)."""
    assert pp.executer(t.dumpable, delai_s=60) == 0


def test_l_enfant_est_recycle_apres_n_taches(monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_TACHES_MAX", "3")
    pids = [pp.executer(t.pid, delai_s=60) for _ in range(7)]
    assert pids[0] == pids[1] == pids[2] != pids[3] == pids[4] == pids[5] != pids[6]


def test_recyclage_quand_la_memoire_residente_depasse_le_seuil(monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_RSS_MAX_MO", "1")      # tout enfant dépasse 1 Mo résident
    assert pp.executer(t.pid, delai_s=60) != pp.executer(t.pid, delai_s=60)


def test_un_seul_processus_par_defaut_les_travaux_se_suivent():
    assert pp.nombre_de_processus() == 1
    pids, debut = [], time.monotonic()

    def lancer():
        pids.append(pp.executer(t.dormir, 1, delai_s=60))

    fils = [threading.Thread(target=lancer) for _ in range(2)]
    [f.start() for f in fils]
    [f.join(60) for f in fils]
    assert pids == ["reveille", "reveille"]
    assert time.monotonic() - debut >= 2.0                    # sérialisés par le seul processus
    assert len(pp.etat()["enfants"]) == 1


def test_attente_bornee_si_le_processus_est_occupe():
    fil = threading.Thread(target=lambda: pp.executer(t.dormir, 2, delai_s=60))
    fil.start()
    time.sleep(0.5)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.pid, delai_s=60, attente_s=0.2)
    assert e.value.raison == "attente"
    fil.join(60)


def test_l_avancement_remonte_dans_le_thread_de_l_appelant():
    recus = []
    assert pp.executer(t.compter, 4, delai_s=60, sur_progression=recus.append) == 4
    assert recus == [("etape", i) for i in range(4)]


def test_resultat_non_transmissible_donne_une_erreur_sans_tuer_l_enfant():
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(RuntimeError):
        pp.executer(t.non_transmissible, delai_s=60)
    assert pp.executer(t.pid, delai_s=60) == avant


def test_zero_processus_execute_directement(monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_PROCESSUS", "0")
    assert pp.executer(t.pid, delai_s=1) == os.getpid()


# ─── Attente bornée (équité entre organisations : un gros dépôt ne bloque pas les autres) ───

def _occuper(secondes):
    fil = threading.Thread(target=lambda: pp.executer(t.dormir, secondes, delai_s=60, attente_s=30))
    fil.start()
    time.sleep(0.7)            # laisse l'enfant démarrer et prendre la tâche
    return fil


def test_attente_interactive_bornee_par_defaut(monkeypatch):
    """Sans `attente_s`, l'appel n'attend PAS indéfiniment : quelques secondes, puis échec propre."""
    assert 1 <= pp.ATTENTE_INTERACTIF_S <= 10
    monkeypatch.setenv("SYNORIX_PDFIUM_ATTENTE_S", "1")
    fil = _occuper(5)
    debut = time.monotonic()
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.pid, delai_s=60)
    assert e.value.raison == "attente"
    assert time.monotonic() - debut < 3
    fil.join(60)


def test_attente_extraction_reglable_et_plus_longue(monkeypatch):
    assert pp.ATTENTE_EXTRACTION_S > pp.ATTENTE_INTERACTIF_S
    assert pp.attente_extraction_s() == pp.ATTENTE_EXTRACTION_S
    monkeypatch.setenv("SYNORIX_PDFIUM_ATTENTE_EXTRACTION_S", "42")
    assert pp.attente_extraction_s() == 42


def test_le_delai_d_un_petit_fichier_reste_court(tmp_path):
    from services import extraction_processus as ep
    petit = tmp_path / "RC.pdf"
    petit.write_bytes(b"x" * 200_000)
    assert ep.delai_extraction_s(str(petit)) <= 60            # un petit fichier ne tient pas le processus 2 min
    gros = tmp_path / "DT.pdf"
    with open(gros, "wb") as f:
        f.truncate(83 * 1024 * 1024)                          # le DT SIEM de Gueux : 83 Mo
    assert 250 <= ep.delai_extraction_s(str(gros)) <= ep.DELAI_MAX_S


def test_extraction_attente_bornee_pendant_un_gros_travail(tmp_path, monkeypatch):
    from services import extraction_processus as ep
    monkeypatch.setenv("SYNORIX_PDFIUM_ATTENTE_EXTRACTION_S", "1")
    chemin = tmp_path / "CCTP.pdf"
    chemin.write_bytes(b"x")
    fil = _occuper(5)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        ep.extraire_en_processus(str(chemin), "CCTP.pdf", "doc")
    assert e.value.raison == "attente"
    assert "CCTP.pdf" in ep.avertissement_travail("CCTP.pdf", e.value)
    fil.join(60)


def test_reponse_503_avec_retry_after_pour_une_route():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from services.pdfium_http import installer_gestionnaire

    app = FastAPI()
    installer_gestionnaire(app)

    @app.get("/apercu")
    def apercu():
        raise pp.TravailPdfiumEchoue("attente", "aucun processus PDF libre en 5 s")

    reponse = TestClient(app).get("/apercu")
    assert reponse.status_code == 503
    assert int(reponse.headers["retry-after"]) >= 1
    corps = reponse.json()["detail"]
    assert "réessayez" in corps.lower() and "manquant" not in corps and "absent" not in corps


def test_l_appli_installe_le_gestionnaire_503():
    from main import app
    assert pp.TravailPdfiumEchoue in app.exception_handlers
