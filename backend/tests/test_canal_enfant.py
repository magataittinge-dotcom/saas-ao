"""Canal enfant -> parent (bloc 6, revue de sécurité) : le parent ne fait JAMAIS ``pickle.loads`` sur les octets
d'un enfant PDFium ; le canal est du JSON à schéma explicite (services/canal_enfant.py). On part de l'hypothèse
qu'un fichier piégé prend le contrôle de l'enfant."""
import json
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


def _rss_ko() -> int:
    with open("/proc/self/statm") as f:
        return int(f.read().split()[1]) * (os.sysconf("SC_PAGE_SIZE") // 1024)


def test_les_types_de_base_les_tuples_les_octets_et_les_exceptions_listees_passent():
    from services.pdf_lecture import PdfIllisible
    from services.pdf_rendu import PageHorsBornes
    message = ("ok", ("texte é\ud800", 3, None, [["a", "b"], ["c"]], {"k": [1.5, True, b"\x00\xff"], "vide": {}}, ()), 12)
    assert canal.decoder(canal.encoder(message)) == message
    assert type(canal.decoder(canal.encoder(message))[1]) is tuple
    for exc in (ValueError("x"), MemoryError(), FileNotFoundError(2, "absent", "/x"), PdfIllisible(3, "d"),
                PageHorsBornes("p"), OSError("seul")):
        assert canal.exception_autorisee(exc)
        rendu = canal.decoder(canal.encoder(("err", exc, 0)))[1]
        assert type(rendu) is type(exc) and rendu.args == exc.args
    assert canal.decoder(canal.encoder(("err", FileNotFoundError(2, "absent", "/x"), 0)))[1].filename == "/x"
    assert canal.decoder(canal.encoder(("err", PdfIllisible(3, "d"), 0)))[1].code == 3
    assert not canal.exception_autorisee(t.ErreurMaison())


@pytest.mark.parametrize("objet", [
    {1: "cle entière"}, {"$t": 1}, {"a": {1, 2}}, {"a": object()}, t.ErreurMaison("x"), ValueError(["liste"]),
    ValueError("x" * 5000), ValueError(10 ** 30), {"a": float, "b": 1}, lambda: 1,
], ids=lambda o: type(o).__name__ + str(id(o) % 7))
def test_l_encodage_refuse_ce_qui_sort_du_schema(objet):
    with pytest.raises((TypeError, canal.MessageRefuse)):
        canal.encoder(("ok", objet, 0))


@pytest.mark.parametrize("octets", [
    b"", b"\x80\x04garbage", b"cos\nsystem\n.", b"\xff\xfe", b"[1,2",
    json.dumps({"$e": "os.system", "a": ["x"]}).encode(),                    # exception hors liste
    json.dumps({"$e": "builtins.ValueError", "a": [10 ** 30]}).encode(),     # entier hors 63 bits
    json.dumps({"$e": "builtins.MemoryError", "a": [[1]]}).encode(),        # argument non scalaire
    json.dumps({"$e": "builtins.ValueError", "a": ["x"] * 9}).encode(),     # trop d'arguments
    json.dumps({"$e": "builtins.ValueError", "a": ["x" * 5000]}).encode(),
    json.dumps({"$b": "pas du base64 !"}).encode(),
    json.dumps({"$x": 1}).encode(),                                          # balise inconnue
    json.dumps({"$t": [], "autre": 1}).encode(),                             # balise mélangée à une clé
    b"[" * 40 + b"]" * 40,                                                   # trop profond
], ids=lambda o: o[:18].decode("latin1"))
def test_un_message_hors_schema_est_refuse(octets):
    with pytest.raises(canal.MessageRefuse):
        canal.decoder(octets)


def test_bombes_de_structures_refusees_avant_toute_construction():
    for bombe in (b"[" * (canal.STRUCTURES_MAX + 1), b"[" + b"[]," * (canal.STRUCTURES_MAX + 1) + b"[]]",
                  b"[" + b"1," * (canal.SEPARATEURS_MAX + 1) + b"1]"):
        debut = time.monotonic()
        with pytest.raises(canal.MessageRefuse):
            canal.decoder(bombe)
        assert time.monotonic() - debut < 0.5


def test_bytearray_enorme_refuse_sans_allocation():
    """``bytearray(10**12)`` tient en une dizaine d'octets : la borne de taille ne l'arrête pas. Il n'est pas du JSON,
    et rien ne peut le fabriquer dans le schéma (les octets sont du base64 déjà borné)."""
    class Enorme:
        def __reduce__(self):
            return (bytearray, (10 ** 12,))
    forge = pickle.dumps(("ok", Enorme(), 0), protocol=4)
    avant = _rss_ko()
    with pytest.raises(canal.MessageRefuse):
        canal.decoder(forge)
    assert _rss_ko() - avant < 50 * 1024          # moins de 50 Mo gagnés (sinon : 1 To demandé)
    for en_json in (json.dumps({"$b": 10 ** 12}), json.dumps({"$t": 10 ** 12}), json.dumps([0] * 5 + [10 ** 12])):
        try:
            canal.decoder(en_json.encode())
        except canal.MessageRefuse:
            pass
    assert _rss_ko() - avant < 50 * 1024


def test_des_cles_en_collision_ne_bloquent_pas_le_parent():
    """Entiers de même hachage (déterministe) dans un ``dict`` : O(n²) avec pickle. Ici : pickle refusé, et en JSON une
    clé est toujours un ``str`` (hachage aléatoire par processus) : aucune collision fabricable."""
    n = 30_000
    collision = {k * (2 ** 61 - 1): 0 for k in range(1, n)}
    assert len({hash(k) for k in collision}) == 1
    forge = pickle.dumps(("ok", collision, 0), protocol=4)
    debut = time.monotonic()
    with pytest.raises(canal.MessageRefuse):
        canal.decoder(forge)
    assert time.monotonic() - debut < 0.1
    en_json = b'{"$t":["ok",' + json.dumps({str(k * (2 ** 61 - 1)): 0 for k in range(1, n)}).encode() + b',0]}'
    debut = time.monotonic()
    assert len(canal.decoder(en_json)[1]) == n - 1
    assert time.monotonic() - debut < 0.5


def test_un_message_plus_gros_que_la_borne_est_refuse_sans_etre_lu(monkeypatch):
    monkeypatch.setattr(canal, "MESSAGE_MAX_OCTETS", 1000)
    a, b = mp.Pipe()
    a.send_bytes(b'"' + b"x" * 5000 + b'"')
    with pytest.raises(canal.MessageRefuse, match="plus gros"):
        canal.recevoir(b)
    a2, b2 = mp.Pipe()
    a2.send_bytes(canal.encoder(b"x" * 100))
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
    b'{"$t":["inconnu",1,0]}',                                # genre inconnu
    b'{"$t":["err","pas une exception",0]}',
    b'{"$t":["ok",1]}',                                       # pas 3 éléments
    b'"ok"',
    b'{"$t":["ok",1,"x"]}',                                   # rss pas un entier
    pickle.dumps(("ok", 1, 0), protocol=4),                   # un pickle, même banal : jamais lu
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
        pp.executer(t.octets, canal.MESSAGE_MAX_OCTETS // MO + 1, delai_s=60)
    assert pp.executer(t.pid, delai_s=60) == avant
