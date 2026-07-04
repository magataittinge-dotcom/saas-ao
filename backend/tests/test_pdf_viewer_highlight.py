"""
Tests C6 — surlignage jaune de l'excerpt dans le viewer PDF.

Règle ABSOLUE : l'excerpt est cherché VERBATIM sur la page indiquée.
  • Trouvé en entier → surligné en jaune (toutes ses lignes).
  • Non trouvé à l'identique (même partiellement) → page servie SANS
    surlignage + log — JAMAIS de faux surlignage.
"""
import io

import fitz
import pytest

from models.project import Project, ProjectDocument


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
    doc = fitz.open()
    for text in (PAGE1, PAGE2, PAGE3):
        page = doc.new_page()
        page.insert_text((72, 100), text, fontsize=11)
    out = doc.tobytes()
    doc.close()
    return out


def _annots_per_page(pdf_bytes: bytes) -> list:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [len(list(doc[i].annots() or [])) for i in range(doc.page_count)]
    finally:
        doc.close()


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
        pdf_path = Path(tmp) / "doc.pdf"
        doc = fitz.open()
        page = doc.new_page()
        long_text = (
            "Les travaux comprennent la depose complete des menuiseries existantes, "
            "la fourniture et la pose de menuiseries aluminium a rupture de pont thermique, "
            "ainsi que les habillages interieurs et exterieurs."
        )
        rect = fitz.Rect(72, 100, 520, 300)
        page.insert_textbox(rect, long_text, fontsize=11)
        doc.save(str(pdf_path))
        doc.close()

        out = PdfHighlighter.highlight_text_in_pdf(pdf_path, 1, long_text)
        assert out is not None
        result = fitz.open(str(out))
        annots = list(result[0].annots() or [])
        # Plusieurs lignes → plusieurs rectangles de surlignage (excerpt ENTIER)
        assert len(annots) >= 2
        result.close()
