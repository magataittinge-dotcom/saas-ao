"""
Tests C6 — surlignage jaune de l'excerpt dans le viewer PDF.

Règle ABSOLUE : l'excerpt est cherché VERBATIM sur la page indiquée.
  • Trouvé en entier → surligné en jaune (toutes ses lignes).
  • Non trouvé à l'identique (même partiellement) → page servie SANS
    surlignage + log — JAMAIS de faux surlignage.
"""
import io

import fitz   # comptage des rectangles dessinés (get_drawings) : PyMuPDF, jusqu'au retrait du surligneur
import pytest

from models.project import Project, ProjectDocument
from tests.pdf_fabrique import ecrire_pdf, pdf_texte


PAGE1 = "REGLEMENT DE LA CONSULTATION\nArticle 1 — Objet : restructuration du groupe scolaire de Gueux."
PAGE2 = (
    "Article 4 — Conditions de participation.\n"
    "Le candidat devra justifier d'un chiffre d'affaires annuel minimum de 600 000 euros HT "
    "sur les trois derniers exercices.\n"
    "La visite du site est obligatoire avant remise des offres."
)
PAGE3 = "Article 6 — Jugement des offres : prix 40 %, valeur technique 60 %."

EXCERPT_OK = "Le candidat devra justifier d'un chiffre d'affaires annuel minimum de 600 000 euros HT"
EXCERPT_ABSENT = "Le candidat fournira une garantie bancaire de 50 000 euros"
EXCERPT_ALTERED = "Le candidat devra justifier d'un chiffre d'affaires annuel minimum de 900 000 euros HT"


def _make_pdf() -> bytes:
    # Sans retour à la ligne automatique (comme insert_text) : l'excerpt tient sur
    # une seule ligne de la page 2, ce qui teste la recherche directe.
    return pdf_texte([PAGE1, PAGE2, PAGE3], largeur_car=None)


def _highlights_per_page(pdf_bytes_or_doc) -> list:
    """Compte les rectangles de surlignage DESSINÉS (fill jaune, sous le
    texte) — nouveau contrat : plus d'annotations Highlight (leur appearance
    déformait le texte dans PDF.js), des draw_rect dans le contenu de page."""
    if isinstance(pdf_bytes_or_doc, (bytes, bytearray)):
        doc = fitz.open(stream=pdf_bytes_or_doc, filetype="pdf")
    else:
        doc = pdf_bytes_or_doc
    def _count(page):
        n = 0
        for d in page.get_drawings():
            f = d.get("fill")
            if f and f[0] > 0.9 and f[1] > 0.8 and f[2] < 0.5:  # jaune
                n += 1
        return n
    try:
        return [_count(doc[i]) for i in range(doc.page_count)]
    finally:
        if isinstance(pdf_bytes_or_doc, (bytes, bytearray)):
            doc.close()


_annots_per_page = _highlights_per_page  # compat noms dans les tests


@pytest.fixture
def gueux_pdf(tmp_path, monkeypatch):
    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    target = tmp_path / "projects" / "proj-c6" / "dce" / "RC_Gueux.pdf"
    target.parent.mkdir(parents=True)
    target.write_bytes(_make_pdf())
    return target


def _signed_view_url(path: str, org_id: str, page: int, highlight: str) -> str:
    from urllib.parse import quote as q
    from services.file_storage import sign_file_path
    url = sign_file_path(path, org_id=org_id)
    return f"{url}&page={page}&highlight={q(highlight)}"


@pytest.fixture
def project(db_session, test_org):
    p = Project(id="proj-c6", organization_id=test_org.id, name="Gueux")
    db_session.add(p)
    db_session.commit()
    return p


# ─── Excerpt trouvé verbatim → surligné sur la bonne page ────────────────────

def test_excerpt_found_is_highlighted_on_page(client, gueux_pdf, project, test_org):
    url = _signed_view_url("projects/proj-c6/dce/RC_Gueux.pdf", test_org.id, 2, EXCERPT_OK)
    resp = client.get(url)
    assert resp.status_code == 200, resp.text

    annots = _annots_per_page(resp.content)
    assert annots[1] >= 1     # page 2 surlignée
    assert annots[0] == 0 and annots[2] == 0  # rien ailleurs


# ─── Excerpt absent → AUCUN surlignage, page servie quand même ───────────────

def test_absent_excerpt_serves_page_without_highlight(client, gueux_pdf, project, test_org, caplog):
    url = _signed_view_url("projects/proj-c6/dce/RC_Gueux.pdf", test_org.id, 2, EXCERPT_ABSENT)
    with caplog.at_level("WARNING"):
        resp = client.get(url)
    assert resp.status_code == 200
    assert sum(_annots_per_page(resp.content)) == 0
    assert any("surlign" in r.message.lower() or "non trouv" in r.message.lower()
               for r in caplog.records)


# ─── Excerpt altéré (un chiffre changé) → jamais de faux surlignage ──────────

def test_altered_excerpt_never_falsely_highlighted(client, gueux_pdf, project, test_org):
    """Le début de la phrase existe mais PAS le montant : surligner le début
    seul serait un FAUX surlignage (l'utilisateur croirait lire 900 000)."""
    url = _signed_view_url("projects/proj-c6/dce/RC_Gueux.pdf", test_org.id, 2, EXCERPT_ALTERED)
    resp = client.get(url)
    assert resp.status_code == 200
    assert sum(_annots_per_page(resp.content)) == 0


# ─── L'excerpt multi-lignes est surligné en ENTIER ───────────────────────────

def test_multiline_excerpt_fully_highlighted():
    from services.pdf_highlighter import PdfHighlighter
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        long_text = (
            "Les travaux comprennent la depose complete des menuiseries existantes, "
            "la fourniture et la pose de menuiseries aluminium a rupture de pont thermique, "
            "ainsi que les habillages interieurs et exterieurs."
        )
        # repli automatique à 80 caractères : trois lignes, comme insert_textbox
        pdf_path = ecrire_pdf(Path(tmp) / "doc.pdf", [long_text])

        out = PdfHighlighter.highlight_text_in_pdf(pdf_path, 1, long_text)
        assert out is not None
        result = fitz.open(str(out))
        counts = _highlights_per_page(result)
        # Plusieurs lignes → plusieurs rectangles de surlignage (excerpt ENTIER)
        assert counts[0] >= 2
        result.close()
