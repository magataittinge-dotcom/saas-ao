"""
Bandeau critique de l'analyse (C5) — extraction structurée déterministe, 0 € API.

Pour chaque lot analysé, produit des champs structurés avec leur source :
    {"value": ..., "source": {"document", "page", "excerpt"} | None}

Priorité aux données déjà extraites par l'analyse (infos_marche,
criteres_jugement) ; à défaut, extraction regex CIBLÉE sur le RC/CCAP.
Un champ absent du DCE vaut null EXPLICITE — jamais inventé.

Limite connue : les textes extraits ne conservent pas les frontières de
pages → source.page est null pour les champs localisés par regex ; le
front ouvre alors le document avec surlignage de l'excerpt.
"""
import re
import unicodedata
from datetime import date
from typing import List, Optional

_MONTHS_FR = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "decembre": 12,
}

_DATE_NUMERIC = re.compile(r'\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b')
_DATE_ISO = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b')
_DATE_TEXTUAL = re.compile(
    r'\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|'
    r'septembre|octobre|novembre|decembre)\s+(\d{4})\b'
)
_TIME = re.compile(r'\b(\d{1,2})\s*[hH]\s*(\d{2})?\b')


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def parse_french_date(raw: str) -> Optional[date]:
    """« 30/09/2026 », « 2026-09-30 », « 15 avril 2026 », « 1er février 2027 »."""
    if not raw:
        return None
    text = _strip_accents(raw.lower())
    m = _DATE_NUMERIC.search(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    m = _DATE_ISO.search(text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = _DATE_TEXTUAL.search(text)
    if m:
        try:
            return date(int(m.group(3)), _MONTHS_FR[m.group(2)], int(m.group(1)))
        except (ValueError, KeyError):
            return None
    return None


def _field(value, source=None) -> dict:
    # Invariant : pas de source sans valeur.
    return {"value": value, "source": source if value is not None else None}


def _excerpt_around(text: str, match_start: int, match_end: int, radius: int = 80) -> str:
    start = max(0, match_start - radius)
    end = min(len(text), match_end + radius)
    return " ".join(text[start:end].split())


def _find_in_docs(docs: List, pattern: re.Pattern, doc_types=("rc", "ccap")):
    """Première occurrence du motif dans les documents ciblés.

    Retourne (match, source_dict) ou (None, None). Les docs RC/CCAP sont
    scannés en priorité, chacun sur son texte débarrassé des accents."""
    prioritized = sorted(
        docs, key=lambda d: 0 if (getattr(d, "type", "") or "") in doc_types else 1,
    )
    for doc in prioritized:
        if (getattr(doc, "type", "") or "") not in doc_types:
            continue
        text = getattr(doc, "extracted_text", None) or ""
        if not text or text.startswith("[document volumineux"):
            continue
        norm = _strip_accents(text.lower())
        m = pattern.search(norm)
        if m:
            return m, {
                "document": doc.file_name,
                "page": None,  # frontières de pages non conservées dans le texte
                "excerpt": _excerpt_around(text, m.start(), m.end()),
            }
    return None, None


def _locate_value(docs: List, needle: str, doc_types=("rc", "ccap")):
    """Source d'une valeur déjà extraite par l'analyse : on la retrouve dans
    le texte pour la sourcer (doc + excerpt)."""
    if not needle:
        return None
    _, source = _find_in_docs(docs, re.compile(re.escape(_strip_accents(needle.lower()))), doc_types)
    return source


# ─── Extracteurs ciblés ───────────────────────────────────────────────────────

_REMISE_CTX = re.compile(
    r'(?:remise\s+des\s+offres|les\s+offres[^.]{0,120}?|date\s+limite\s+de\s+(?:remise|reception))'
    r'[^.]{0,150}?(\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}(?:er)?\s+\w+\s+\d{4})',
    re.DOTALL,
)


def _time_near_date(excerpt: str, target: Optional[date] = None) -> Optional[str]:
    """« … le 30/09/2026 à 12h00 » → « 12h00 ».

    L'heure est cherchée juste après LA date visée (l'excerpt peut contenir
    d'autres dates — ex. celle de la visite — avec leur propre horaire)."""
    if not excerpt:
        return None
    norm = _strip_accents(excerpt.lower())
    anchor_end = None
    for m in list(_DATE_NUMERIC.finditer(norm)) + list(_DATE_TEXTUAL.finditer(norm)):
        parsed = parse_french_date(m.group(0))
        if target is None or parsed == target:
            anchor_end = m.end()
            if target is not None:
                break
    if anchor_end is None:
        return None
    t = _TIME.search(norm[anchor_end:anchor_end + 30])
    if not t:
        return None
    return f"{int(t.group(1))}h{t.group(2) or '00'}"

_QUESTIONS_CTX = re.compile(
    r'(?:questions|renseignements?\s+complementaires?|demandes?\s+de\s+renseignements?)'
    r'[^.]{0,250}?(?:au\s+plus\s+tard\s+le|avant\s+le|jusqu\'?au)\s*'
    r'(\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}(?:er)?\s+\w+\s+\d{4})',
    re.DOTALL,
)

_VISITE_DATE_CTX = re.compile(
    r'visite[^.]{0,200}?(?:le|du)\s*'
    r'(\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}(?:er)?\s+\w+\s+\d{4})',
    re.DOTALL,
)

_VISITE_MENTION = re.compile(r'visite\s+(?:du|de|sur)\s+(?:site|chantier|lieux)|visite\s+obligatoire')

_PLAFOND_CTX = re.compile(
    r'(?:plafonn?\w*|plafond)[^.]{0,80}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%',
    re.DOTALL,
)

_PENALITE_CTX = re.compile(
    r'penalite[^.]{0,200}?(\d[\d\s.,/]*\s*(?:€|euros?)\s*(?:ht\s*)?(?:par|/)\s*jour|1\s*/\s*\d{3,4})',
    re.DOTALL,
)


def build_critical_fields(infos_marche: Optional[dict], criteres_jugement: Optional[list],
                          docs: List) -> dict:
    """Champs critiques structurés + sources, pour le lot en cours d'analyse."""
    infos = infos_marche or {}

    # ── Deadline de remise (analyse d'abord, heure via regex) ────────────────
    remise_value = None
    remise_source = None
    raw_deadline = infos.get("date_limite_reponse")
    m, source = _find_in_docs(docs, _REMISE_CTX)
    if raw_deadline:
        parsed = parse_french_date(raw_deadline)
        remise_source = source or _locate_value(docs, raw_deadline)
        remise_value = {
            "date": parsed.isoformat() if parsed else raw_deadline,
            "heure": _time_near_date((remise_source or {}).get("excerpt", ""), parsed),
        }
    elif m:
        parsed = parse_french_date(m.group(1))
        if parsed:
            remise_value = {
                "date": parsed.isoformat(),
                "heure": _time_near_date((source or {}).get("excerpt", ""), parsed),
            }
            remise_source = source

    # ── Date limite des questions (regex ciblée) ─────────────────────────────
    questions_value = None
    questions_source = None
    raw_questions = infos.get("date_limite_questions")
    if raw_questions:
        parsed = parse_french_date(raw_questions)
        questions_value = parsed.isoformat() if parsed else raw_questions
        questions_source = _locate_value(docs, raw_questions)
    else:
        m, source = _find_in_docs(docs, _QUESTIONS_CTX)
        if m:
            parsed = parse_french_date(m.group(1))
            if parsed:
                questions_value = parsed.isoformat()
                questions_source = source

    # ── Visite de site ────────────────────────────────────────────────────────
    visite = infos.get("visite_site") or {}
    visite_details = visite.get("details") or ""
    if visite.get("obligatoire") is True:
        statut = "obligatoire"
    elif visite.get("obligatoire") is False:
        statut = "facultative"
    else:
        m_mention, _ = _find_in_docs(docs, _VISITE_MENTION)
        statut = "facultative" if m_mention else "non_mentionnee"

    visite_date = None
    raw_vdate = visite.get("date")  # extrait nativement par l'analyse (prompt C5)
    if raw_vdate:
        parsed = parse_french_date(raw_vdate)
        visite_date = parsed.isoformat() if parsed else raw_vdate
    if visite_date is None:
        parsed = parse_french_date(visite_details)
        if parsed:
            visite_date = parsed.isoformat()
    visite_source = None
    if visite_date is None:
        m, source = _find_in_docs(docs, _VISITE_DATE_CTX)
        if m:
            parsed = parse_french_date(m.group(1))
            if parsed:
                visite_date = parsed.isoformat()
                visite_source = source
    if visite_source is None and statut != "non_mentionnee":
        m, visite_source = _find_in_docs(docs, _VISITE_MENTION)

    visite_value = None
    if statut != "non_mentionnee" or visite.get("obligatoire") is not None:
        visite_value = {"statut": statut, "date": visite_date}
    else:
        visite_value = {"statut": "non_mentionnee", "date": None}

    # ── Critères de notation (analyse) ───────────────────────────────────────
    criteres_value = criteres_jugement or None
    criteres_source = None
    if criteres_value:
        m, criteres_source = _find_in_docs(
            docs, re.compile(r'jugement\s+des\s+offres|criteres?\s+d[e\']\s*(?:attribution|jugement)'),
        )

    # ── Pénalités : montant/jour + plafond ───────────────────────────────────
    penalites_value = None
    penalites_source = None
    retard = infos.get("penalites_retard")
    if not retard:
        m, source = _find_in_docs(docs, _PENALITE_CTX, doc_types=("ccap", "rc"))
        if m:
            retard = " ".join(m.group(1).split())
            penalites_source = source
    plafond = None
    m, plafond_source = _find_in_docs(docs, _PLAFOND_CTX, doc_types=("ccap", "rc"))
    if m:
        plafond = f"{m.group(1)} % du montant du marché"
    if retard or plafond:
        penalites_value = {"retard": retard, "plafond": plafond}
        penalites_source = penalites_source or plafond_source or _locate_value(docs, retard or "", ("ccap", "rc"))

    # ── Délai d'exécution ─────────────────────────────────────────────────────
    delai_value = infos.get("duree_marche") or None
    delai_source = _locate_value(docs, delai_value or "", ("ccap", "rc")) if delai_value else None
    if delai_source is None and delai_value:
        m, delai_source = _find_in_docs(
            docs, re.compile(r'delai\s+d[\'e]\s*execution[^.]{0,120}'), ("ccap", "rc"),
        )

    return {
        "date_limite_remise": _field(remise_value, remise_source),
        "date_limite_questions": _field(questions_value, questions_source),
        "visite_site": {
            # La visite a toujours une valeur (statut non_mentionnee est une
            # information en soi) mais une source uniquement si mentionnée.
            "value": visite_value,
            "source": visite_source,
        },
        "criteres": _field(criteres_value, criteres_source),
        "penalites": _field(penalites_value, penalites_source),
        "delai_execution": _field(delai_value, delai_source),
    }
