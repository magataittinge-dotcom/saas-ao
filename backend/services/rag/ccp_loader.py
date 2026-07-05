"""
Loader du Code de la commande publique (édition codes.droit.org, PDF).

Produit une liste d'articles structurés :
    {"ref": "R2143-3", "texte": <texte intégral verbatim>,
     "hierarchie": "Partie réglementaire › DEUXIÈME PARTIE : MARCHÉS PUBLICS › …"}

Un article = un chunk (jamais de coupe mi-article — cf. TASKS RAG item 2).

Structure du PDF :
  • 1re ligne de chaque page = fil d'Ariane « Partie X - PARTIE - Livre … »
  • Marqueur d'article : « L. 2100-1  Ordonnance n° … » / « R. 2113-8  Décret … »
  • Bruit de mise en page : lignes Legif./Plan/Jp.Judi./Jp.Admin./Juricaf,
    liens externes (service-public.fr, lignes « > … »), pieds de page.
  • Titres de sections : Livre/Titre/Chapitre/Section/Sous-section/Paragraphe.
"""
import re
from pathlib import Path
from typing import List, Optional

import fitz

# « L. 2100-1 » / « R. 2143-3 » / « D. 1414-5 » en début de ligne.
# ⚠️ La ligne doit AUSSI porter la source légale (Ordonnance/Décret/Loi…) :
# le PDF contient des tables de concordance (« Versions applicables », p.114+)
# dont chaque ligne commence par une ref nue — ce ne sont PAS des articles
# (bug détecté : L2100-1 écrasé par « Au titre Ier »).
_ARTICLE_RE = re.compile(r"^([LRD])\.\s*(\d{4}-\d+(?:-\d+)?)\b(.*)$")
_LEGAL_MARKER_RE = re.compile(
    r"\s(Ordonnance|Décret|DÉCRET|LOI|Loi|Arrêté|Décision|Ord\.)\b"
)

_HEADING_RE = re.compile(
    r"^(Livre|LIVRE|Titre|TITRE|Chapitre|Section|Sous-section|Paragraphe)\b"
)

# Lignes de navigation/bruit à éliminer du texte des articles
_NOISE_RE = re.compile(
    r"^\s*(Legif\.|Plan|Jp\.Judi\.|Jp\.Admin\.|Juricaf|>.*|service-public\.fr"
    r"|Code de la commande publique.*|p\.\d+|codes\.droit\.org.*)\s*$"
)

# Ligne de source légale qui suit la référence d'article sur la même ligne
_LEGAL_SOURCE_RE = re.compile(
    r"\s+(Ordonnance|Décret|LOI|Loi|DÉCRET|Arrêté|Décision)\b.*$"
)


def extract_edition_date(pdf_path: Path) -> Optional[str]:
    """« Edition : 2026-06-19 » en page 1 → version du corpus."""
    with fitz.open(str(pdf_path)) as doc:
        m = re.search(r"Edition\s*:\s*(\d{4}-\d{2}-\d{2})", doc[0].get_text())
    return m.group(1) if m else None


def _is_breadcrumb(line: str) -> bool:
    return line.startswith(("Partie législative", "Partie réglementaire")) and " - " in line


def load_ccp_articles(pdf_path: Path) -> List[dict]:
    articles: List[dict] = []
    current: Optional[dict] = None
    breadcrumb = ""
    sections: List[str] = []

    def close_current():
        nonlocal current
        if current is None:
            return
        texte = "\n".join(current["lines"]).strip()
        if texte:
            articles.append({
                "ref": current["ref"],
                "texte": texte,
                "hierarchie": current["hierarchie"],
            })
        current = None

    with fitz.open(str(pdf_path)) as doc:
        for page in doc:
            for raw_line in page.get_text().splitlines():
                line = raw_line.rstrip()
                stripped = line.strip()
                if not stripped:
                    continue

                if _is_breadcrumb(stripped):
                    if stripped.replace(" ", "") != breadcrumb.replace(" ", ""):
                        # Nouvelle section : l'article courant ne peut pas la
                        # chevaucher (évite d'absorber tables/annexes).
                        close_current()
                        breadcrumb = stripped
                        sections = []
                    continue

                if _NOISE_RE.match(stripped):
                    continue

                m = _ARTICLE_RE.match(stripped)
                if m and _LEGAL_MARKER_RE.search(m.group(3)):
                    close_current()
                    hierarchie = " › ".join(
                        [p.strip() for p in breadcrumb.split(" - ")] + sections
                    )
                    current = {
                        "ref": f"{m.group(1)}{m.group(2)}",
                        "hierarchie": hierarchie,
                        "lines": [],
                    }
                    continue

                if _HEADING_RE.match(stripped):
                    # Titre de section : ferme l'article courant, met à jour le
                    # contexte (on ne garde que le dernier niveau rencontré —
                    # suffisant pour la contextualisation).
                    close_current()
                    sections = [stripped]
                    continue

                if current is not None:
                    current["lines"].append(stripped)

    close_current()
    return articles
