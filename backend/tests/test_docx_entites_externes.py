"""Un .docx déposé ne fait jamais lire un fichier du serveur (XXE).

Un DCE vient d'un acheteur public : son .docx est une donnée étrangère. Son XML
peut déclarer des entités externes (`<!ENTITY x SYSTEM "file:///…">`) ou des
entités paramètres externes (`<!ENTITY % x SYSTEM …> %x;`). lxml les résolvait
par défaut dans `iterparse()` jusqu'à 6.1.0 (CVE-2026-41066), et chargeait
encore les entités paramètres externes jusqu'à 6.1.3. `texte_docx` passe
`resolve_entities=False, no_network=True, load_dtd=False` : ce test garde cette
protection, quelle que soit la version de lxml.
"""
import io
import zipfile

import docx

from services.document_processor import texte_docx

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _docx_avec(document_xml: str) -> bytes:
    """Un vrai .docx (python-docx), dont le corps est remplacé par `document_xml`."""
    tampon = io.BytesIO()
    docx.Document().save(tampon)
    entree, sortie = zipfile.ZipFile(io.BytesIO(tampon.getvalue())), io.BytesIO()
    with zipfile.ZipFile(sortie, "w", zipfile.ZIP_DEFLATED) as archive:
        for info in entree.infolist():
            contenu = entree.read(info)
            if info.filename == "word/document.xml":
                contenu = document_xml.encode()
            archive.writestr(info, contenu)
    return sortie.getvalue()


def test_docx_aux_entites_externes_ne_lit_aucun_fichier_du_serveur(tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("SECRET-ENTITE-GENERALE")
    dtd = tmp_path / "fuite.dtd"
    dtd.write_text('<!ENTITY fuite "SECRET-ENTITE-PARAMETRE">')
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        "<!DOCTYPE w:document [\n"
        f'  <!ENTITY ext SYSTEM "file://{secret}">\n'
        f'  <!ENTITY % pe SYSTEM "file://{dtd}"> %pe;\n'
        "]>\n"
        f'<w:document xmlns:w="{W}"><w:body>'
        "<w:p><w:r><w:t>Article 1 &ext; &fuite;</w:t></w:r></w:p>"
        "</w:body></w:document>"
    )
    try:
        texte = texte_docx(_docx_avec(document))
    except Exception as exc:  # document refusé : acceptable, sans rien divulguer
        texte = str(exc)
    assert "SECRET-ENTITE-GENERALE" not in texte
    assert "SECRET-ENTITE-PARAMETRE" not in texte


def test_temoin_le_meme_docx_sans_entites_se_lit():
    document = (f'<?xml version="1.0" encoding="UTF-8"?>\n<w:document xmlns:w="{W}"><w:body>'
                "<w:p><w:r><w:t>Article 1 du CCTP</w:t></w:r></w:p></w:body></w:document>")
    assert texte_docx(_docx_avec(document)) == "Article 1 du CCTP"
