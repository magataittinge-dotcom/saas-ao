"""Ancrage des extraits plus rapide, résultats identiques (nuit du 23/10).

Mesuré sur l'analyse de Gueux (lot 05, 448 exigences) : 202 s de calcul sur
648 s, dont 129 s dans le balayage par fenêtres de la récupération par termes.
- le score des fenêtres part des positions des termes (même meilleure fenêtre) ;
- la normalisation est mémoïsée par caractère ;
- l'index d'un document est mis en cache par son CONTENU (borné), plus par id() ;
- les pages PDF normalisées sont mises en cache par empreinte de fichier.
"""
import os
import random

import services.ai.excerpt_anchor as ea
from tests.pdf_fabrique import ecrire_pdf


def _ancien_balayage(terms, doc_words):
    """Le balayage d'avant, recopié tel quel : la référence."""
    window = max(len(terms) * 2, 12)
    term_set = set(terms)
    best_score, best_pos = 0.0, None
    for i in range(0, len(doc_words), max(window // 3, 1)):
        chunk_words = {w for w, _ in doc_words[i:i + window]}
        hits = sum(1 for t in term_set if any(t in w for w in chunk_words))
        score = hits / len(term_set)
        if score > best_score:
            best_score, best_pos = score, i
    return best_score, best_pos


def _nouveau_balayage(terms, doc_words):
    window = max(len(terms) * 2, 12)
    term_set = set(terms)
    pas = max(window // 3, 1)
    nb = (len(doc_words) + pas - 1) // pas
    hits = [0] * nb
    memo = {}
    for t in term_set:
        couvertes = set()
        for j in ea._positions_terme(t, doc_words, memo):
            couvertes.update(range(max(0, -((window - 1 - j) // pas)), j // pas + 1))
        for k in couvertes:
            hits[k] += 1
    meilleur = max(hits) if hits else 0
    if meilleur == 0:
        return 0.0, None
    return meilleur / len(term_set), hits.index(meilleur) * pas


def test_meme_meilleure_fenetre_que_l_ancien_balayage():
    rng = random.Random(23)
    vocabulaire = ["chantier", "isolation", "facade", "laine", "roche", "fixation", "cheville",
                   "enduit", "mortier", "echafaudage", "garantie", "decennale", "planning",
                   "reception", "securite", "dechets", "tri", "beton", "acier", "bardage"]
    for _ in range(300):
        mots = [rng.choice(vocabulaire) + rng.choice(["", "s", "ment", "ees"]) for _ in range(rng.randint(1, 400))]
        doc_words = []
        pos = 0
        for m in mots:
            doc_words.append((m, pos))
            pos += len(m) + 1
        terms = [rng.choice(vocabulaire)[: rng.randint(4, 9)] for _ in range(rng.randint(3, 14))]
        assert _nouveau_balayage(terms, doc_words) == _ancien_balayage(terms, doc_words)


def test_normalisation_identique_a_l_ancienne():
    def ancienne(text):
        out, idx_map, prev_space = [], [], True
        for i, ch in enumerate(text):
            ch = ea._norm_char(ch)
            if ch.isspace():
                if prev_space:
                    continue
                out.append(" ")
                idx_map.append(i)
                prev_space = True
                continue
            prev_space = False
            import unicodedata
            decomposed = unicodedata.normalize("NFKD", ch)
            base = "".join(c for c in decomposed if not unicodedata.combining(c)) or ch
            for c in base.lower():
                out.append(c)
                idx_map.append(i)
        return "".join(out), idx_map
    texte = "L’entreprise  « Façades » — ﬁxation des panneaux… Œuvre ¨ İstanbul\n\nÉté 2026 ; coût 12,5 € HT"
    assert ea._normalize_with_map(texte) == ancienne(texte)


def test_index_du_document_reutilise_quand_le_texte_est_relu():
    ea._DOC_CACHE.clear()
    texte = "Article 4 — Les travaux de façade comprennent la fourniture et la pose de l'isolant. " * 20
    relu = (texte + " ")[:-1]          # même contenu, autre objet (texte relu en base)
    assert relu is not texte
    assert ea._doc_index(texte) is ea._doc_index(relu)


def test_cache_des_documents_borne_en_caracteres(monkeypatch):
    ea._DOC_CACHE.clear()
    monkeypatch.setattr(ea, "_DOC_CACHE_MAX_CARACTERES", 2_500)
    textes = [f"document {i} " + "mot " * 300 for i in range(5)]   # ~1 200 caractères chacun
    for t in textes:
        ea._doc_index(t)
    assert sum(len(k) for k in ea._DOC_CACHE) <= 2_500
    assert textes[-1] in ea._DOC_CACHE and textes[0] not in ea._DOC_CACHE


def test_pages_pdf_relues_une_fois_par_empreinte(tmp_path, monkeypatch):
    import fitz   # espion des ouvertures : l'ancrage lit encore le PDF avec PyMuPDF
    pdf = ecrire_pdf(tmp_path / "cctp.pdf", [
        "Page de garde du CCTP", "Les fixations sont réalisées par chevilles à frapper agréées."])
    ea._PAGES_CACHE.clear()
    ouvertures = []
    vrai = fitz.open
    monkeypatch.setattr(fitz, "open", lambda *a, **k: (ouvertures.append(a), vrai(*a, **k))[1])

    def exigence():
        return [{"source_excerpt": "Les fixations sont réalisées par chevilles à frapper", "source_page": 1}]

    for _ in range(3):   # tronc commun, lot, relance
        reqs = exigence()
        ea.resolve_pages(reqs, {"cctp.pdf": str(pdf)})
        assert reqs[0]["source_page"] == 2
    assert len(ouvertures) == 1
    # le fichier change (même chemin) : nouvelle empreinte, relu
    os.utime(pdf, ns=(os.stat(pdf).st_atime_ns, os.stat(pdf).st_mtime_ns + 1_000_000_000))
    ea.resolve_pages(exigence(), {"cctp.pdf": str(pdf)})
    assert len(ouvertures) == 2


def test_cache_des_pages_borne_en_caracteres(tmp_path, monkeypatch):
    monkeypatch.setattr(ea, "_PAGES_CACHE_MAX_CARACTERES", 300)
    ea._PAGES_CACHE.clear()
    chemins = []
    for i in range(4):
        pdf = ecrire_pdf(tmp_path / f"piece{i}.pdf", [f"Piece {i} : " + "texte " * 20])
        chemins.append(str(pdf))
        ea._pages_normalisees(str(pdf))
    total = sum(sum(len(p) for p in v[1]) for v in ea._PAGES_CACHE.values())
    assert total <= 300 or len(ea._PAGES_CACHE) == 1
    assert any(cle[0] == os.path.realpath(chemins[-1]) for cle in ea._PAGES_CACHE)


def test_memo_des_positions_plafonne(monkeypatch):
    monkeypatch.setattr(ea, "_POSITIONS_MAX_TERMES", 5)
    mots = [(f"mot{i}", i * 5) for i in range(50)]
    memo = {}
    for i in range(12):
        ea._positions_terme(f"mot{i}", mots, memo)
    assert len(memo) <= 5


def test_pages_lues_au_depot_reprises_par_l_ancrage_sans_relire_le_pdf(tmp_path, monkeypatch):
    import fitz   # espion des ouvertures : l'ancrage lit encore le PDF avec PyMuPDF
    from services.document_processor import DocumentProcessor
    pdf = ecrire_pdf(tmp_path / "ccap.pdf", [
        "Article 1 — Objet", "", "Article 3 — La retenue de garantie est fixée à 5 % du montant."])
    ea._PAGES_CACHE.clear()
    # le dépôt lit le PDF et confie ses pages au cache de l'ancrage
    texte, pages, _ = DocumentProcessor().extract_ex(
        pdf.read_bytes(), "ccap.pdf", on_pages=lambda p: ea.retenir_pages(str(pdf), p))
    assert pages == 3 and "retenue de garantie" in texte
    ouvertures = []
    vrai = fitz.open
    monkeypatch.setattr(fitz, "open", lambda *a, **k: (ouvertures.append(a), vrai(*a, **k))[1])
    reqs = [{"source_excerpt": "La retenue de garantie est fixée à 5 %", "source_page": 1}]
    ea.resolve_pages(reqs, {"ccap.pdf": str(pdf)})
    assert reqs[0]["source_page"] == 3      # page vide comptée : numéro exact
    assert ouvertures == []                 # aucune relecture du PDF
