"""
Point 7 — l'export DOCX depuis l'étape Export (/export/docx) doit produire
le MÊME document complet que l'étape Mémoire (/memoire/export-docx) :
page de garde + organigramme + images. Qualifié en réel sur Gueux :
le legacy rendait un docx nu (media=0, sans page de garde).
"""
import io
import zipfile

from models.memoire import MemoireTechnique
from models.memoire_config import MemoireConfig
from models.project import Project

_CONTENT = {
    "preambule": "Notre entreprise répond au présent marché.",
    "partie_a": {},
    "partie_b": {},
    # L'organigramme s'insère sous les moyens humains (partie_c.effectifs).
    "partie_c": {"effectifs": "Une équipe dédiée de 5 personnes encadrée."},
}


def _docx_text_and_media(content: bytes):
    from docx import Document
    doc = Document(io.BytesIO(content))
    text = "\n".join(p.text for p in doc.paragraphs)
    media = [n for n in zipfile.ZipFile(io.BytesIO(content)).namelist()
             if n.startswith("word/media/")]
    return text, media


def _setup(db, org_id):
    db.add(MemoireConfig(
        organization_id=org_id,
        gerant_nom="Karim Demo", gerant_titre="Gérant",
        postes_cles=[
            {"nom": "Paul Martin", "poste": "Conducteur de travaux"},
            {"nom": "Ali Benali", "poste": "Chef de chantier"},
        ],
    ))
    db.add(Project(
        id="proj-exdocx", organization_id=org_id, name="Groupe scolaire Gueux",
        selected_lot="lot1", selected_lot_name="Lot 01 — Démolition GO",
        maitre_ouvrage="Commune de Gueux",
    ))
    db.add(MemoireTechnique(
        project_id="proj-exdocx",
        content_json=_CONTENT,
        variables={"include_organigramme": True},
    ))
    db.commit()


def test_export_step_docx_is_complete(client, db_session, test_org):
    """/export/docx (bouton de l'étape Export) = builder COMPLET :
    page de garde (projet, lot, MOA) + organigramme inséré."""
    _setup(db_session, test_org.id)

    resp = client.get("/api/projects/proj-exdocx/export/docx")
    assert resp.status_code == 200, resp.text
    assert resp.content[:2] == b"PK"

    text, media = _docx_text_and_media(resp.content)
    up = text.upper()
    assert "GROUPE SCOLAIRE GUEUX" in up          # page de garde : projet
    assert "Commune de Gueux" in text             # page de garde : MOA
    assert "Organigramme du chantier" in text     # organigramme : caption
    assert len(media) >= 1                        # organigramme : image


def test_export_step_docx_equals_memoire_step_docx(client, db_session, test_org):
    """Les deux URLs produisent le même document (source unique)."""
    _setup(db_session, test_org.id)

    a = client.get("/api/projects/proj-exdocx/export/docx")
    b = client.get("/api/projects/proj-exdocx/memoire/export-docx")
    assert a.status_code == 200 and b.status_code == 200

    ta, ma = _docx_text_and_media(a.content)
    tb, mb = _docx_text_and_media(b.content)
    assert ta == tb
    assert len(ma) == len(mb)
