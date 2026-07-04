"""
Convention de nommage du RC (C13b) — détection + application déterministes.

Certains RC imposent un format de nommage des fichiers remis (ex.
« Les fichiers devront être nommés selon le format : NumLot_Entreprise_NomPiece »).
On détecte ce motif près des mots-clés de nommage et on le normalise en
template à placeholders {lot} / {entreprise} / {piece}.

Détection stricte : au moins deux segments reconnus dont {piece} — sinon
None et le nommage safe existant s'applique (jamais de renommage hasardeux).
"""
import re
import unicodedata
from typing import Optional

_KEYWORD_CTX = re.compile(
    r"(?:nommage|nomme?e?s|denomination|intitules?)\s+(?:des\s+|selon\s+|suivant\s+)?"
    r"|fichiers?\s+(?:seront|devront)\s+(?:etre\s+)?nommes?",
)

# Segments d'un motif type "NumLot_Entreprise_NomPiece" → placeholders.
_SEGMENT_MAP = {
    "lot": "{lot}", "numlot": "{lot}", "nolot": "{lot}", "numerolot": "{lot}",
    "entreprise": "{entreprise}", "candidat": "{entreprise}",
    "societe": "{entreprise}", "raisonsociale": "{entreprise}",
    "piece": "{piece}", "nompiece": "{piece}", "document": "{piece}",
    "nomdocument": "{piece}", "nomdufichier": "{piece}", "fichier": "{piece}",
}

_UNDERSCORE_PATTERN = re.compile(r"\b([A-Za-z°]{2,}(?:_[A-Za-z°]{2,}){1,3})\b")


def _norm(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _sanitize_segment(value: str) -> str:
    """Valeur sûre pour un nom de fichier (accents/espaces/spéciaux → _)."""
    nfkd = unicodedata.normalize("NFKD", value or "")
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", ascii_str).strip("_")
    return cleaned or "X"


def detect_naming_convention(rc_text: str) -> Optional[dict]:
    """Détecte une convention de nommage dans le texte du RC.

    Retourne {"template": "{lot}_{entreprise}_{piece}", "raw": "NumLot_..."}
    ou None si aucun motif fiable n'est trouvé."""
    if not rc_text:
        return None
    norm = _norm(rc_text)
    for kw in _KEYWORD_CTX.finditer(norm):
        window = norm[kw.end():kw.end() + 200]
        for m in _UNDERSCORE_PATTERN.finditer(window):
            segments = m.group(1).split("_")
            mapped = [_SEGMENT_MAP.get(_norm(seg).replace("°", "")) for seg in segments]
            if all(mapped) and "{piece}" in mapped and len(set(mapped)) >= 2:
                return {"template": "_".join(mapped), "raw": m.group(1)}
    return None


def apply_convention(template: str, *, lot: str, entreprise: str, piece: str) -> str:
    """Applique le template détecté avec des segments sanitisés."""
    return (
        template
        .replace("{lot}", _sanitize_segment(lot))
        .replace("{entreprise}", _sanitize_segment(entreprise))
        .replace("{piece}", _sanitize_segment(piece))
    )
