"""« Lot 3 et 4 : Menuiseries » (G2 cas 26) — un lot ou deux, jamais deux lots du même nom.

Décision du 26/10 : on suit le RC.
- rien ne sépare les lots 3 et 4 (pas de pièce propre à l'un ni à l'autre) : UN lot,
  d'identifiant stable (le premier numéro), dont le nom dit qu'il couvre les deux ;
- chacun a ses pièces : DEUX lots, aux noms tirés de leurs pièces ;
- les pièces ne distinguent pas les noms : repli au format de partout, numéro d'abord : « Lot 3 — Menuiseries ».
Invariant de detect_all_lots : jamais deux lots du même nom (numéro compris). Textes et noms de fichiers
inventés.
"""
import importlib
import inspect
import re
from types import SimpleNamespace

from services import lot_detector as LD

RC = ("REGLEMENT DE LA CONSULTATION\nLot 1 : Maçonnerie\nLot 3 et 4 : Menuiseries\nLot 5 : Peinture\n")


def doc(nom, type_="cctp", texte=""):
    return SimpleNamespace(file_name=nom, file_url=None, type=type_, extracted_text=texte)


def rc_doc(texte=RC):
    return doc("RC.pdf", "rc", texte)


def sortie(docs):
    return [(d["id"], d["nom"]) for d in LD.detect_all_lots(docs)]


def designation(nom):
    return LD._designation(nom)


# ─── Un seul lot ─────────────────────────────────────────────────────────────

def test_rien_ne_separe_3_et_4_un_seul_lot():
    assert sortie([rc_doc()]) == [("lot1", "Lot 1 — Maçonnerie"), ("lot3", "Lots 3 et 4 — Menuiseries"),
                                  ("lot5", "Lot 5 — Peinture")]


def test_une_piece_commune_aux_deux_lots_ne_les_separe_pas():
    docs = [rc_doc(), doc("CCTP Lot 03 et 04 Menuiseries.pdf"), doc("DPGF Lot 3 et 4.xlsx", "dpgf_template")]
    assert sortie(docs) == [("lot1", "Lot 1 — Maçonnerie"), ("lot3", "Lots 3 et 4 — Menuiseries"),
                            ("lot5", "Lot 5 — Peinture")]


def test_lot_unique_stable_d_une_analyse_a_l_autre():
    docs = [rc_doc(), doc("CCTP Lot 03 et 04 Menuiseries.pdf")]
    assert sortie(docs) == sortie(list(docs))


# ─── Deux lots, noms tirés des pièces ────────────────────────────────────────

def test_chacun_a_ses_pieces_deux_lots_aux_noms_des_pieces():
    docs = [rc_doc(), doc("CCTP Lot 03 Menuiseries extérieures.pdf"), doc("CCTP Lot 04 Menuiseries intérieures.pdf")]
    assert sortie(docs) == [("lot1", "Lot 1 — Maçonnerie"), ("lot3", "Lot 3 — Menuiseries extérieures"),
                            ("lot4", "Lot 4 — Menuiseries intérieures"), ("lot5", "Lot 5 — Peinture")]


def test_noms_pris_des_pieces_dpgf_et_bpu():
    docs = [rc_doc(), doc("DPGF_Lot_3_Portes et fenêtres.xlsx", "dpgf_template"),
            doc("BPU Lot 4 - Cloisons vitrées.xlsx", "bpu_template")]
    assert sortie(docs)[1:3] == [("lot3", "Lot 3 — Portes et fenêtres"), ("lot4", "Lot 4 — Cloisons vitrées")]


# ─── Repli explicite ─────────────────────────────────────────────────────────

def test_pieces_muettes_sur_le_nom_repli_sobre():
    docs = [rc_doc(), doc("CCTP Lot 03.pdf"), doc("CCTP Lot 04.pdf")]
    assert sortie(docs) == [("lot1", "Lot 1 — Maçonnerie"), ("lot3", "Lot 3 — Menuiseries"),
                            ("lot4", "Lot 4 — Menuiseries"), ("lot5", "Lot 5 — Peinture")]


def test_pieces_au_meme_nom_repli_sobre():
    docs = [rc_doc(), doc("CCTP Lot 03 Menuiseries.pdf"), doc("CCTP Lot 04 Menuiseries.pdf")]
    assert [n for i, n in sortie(docs) if i in ("lot3", "lot4")] == ["Lot 3 — Menuiseries", "Lot 4 — Menuiseries"]


def test_une_seule_piece_nommee_repli_aussi():
    docs = [rc_doc(), doc("CCTP Lot 03 Menuiseries extérieures.pdf"), doc("CCTP Lot 04.pdf")]
    assert [n for i, n in sortie(docs) if i in ("lot3", "lot4")] == ["Lot 3 — Menuiseries", "Lot 4 — Menuiseries"]


# ─── Invariant : aucune désignation en double ────────────────────────────────

def test_deux_lots_distincts_du_meme_nom_sont_departages():
    rc = "REGLEMENT DE LA CONSULTATION\nLot 5 : Électricité\nLot 9 : Électricité\nLot 10 : Peinture\n"
    assert sortie([rc_doc(rc)]) == [("lot5", "Lot 5 — Électricité"), ("lot9", "Lot 9 — Électricité"),
                                    ("lot10", "Lot 10 — Peinture")]


def test_deux_lots_de_meme_numero_et_de_meme_designation_restent_distincts():
    """Garde-fou : si le numéro lu dans le nom est le même, l'identifiant sert de départage."""
    a = LD.LotDetection(id="lot5", nom="Lot 5 — Électricité", confidence=80)
    b = LD.LotDetection(id="lot9", nom="Lot 5 — Électricité", confidence=80)
    LD._noms_sans_doublon([a, b])
    assert a.nom != b.nom
    assert {a.nom, b.nom} == {"Lot 5 — Électricité (lot5)", "Lot 5 — Électricité (lot9)"}


def test_le_repli_n_utilise_plus_le_format_designation_puis_lot():
    for _, nom in sortie([rc_doc(), doc("CCTP Lot 03.pdf"), doc("CCTP Lot 04.pdf")]):
        assert not re.search(r"— lot \S+$", nom), nom       # « Menuiseries — lot 3 » n'existe plus


def test_designation_sans_le_prefixe_de_lot():
    assert designation("Lot 3 — Menuiseries") == "Menuiseries"
    assert designation("Lots 3 et 4 — Menuiseries") == "Menuiseries"
    assert designation("Lot 7.1 — Plomberie") == "Plomberie"
    assert designation("Lot A — Terrassements") == "Terrassements"
    assert designation("Lot 3") == ""
    assert designation("Menuiseries — lot 3") == "Menuiseries"


def test_designation_d_un_nom_de_fichier():
    f = LD._designation_de_fichier
    assert f("CCTP Lot 03 Menuiseries extérieures.pdf") == "Menuiseries extérieures"
    assert f("DPGF_Lot_4_Portes et fenêtres.xlsx") == "Portes et fenêtres"
    assert f("BPU Lot 4 - Cloisons vitrées.xlsx") == "Cloisons vitrées"
    assert f("CCTP Lot 03.pdf") == ""
    assert f("CCTP Lot 02 et 03 Menuiseries.pdf") == "Menuiseries"


def test_aucun_nom_en_double_sur_tous_les_cas_de_g2(monkeypatch):
    """Rejoue chaque test sans paramètre de test_lots_cas_g2 en notant les textes de RC
    qu'il donne au détecteur, puis passe chacun dans detect_all_lots."""
    cas = importlib.import_module("tests.test_lots_cas_g2")
    vus = []
    reel = LD._detect_lots_from_rc_text

    def espion(texte, doc_type):
        vus.append(texte)
        return reel(texte, doc_type)

    monkeypatch.setattr(LD, "_detect_lots_from_rc_text", espion)
    for nom, fonction in vars(cas).items():
        if nom.startswith("test_") and inspect.isfunction(fonction) and not inspect.signature(fonction).parameters:
            try:
                fonction()
            except Exception:  # noqa: BLE001 — seul compte le texte vu
                pass
    monkeypatch.setattr(LD, "_detect_lots_from_rc_text", reel)
    textes = sorted(set(vus))
    assert len(textes) >= 8   # le rejeu a bien vu les RC des cas
    for texte in textes:
        noms = [n for _, n in sortie([rc_doc(texte)])]
        normalises = [LD._normalize(n) for n in noms]
        assert len(normalises) == len(set(normalises)), (noms, texte[:60])
