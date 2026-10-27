"""Canal enfant -> parent (bloc 6, revue de sécurité) : le parent ne fait JAMAIS ``pickle.loads`` sur les octets
d'un enfant PDFium. On part de l'hypothèse qu'un fichier piégé prend le contrôle de l'enfant."""
import multiprocessing as mp
import os
import pickle
import time

import pytest

from services import canal_enfant as canal
from services import pdfium_processus as pp
from tests import pdfium_taches as t

MO = 1024 * 1024


@pytest.fixture(autouse=True)
def _processus_propres(monkeypatch):
    for nom in ("SYNORIX_PDFIUM_PROCESSUS", "SYNORIX_PDFIUM_AS_MO", "SYNORIX_PDFIUM_TACHES_MAX"):
        monkeypatch.delenv(nom, raising=False)
    pp.arreter()
    yield
    pp.arreter()


# ─── Le filtre, en direct ────────────────────────────────────────────────────

def test_temoin_le_pickle_ordinaire_executerait_le_piege(tmp_path):
    """Sans le filtre (``Connection.recv``), le pickle forgé s'exécute : le test suivant a donc un sens."""
    temoin = tmp_path / "temoin"
    a, b = mp.Pipe()
    a.send_bytes(pickle.dumps(t._Piege(f"touch '{temoin}'"), protocol=4))
    b.recv()
    assert temoin.exists()


@pytest.mark.parametrize("charge", [
    lambda tmp: (os.system, (f"touch '{tmp}/x'",)),
    lambda tmp: (eval, (f"open('{tmp}/x','w')",)),
    lambda tmp: (getattr, ("abc", "upper")),
    lambda tmp: (__import__("subprocess").Popen, (["touch", f"{tmp}/x"],)),
    lambda tmp: (open, (f"{tmp}/x", "w")),
], ids=["os.system", "eval", "getattr", "subprocess", "open"])
def test_un_pickle_forge_est_refuse_sans_rien_executer(tmp_path, charge):
    class Piege:
        def __reduce__(self):
            return charge(tmp_path)

    forge = pickle.dumps(("ok", Piege(), 0), protocol=4)
    with pytest.raises(canal.MessageRefuse):
        canal.decoder(forge)
    assert not (tmp_path / "x").exists()


def test_les_types_de_base_et_les_exceptions_listees_passent():
    from services.pdf_lecture import PdfIllisible
    from services.pdf_rendu import PageHorsBornes
    message = ("ok", ("texte", 3, None, [["a", "b"], ["c"]], {"k": [1.5, True, b"\x00\xff"]}, {1, 2}, frozenset({3})), 12)
    assert canal.decoder(pickle.dumps(message, protocol=4)) == message
    for exc in (ValueError("x"), MemoryError(), FileNotFoundError(2, "absent", "/x"), PdfIllisible(3, "d"),
                PageHorsBornes("p"), UnicodeDecodeError("utf-8", b"\xff", 0, 1, "m")):
        assert canal.exception_autorisee(exc)
        rendu = canal.decoder(pickle.dumps(("err", exc, 0), protocol=4))[1]
        assert type(rendu) is type(exc) and rendu.args == exc.args
    assert canal.decoder(pickle.dumps(("err", PdfIllisible(3, "d"), 0), protocol=4))[1].code == 3
    assert not canal.exception_autorisee(t.ErreurMaison())


def test_un_pickle_mal_forme_ou_en_bombe_est_refuse():
    for octets in (b"", b"\x80\x04garbage", b"cos\nsystem\n.", pickle.dumps([1])[:-3]):
        with pytest.raises(canal.MessageRefuse):
            canal.decoder(octets)
    # 1 octet par liste : l'amplification mémoire est coupée par le décompte d'opcodes
    bombe = b"\x80\x04" + b"]" * (canal.OPCODES_MAX + 10) + b"."
    with pytest.raises(canal.MessageRefuse, match="trop d'objets"):
        canal.decoder(bombe)


def test_un_message_plus_gros_que_la_borne_est_refuse_sans_etre_lu(monkeypatch):
    monkeypatch.setattr(canal, "MESSAGE_MAX_OCTETS_DEFAUT", 1000)
    a, b = mp.Pipe()
    a.send_bytes(pickle.dumps(b"x" * 5000, protocol=4))
    with pytest.raises(canal.MessageRefuse, match="plus gros"):
        canal.recevoir(b)
    a2, b2 = mp.Pipe()
    a2.send_bytes(pickle.dumps(b"x" * 100, protocol=4))
    assert canal.recevoir(b2) == b"x" * 100
    with pytest.raises(canal.MessageRefuse):
        canal.encoder(b"x" * 5000)       # l'enfant applique la même borne avant d'envoyer


# ─── Un vrai enfant compromis ────────────────────────────────────────────────

def test_un_enfant_qui_envoie_un_pickle_forge_echoue_proprement(tmp_path):
    temoin = tmp_path / "temoin"
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.envoyer_pickle_forge, str(temoin), delai_s=30)
    assert e.value.raison == "plantage" and "refusée" in e.value.detail
    assert not temoin.exists()                              # JAMAIS exécuté dans l'API
    assert pp.executer(t.pid, delai_s=60) != avant          # l'enfant hostile est tué, un neuf le remplace


def test_un_message_enorme_annonce_par_l_enfant_est_refuse_sans_allocation():
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.annoncer_un_message_enorme, 1024, delai_s=30)    # 1 Go annoncé
    assert e.value.raison == "plantage" and "refusée" in e.value.detail
    assert pp.executer(t.ajouter, 1, 2, delai_s=60) == 3


def test_un_message_partiel_ne_fait_pas_attendre_au_dela_du_delai():
    debut = time.monotonic()
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.message_partiel_puis_silence, delai_s=2)
    assert e.value.raison == "delai"
    assert time.monotonic() - debut < 15
    assert pp.executer(t.ajouter, 1, 2, delai_s=60) == 3


@pytest.mark.parametrize("octets", [
    pickle.dumps(("inconnu", 1, 0), protocol=4),             # genre inconnu
    pickle.dumps(("err", "pas une exception", 0), protocol=4),
    pickle.dumps(("ok", 1), protocol=4),                     # pas 3 éléments
    pickle.dumps("ok", protocol=4),
    pickle.dumps(("ok", 1, "x"), protocol=4),                # rss pas un entier
])
def test_une_reponse_hors_protocole_est_refusee(octets):
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        pp.executer(t.envoyer_octets, octets, delai_s=30)
    assert e.value.raison == "plantage"


def test_les_exceptions_listees_arrivent_telles_quelles_les_autres_en_runtimeerror():
    from services.pdf_lecture import PdfIllisible
    from services.pdf_rendu import RenduTropGrand
    with pytest.raises(PdfIllisible) as e:
        pp.executer(t.lever_pdf_illisible, delai_s=60)
    assert e.value.code == 3 and e.value.detail == "format"
    with pytest.raises(RenduTropGrand):
        pp.executer(t.lever_rendu_trop_grand, delai_s=60)
    with pytest.raises(FileNotFoundError) as e2:
        pp.executer(t.lever_oserror, delai_s=60)
    assert e2.value.errno == 2
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(RuntimeError, match="ErreurMaison: maison"):
        pp.executer(t.lever_maison, delai_s=60)
    assert pp.executer(t.pid, delai_s=60) == avant           # l'enfant reste : ce n'était pas une attaque


def test_un_resultat_de_quelques_mo_passe_un_resultat_au_dessus_de_la_borne_est_une_erreur_claire():
    assert len(pp.executer(t.octets, 5, delai_s=60)) == 5 * MO
    avant = pp.executer(t.pid, delai_s=60)
    with pytest.raises(RuntimeError, match="non transmissible"):
        pp.executer(t.octets, canal.MESSAGE_MAX_OCTETS_DEFAUT // MO + 1, delai_s=60)
    assert pp.executer(t.pid, delai_s=60) == avant
