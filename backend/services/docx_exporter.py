from typing import Any
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import io


class DocxExporter:
    """Export mémoire technique to a professional Word document."""

    def export(self, content_json: dict, organization) -> bytes:
        doc = Document()

        # Page margins
        for section in doc.sections:
            section.top_margin = Cm(2.5)
            section.bottom_margin = Cm(2.5)
            section.left_margin = Cm(2.5)
            section.right_margin = Cm(2.5)

        # Title page
        self._add_title_page(doc, organization)
        doc.add_page_break()

        # Table of contents placeholder
        doc.add_heading("SOMMAIRE", level=1)
        doc.add_paragraph("(Sommaire à compléter)")
        doc.add_page_break()

        # Preambule
        if content_json.get("preambule"):
            doc.add_heading("PRÉAMBULE", level=1)
            doc.add_paragraph(content_json["preambule"])
            doc.add_page_break()

        # Partie A
        doc.add_heading("PARTIE A — PRÉSENTATION GÉNÉRALE", level=1)
        self._add_section(doc, content_json.get("partie_a", {}), {
            "implantation": "1. Implantation géographique",
            "historique": "2. Historique de l'entreprise",
            "engagement_qualitatif": "3. Engagement qualitatif",
            "activites": "4. Activités",
            "organigramme": "5. Organigramme",
            "roles_missions": "6. Rôles et missions de l'équipe d'encadrement",
            "moyens_informatiques": "7. Moyens informatiques",
            "vehicules": "8. Véhicules",
            "materiel": "9. Matériel",
            "references": "10. Références chantiers",
            "fournisseurs": "11. Fournisseurs",
        })
        doc.add_page_break()

        # Partie B
        doc.add_heading("PARTIE B — PRESTATION MISE À DISPOSITION", level=1)
        self._add_section(doc, content_json.get("partie_b", {}), {
            "demarrage": "1. Démarrage",
            "interlocuteur": "2. Interlocuteur dédié",
            "qualite_ouvrages": "3. Qualité des ouvrages",
            "respect_planning": "4. Respect du planning",
            "securite": "5. Dispositions relatives à la sécurité",
            "dechets": "6. Traitement des déchets",
            "environnement": "7. Environnement",
        })
        doc.add_page_break()

        # Partie C
        doc.add_heading("PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE", level=1)
        self._add_section(doc, content_json.get("partie_c", {}), {
            "methodologie": "1. Méthodologie détaillée",
            "effectifs": "2. Effectifs dédiés au chantier",
            "materiels": "3. Matériels dédiés au chantier",
            "hygiene_securite": "4. Hygiène et sécurité",
            "mesures_environnementales": "5. Mesures environnementales",
            "gpa": "6. Garantie de Parfait Achèvement (GPA)",
            "delai": "7. Délai de travaux",
        })

        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    def _add_title_page(self, doc: Document, organization) -> None:
        doc.add_paragraph()
        doc.add_paragraph()

        title = doc.add_heading("MÉMOIRE TECHNIQUE", level=1)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        doc.add_paragraph()
        p = doc.add_paragraph(organization.name if organization else "")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.runs[0] if p.runs else p.add_run(organization.name if organization else "")
        run.font.size = Pt(16)
        run.font.bold = True

        if organization and organization.siret:
            p2 = doc.add_paragraph(f"SIRET : {organization.siret}")
            p2.alignment = WD_ALIGN_PARAGRAPH.CENTER

        if organization and organization.address:
            p3 = doc.add_paragraph(organization.address)
            p3.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def _add_section(self, doc: Document, section_data: dict, labels: dict) -> None:
        for key, label in labels.items():
            content = section_data.get(key, "")
            if not content:
                continue
            doc.add_heading(label, level=2)
            doc.add_paragraph(str(content))
