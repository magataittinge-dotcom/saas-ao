"""
Surlignage jaune d'un excerpt dans un PDF (C6) — STRICTEMENT verbatim.

Règle absolue : on ne surligne que si l'excerpt ENTIER est retrouvé à
l'identique sur la page (directement, ou par la totalité de ses segments —
des sous-chaînes verbatim découpées aux espaces pour absorber les retours
à la ligne du PDF). Excerpt introuvable ou partiel → None + log :
la page est servie sans surlignage, JAMAIS de faux surlignage.
"""
import fitz  # PyMuPDF
from pathlib import Path
import tempfile
import logging

logger = logging.getLogger(__name__)


def _split_into_segments(text: str, target_len: int = 45, min_len: int = 8) -> list[str]:
    """Découpe l'excerpt en sous-chaînes VERBATIM (~45 chars, coupées aux
    espaces) — nécessaires car search_for ne matche pas au-delà d'un saut
    de ligne du PDF."""
    segments = []
    remaining = text
    while remaining:
        if len(remaining) <= target_len:
            if len(remaining) >= min_len:
                segments.append(remaining)
            break
        cut = remaining.rfind(" ", min_len, target_len + 1)
        if cut == -1:
            cut = target_len
        segment = remaining[:cut].strip()
        if len(segment) >= min_len:
            segments.append(segment)
        remaining = remaining[cut:].strip()
    return segments


def _dedup_rects(rects: list) -> list:
    unique = []
    for r in rects:
        if not any(abs(r.x0 - u.x0) < 2 and abs(r.y0 - u.y0) < 2 for u in unique):
            unique.append(r)
    return unique


def _find_verbatim_on_page(page, clean_search: str) -> list | None:
    """Rects de l'excerpt ENTIER sur la page, ou None.

    1) Recherche directe du texte complet.
    2) Sinon : TOUS les segments verbatim doivent matcher — un seul segment
       manquant → None (surligner une partie serait un faux surlignage)."""
    rects = page.search_for(clean_search, quads=False)
    if rects:
        return _dedup_rects(rects)

    segments = _split_into_segments(clean_search)
    if not segments:
        return None
    all_rects = []
    for segment in segments:
        seg_rects = page.search_for(segment, quads=False)
        if not seg_rects:
            return None  # excerpt incomplet sur cette page → pas de surlignage
        all_rects.extend(seg_rects)
    return _dedup_rects(all_rects)


class PdfHighlighter:
    """Crée une copie d'un PDF avec un passage surligné en jaune."""

    @staticmethod
    def highlight_text_in_pdf(
        pdf_path: Path,
        page_number: int,
        search_text: str,
        output_dir: Path | None = None,
    ) -> Path | None:
        """
        Cherche search_text VERBATIM sur la page indiquée et surligne en jaune.
        Retourne le path du PDF modifié, ou None si l'excerpt n'est pas
        retrouvé à l'identique (l'appelant sert alors la page sans surlignage).
        """
        if not pdf_path.exists():
            logger.error(f"PDF introuvable: {pdf_path}")
            return None

        if not search_text or not search_text.strip():
            return None

        try:
            doc = fitz.open(str(pdf_path))
            clean_search = " ".join(search_text.split())

            # page_number est 1-indexed, fitz est 0-indexed
            page_idx = page_number - 1
            if 0 <= page_idx < len(doc):
                page = doc[page_idx]
                found_rects = _find_verbatim_on_page(page, clean_search)
            else:
                # Numéro de page invalide (métadonnée IA erronée) : on cherche
                # la SEULE page contenant l'excerpt entier — toujours verbatim.
                logger.warning(f"Page {page_number} hors limites (doc a {len(doc)} pages)")
                page, found_rects = None, None
                for i in range(len(doc)):
                    rects = _find_verbatim_on_page(doc[i], clean_search)
                    if rects:
                        page, page_idx, found_rects = doc[i], i, rects
                        break

            if not found_rects:
                logger.warning(
                    "Excerpt non trouvé verbatim page %s — page servie sans "
                    "surlignage (jamais de faux surlignage) : '%s…'",
                    page_number, clean_search[:60],
                )
                doc.close()
                return None

            # Ajouter les surlignages jaunes (toutes les lignes de l'excerpt)
            for rect in found_rects:
                highlight = page.add_highlight_annot(rect)
                highlight.set_colors(stroke=(1, 0.95, 0))  # Jaune vif
                highlight.set_opacity(0.4)
                highlight.update()

            # Sauvegarder dans un fichier temporaire
            if output_dir is None:
                output_dir = Path(tempfile.gettempdir()) / "synorix_highlights"
            output_dir.mkdir(parents=True, exist_ok=True)

            output_path = output_dir / f"highlight_{pdf_path.stem}_p{page_number}.pdf"
            doc.save(str(output_path), garbage=4, deflate=True)
            doc.close()

            logger.info(f"PDF surligné créé: {output_path} ({len(found_rects)} zones)")
            return output_path

        except Exception as e:
            logger.error(f"Erreur surlignage PDF: {e}")
            return None
