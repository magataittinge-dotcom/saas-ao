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
    if segments:
        all_rects = []
        for segment in segments:
            seg_rects = page.search_for(segment, quads=False)
            if not seg_rects:
                all_rects = None
                break  # excerpt incomplet sur cette page
            all_rects.extend(seg_rects)
        if all_rects:
            return _dedup_rects(all_rects)

    # 3) Séquence de MOTS normalisés : couvre les écarts d'espaces/césures/
    #    apostrophes entre l'excerpt (extrait du texte) et le rendu page.
    #    All-or-nothing : la séquence ENTIÈRE ou rien (jamais de faux
    #    surlignage partiel).
    return _find_word_sequence_on_page(page, clean_search)


def _norm_word(w: str) -> str:
    import unicodedata
    w = unicodedata.normalize("NFKD", w)
    w = "".join(c for c in w if not unicodedata.combining(c))
    for a, b in (("’", "'"), ("‘", "'"), ("–", "-"), ("—", "-")):
        w = w.replace(a, b)
    return "".join(ch for ch in w.lower() if ch.isalnum())


def _find_word_sequence_on_page(page, clean_search: str) -> list | None:
    target = [_norm_word(w) for w in clean_search.split()]
    target = [w for w in target if w]
    if len(target) < 3:
        return None
    words = page.get_text("words")  # (x0, y0, x1, y1, texte, ...)
    page_norm = [(_norm_word(w[4]), w) for w in words]
    n = len(target)
    for i in range(len(page_norm) - n + 1):
        ok = True
        for j, t in enumerate(target):
            pw = page_norm[i + j][0]
            if pw == t or (t and pw and (t in pw or pw in t) and min(len(t), len(pw)) >= 3):
                continue
            ok = False
            break
        if ok:
            rects = [fitz.Rect(w[1][:4]) for w in page_norm[i:i + n]]
            return _dedup_rects(rects)
    return None


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

            # Surlignage jaune : rectangles semi-transparents dessinés SOUS
            # le texte (overlay=False, contenu de page) — rendu net garanti
            # sur tous les viewers. Les annotations Highlight (appearance
            # PyMuPDF) déformaient le texte de la ligne dans PDF.js.
            for rect in found_rects:
                page.draw_rect(
                    rect.irect + (-1, -1, 1, 1),
                    color=None, fill=(1, 0.93, 0.35),
                    fill_opacity=0.45, overlay=False,
                )

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
