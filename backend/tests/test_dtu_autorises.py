"""Tranche DTU 1 — liste des DTU autorisés, lue sans IA, des seules pièces CCTP
du lot et des pièces communes. Chaînes inventées : aucun texte de DCE."""
import time
from types import SimpleNamespace

from services.ai.dtu_autorises import dtu_autorises, trouver_dtu


def _doc(nom, texte, type_="cctp", lots=("5",), **kw):
    return SimpleNamespace(
        file_name=nom, type=type_, extracted_text=texte,
        related_lots=list(lots) if lots is not None else None,
        is_user_completed=kw.get("is_user_completed", False))


def _numeros(texte):
    return [m.numero for m in trouver_dtu(texte)]


def test_formes_usuelles_en_mots_entiers():
    assert _numeros("conforme au DTU 41.2 et à la NF DTU 52.2.") == ["41.2", "52.2"]
    assert _numeros("NF DTU n° 41.2, DTU N°43.1 §5.2") == ["41.2", "43.1"]
    assert _numeros("NF DTU 20.1 P1-1 puis DTU 20.1 - P3") == ["20.1", "20.1"]
    assert _numeros("DTU \n23.1 et DTU26.1 et D.T.U. 25.41") == ["23.1", "26.1", "25.41"]
    assert _numeros("NF DTU 26-1 P1-2") == ["26.1"]
    assert _numeros("DTU 20.12.") == ["20.12"]


def test_mots_entiers_pas_de_faux_positif():
    assert _numeros("ADTU 41.2 XNF DTU4 DTU 4112 DTU seul, DTU les concernant") == []
    assert _numeros("la pose de 41.2 m2 sans DTU") == []


def test_liste_de_dtu_apres_un_premier_dtu():
    assert _numeros("les DTU 20.11 et 20.12, 26.1") == ["20.11", "20.12", "26.1"]


def test_partie_conservee_dans_la_mention():
    m = trouver_dtu("NF DTU 20.1 P1-1 (CCT)")[0]
    assert (m.numero, m.partie) == ("20.1", "P1-1")


def test_temps_lineaire_sans_redos():
    texte = ("DTU" + " " * 50 + "n°" + " " * 50) * 20000 + "DTU 1" + "-" * 200000
    t0 = time.monotonic()
    trouver_dtu(texte)
    assert time.monotonic() - t0 < 3


def test_seules_les_pieces_cctp_du_lot_et_les_pieces_communes():
    docs = [
        _doc("cctp lot 5.pdf", "Pose selon NF DTU 41.2.", lots=("5",)),
        _doc("annexe 00.pdf", "Annexe commune : NF DTU 20.1 P1-1.", type_="autre", lots=("0",)),
        _doc("diag.pdf", "Diagnostic cite DTU 12.1.", type_="diagnostic", lots=("all",)),
        _doc("notice.pdf", "Notice cite DTU 14.1.", type_="notice", lots=None),
        _doc("rc.pdf", "Le RC cite le DTU 59.1.", type_="rc", lots=("all",)),
        _doc("pgc.pdf", "PGC cite DTU 31.1.", type_="pgc_sps", lots=("5",)),
        _doc("dpgf.xlsx", "ligne DTU 21", type_="dpgf_template", lots=("5",)),
        _doc("rempli.pdf", "DTU 13.1", lots=("5",), is_user_completed=True),
    ]
    res = dtu_autorises(docs)
    assert sorted(res) == ["20.1", "41.2"]


def test_avec_le_lot_les_cctp_des_autres_lots_sont_ecartes():
    docs = [
        _doc("cctp lot 5.pdf", "NF DTU 41.2", lots=("5",)),
        _doc("cctp lot 9.pdf", "Elec : DTU 70.1.", lots=("9",)),
        _doc("commun.pdf", "NF DTU 20.1", lots=("00",), type_="autre"),
    ]
    assert sorted(dtu_autorises(docs, selected_lot="lot5")) == ["20.1", "41.2"]


def test_piece_et_page_quand_le_texte_porte_un_pied_de_page():
    texte = ("Lot 5 / Page 1 / 3 \nIntro.\nLot 5 / Page 2 / 3 \nPose selon NF DTU 41.2 ici.\n"
             "Lot 5 / Page 3 / 3 \nEt DTU 41.2 encore, puis NF DTU 52.2.")
    res = dtu_autorises([_doc("cctp lot 5.pdf", texte)])
    assert res["41.2"].sources == [("cctp lot 5.pdf", 2), ("cctp lot 5.pdf", 3)]
    assert res["52.2"].sources == [("cctp lot 5.pdf", 3)]


def test_sans_marqueur_de_page_la_page_est_inconnue():
    res = dtu_autorises([_doc("cctp.pdf", "Selon NF DTU 41.2.")])
    assert res["41.2"].sources == [("cctp.pdf", None)]


def test_texte_vide_ou_absent():
    assert dtu_autorises([_doc("a.pdf", None), _doc("b.pdf", "")]) == {}
