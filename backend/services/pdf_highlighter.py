import fitz  # PyMuPDF
from pathlib import Path
import tempfile
import logging
import re

logger = logging.getLogger(__name__)


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
        Ouvre le PDF, cherche search_text sur la page indiquée, surligne en jaune.
        Retourne le path du PDF modifié (fichier temporaire).
        """
        if not pdf_path.exists():
            logger.error(f"PDF introuvable: {pdf_path}")
            return None

        if not search_text or not search_text.strip():
            return None

        try:
            doc = fitz.open(str(pdf_path))

            # page_number est 1-indexed, fitz est 0-indexed
            page_idx = page_number - 1
            if page_idx < 0 or page_idx >= len(doc):
                logger.warning(f"Page {page_number} hors limites (doc a {len(doc)} pages)")
                # Essayer de chercher dans toutes les pages
                page_idx = None
                for i in range(len(doc)):
                    page = doc[i]
                    if page.search_for(search_text[:50], quads=False):
                        page_idx = i
                        break
                if page_idx is None:
                    doc.close()
                    return None

            page = doc[page_idx]

            # Nettoyer le texte de recherche
            clean_search = search_text.strip()

            # Stratégie : chercher par morceaux et accumuler tous les rects
            all_rects = []

            search_lengths = [200, 150, 100, 80, 60, 40]
            for length in search_lengths:
                portion = clean_search[:length]
                rects = page.search_for(portion, quads=False)
                if rects:
                    all_rects.extend(rects)
                    # Chercher aussi la suite du texte pour couvrir toute la phrase
                    if len(clean_search) > length:
                        remaining = clean_search[length:length + 100]
                        if remaining.strip():
                            more_rects = page.search_for(remaining[:60], quads=False)
                            if more_rects:
                                all_rects.extend(more_rects)
                    break

            # Si rien trouvé, chercher par mots-clés
            if not all_rects:
                words = [w for w in re.split(r'\s+', clean_search) if len(w) > 4]
                for i in range(min(len(words) - 1, 5)):
                    partial = f"{words[i]} {words[i+1]}" if i + 1 < len(words) else words[i]
                    rects = page.search_for(partial, quads=False)
                    if rects:
                        all_rects.extend(rects)
                        break

            # Dernière tentative : chercher dans toutes les pages
            if not all_rects:
                for i in range(len(doc)):
                    if i == page_idx:
                        continue
                    p = doc[i]
                    rects = p.search_for(clean_search[:60], quads=False)
                    if rects:
                        all_rects.extend(rects)
                        page = p
                        page_idx = i
                        break

            found_rects = all_rects

            if not found_rects:
                logger.warning(f"Texte non trouvé dans le PDF: '{clean_search[:50]}...'")
                doc.close()
                return None

            # Ajouter les surlignages jaunes
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
