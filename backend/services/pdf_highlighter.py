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

            # Découper le texte en segments de ~45 chars, coupés aux espaces
            def split_into_segments(text: str, target_len: int = 45, min_len: int = 15) -> list[str]:
                segments = []
                remaining = text
                while remaining:
                    if len(remaining) <= target_len:
                        if len(remaining) >= min_len:
                            segments.append(remaining)
                        break
                    # Couper au dernier espace avant target_len
                    cut = remaining.rfind(" ", min_len, target_len + 1)
                    if cut == -1:
                        cut = target_len
                    segment = remaining[:cut].strip()
                    if len(segment) >= min_len:
                        segments.append(segment)
                    remaining = remaining[cut:].strip()
                return segments

            # Dédupliquer les rectangles (tolérance 2pt)
            def dedup_rects(rects: list) -> list:
                unique = []
                for r in rects:
                    if not any(abs(r.x0 - u.x0) < 2 and abs(r.y0 - u.y0) < 2 for u in unique):
                        unique.append(r)
                return unique

            # Stratégie principale : chercher chaque segment individuellement
            all_rects = []
            segments = split_into_segments(clean_search)
            for segment in segments:
                rects = page.search_for(segment, quads=False)
                all_rects.extend(rects)

            all_rects = dedup_rects(all_rects)

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
                    page_rects = []
                    for segment in segments:
                        page_rects.extend(p.search_for(segment, quads=False))
                    page_rects = dedup_rects(page_rects)
                    if page_rects:
                        all_rects.extend(page_rects)
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
