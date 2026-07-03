"""
Synorix Score go/no-go (C18) — déterministe, 0 € API, AUCUN LLM.

Croisement factuel : exigences extraites du DCE × profil de l'entreprise
(Mon entreprise + coffre-fort). Cinq composantes, chacune ok/warning/ko/
non_evaluable + explication factuelle + source.

Règles d'honnêteté :
  • Profil incomplet → composante "non_evaluable", EXCLUE du score (jamais
    pénalisante à tort) avec action « compléter mon profil ».
  • Le verdict lit le contrat et le profil — il ne commente JAMAIS le prix
    de l'utilisateur ni ne donne de conseil de chiffrage.
"""
import re
import unicodedata
from datetime import date
from typing import List, Optional

# Poids des composantes dans le score /100 (pondération simple).
_WEIGHTS = {"ca": 25, "qualifications": 25, "ponderation": 20, "delai": 20, "penalites": 10}
_STATUS_POINTS = {"ok": 1.0, "warning": 0.5, "ko": 0.0}

_QUAL_KEYWORDS = {
    "qualibat": ["qualibat"],
    "rge": ["rge", "reconnu garant de l'environnement"],
    "caces": ["caces"],
    "amiante_ss4": ["amiante", "ss4", "sous-section 4", "sous section 4"],
}
_QUAL_LABELS = {"qualibat": "Qualibat", "rge": "RGE", "caces": "CACES", "amiante_ss4": "Amiante SS4"}

_CA_REQ_RE = re.compile(r"chiffre\s+d'?affaires", re.IGNORECASE)
_AMOUNT_RE = re.compile(r'(\d{1,3}(?:[  .]\d{3})+|\d{4,})\s*(?:€|euros?)', re.IGNORECASE)
_MULTIPLIER_RE = re.compile(r'(\d(?:[.,]\d)?)\s*fois\s+le\s+montant', re.IGNORECASE)
_PENALTY_AMOUNT_RE = re.compile(r'(\d[\d\s .,]*)\s*€')

_HEAVY_PENALTY_THRESHOLD = 1000  # €/jour


def _norm(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def parse_amount(raw: str) -> Optional[int]:
    """« 1 200 000 € HT », « 600000 euros » → 1200000 / 600000."""
    if not raw:
        return None
    m = _AMOUNT_RE.search(raw)
    digits = m.group(1) if m else None
    if digits is None:
        # Montant sans symbole € (ex. champ profil « 1 200 000 »)
        stripped = re.sub(r'[  .]', '', raw.strip())
        return int(stripped) if stripped.isdigit() else None
    return int(re.sub(r'[  .]', '', digits))


def _source_of(req) -> Optional[dict]:
    doc = getattr(req, "source_document", None)
    if not doc:
        return None
    return {"document": doc, "page": getattr(req, "source_page", None), "excerpt": None}


def _comp(cid: str, label: str, statut: str, explication: str,
          source: Optional[dict] = None, action: Optional[str] = None) -> dict:
    return {
        "id": cid, "label": label, "statut": statut,
        "explication": explication, "source": source, "action": action,
    }


# ─── Composantes ──────────────────────────────────────────────────────────────

def _eval_ca(compliance_items, memoire_config, infos_marche) -> dict:
    label = "Chiffre d'affaires exigé"
    ca_reqs = [r for r in compliance_items if _CA_REQ_RE.search(getattr(r, "exigence_text", "") or "")]
    if not ca_reqs:
        return _comp("ca", label, "ok", "Le RC n'exige pas de chiffre d'affaires minimum.")

    req = ca_reqs[0]
    req_text = req.exigence_text
    required = parse_amount(req_text)
    if required is None:
        m = _MULTIPLIER_RE.search(req_text)
        if m:
            montant = parse_amount((infos_marche or {}).get("montant_estime") or "")
            if montant:
                required = int(float(m.group(1).replace(",", ".")) * montant)
    if required is None:
        return _comp(
            "ca", label, "non_evaluable",
            "Le RC exige un chiffre d'affaires minimum mais son montant n'a "
            "pas pu être déterminé — vérifiez la clause.",
            _source_of(req),
        )

    ca_rows = getattr(memoire_config, "chiffre_affaires", None) if memoire_config else None
    if not ca_rows:
        return _comp(
            "ca", label, "non_evaluable",
            f"Le RC exige un CA d'au moins {required:,} € — renseignez votre "
            "chiffre d'affaires dans Mon entreprise pour évaluer ce point.".replace(",", " "),
            _source_of(req), action="completer_profil",
        )
    latest = max(ca_rows, key=lambda row: str(row.get("annee", "")))
    ca_org = parse_amount(str(latest.get("montant", "")))
    if ca_org is None:
        return _comp(
            "ca", label, "non_evaluable",
            "Votre chiffre d'affaires renseigné n'est pas exploitable — "
            "corrigez-le dans Mon entreprise.",
            _source_of(req), action="completer_profil",
        )

    required_txt = f"{required:,} €".replace(",", " ")
    ca_txt = f"{ca_org:,} €".replace(",", " ")
    if ca_org >= required:
        statut, verdict_txt = "ok", "votre CA couvre l'exigence"
    elif ca_org >= 0.8 * required:
        statut, verdict_txt = "warning", "votre CA est proche du seuil exigé"
    else:
        statut, verdict_txt = "ko", "votre CA est en dessous du seuil exigé"
    return _comp(
        "ca", label, statut,
        f"CA exigé : {required_txt} · votre CA ({latest.get('annee', '?')}) : {ca_txt} — {verdict_txt}.",
        _source_of(req),
    )


def _eval_qualifications(compliance_items, vault_docs) -> dict:
    label = "Qualifications exigées"
    required: dict = {}
    for req in compliance_items:
        text = _norm(getattr(req, "exigence_text", "") or "")
        for qual, keywords in _QUAL_KEYWORDS.items():
            if qual not in required and any(kw in text for kw in keywords):
                required[qual] = req
    if not required:
        return _comp("qualifications", label, "ok",
                     "Aucune qualification spécifique exigée dans le DCE.")

    if not vault_docs:
        quals = ", ".join(_QUAL_LABELS[q] for q in required)
        return _comp(
            "qualifications", label, "non_evaluable",
            f"Le DCE exige : {quals}. Votre coffre-fort est vide — ajoutez vos "
            "qualifications pour évaluer ce point.",
            _source_of(next(iter(required.values()))), action="completer_profil",
        )

    held = {}
    for doc in vault_docs:
        held.setdefault(doc.type, []).append(doc)

    missing, warning_quals, ok_quals = [], [], []
    for qual in required:
        docs = held.get(qual, [])
        if not docs:
            missing.append(_QUAL_LABELS[qual])
        elif any(d.status in ("valid", "expiring_soon") for d in docs):
            ok_quals.append(_QUAL_LABELS[qual])
        else:
            warning_quals.append(_QUAL_LABELS[qual])

    first_source = _source_of(next(iter(required.values())))
    if missing:
        return _comp(
            "qualifications", label, "ko",
            f"Exigée(s) mais absente(s) de votre coffre-fort : {', '.join(missing)}.",
            first_source,
        )
    if warning_quals:
        return _comp(
            "qualifications", label, "warning",
            f"Détenue(s) mais expirée(s) ou à vérifier : {', '.join(warning_quals)} — "
            "mettez le justificatif à jour avant le dépôt.",
            first_source,
        )
    return _comp(
        "qualifications", label, "ok",
        f"Toutes les qualifications exigées sont dans votre coffre-fort : {', '.join(ok_quals)}.",
        first_source,
    )


def _eval_ponderation(criteres_jugement) -> dict:
    label = "Pondération prix / technique"
    if not criteres_jugement:
        return _comp("ponderation", label, "non_evaluable",
                     "Critères de notation non identifiés dans le RC.")
    total = sum(c.get("poids", 0) for c in criteres_jugement) or 100
    prix = sum(c.get("poids", 0) for c in criteres_jugement if re.search(r'prix', c.get("nom", ""), re.IGNORECASE))
    technique_pct = round((total - prix) / total * 100)
    if technique_pct >= 50:
        return _comp("ponderation", label, "ok",
                     f"La technique pèse {technique_pct} % : le mémoire peut faire la "
                     "différence — favorable aux PME techniques.")
    if technique_pct >= 30:
        return _comp("ponderation", label, "warning",
                     f"La technique ne pèse que {technique_pct} % : le prix sera "
                     "déterminant dans la notation.")
    return _comp("ponderation", label, "ko",
                 f"La technique ne pèse que {technique_pct} % : ce marché se "
                 "jouera essentiellement sur le prix.")


def _eval_delai(critical_fields, today: Optional[date]) -> dict:
    label = "Délai de remise restant"
    remise = ((critical_fields or {}).get("date_limite_remise") or {}).get("value") or {}
    if not remise.get("date"):
        return _comp("delai", label, "non_evaluable",
                     "Date limite de remise non identifiée.")
    try:
        deadline = date.fromisoformat(remise["date"])
    except ValueError:
        return _comp("delai", label, "non_evaluable",
                     "Date limite de remise illisible.")
    days = (deadline - (today or date.today())).days
    source = ((critical_fields or {}).get("date_limite_remise") or {}).get("source")
    if days < 0:
        return _comp("delai", label, "ko", "La date limite de remise est dépassée.", source)
    if days < 7:
        return _comp("delai", label, "ko",
                     f"Il reste {days} jour(s) — très court pour un dossier complet.", source)
    if days < 14:
        return _comp("delai", label, "warning",
                     f"Il reste {days} jours — planning serré mais tenable.", source)
    return _comp("delai", label, "ok", f"Il reste {days} jours pour préparer la réponse.", source)


def _eval_penalites(critical_fields) -> dict:
    label = "Pénalités"
    pen = ((critical_fields or {}).get("penalites") or {}).get("value")
    source = ((critical_fields or {}).get("penalites") or {}).get("source")
    if not pen:
        return _comp("penalites", label, "ok",
                     "Aucune pénalité notable relevée dans les documents analysés.")
    retard = pen.get("retard") or ""
    plafond = pen.get("plafond")
    amount = None
    m = _PENALTY_AMOUNT_RE.search(retard)
    if m:
        digits = re.sub(r'[^\d]', '', m.group(1))
        amount = int(digits) if digits else None
    heavy = (amount is not None and amount >= _HEAVY_PENALTY_THRESHOLD) or not plafond
    if heavy:
        detail = f"{retard}" + (f", plafond {plafond}" if plafond else ", sans plafond identifié")
        return _comp("penalites", label, "warning",
                     f"Pénalités lourdes au contrat : {detail}.", source)
    return _comp("penalites", label, "ok",
                 f"Pénalités contractuelles : {retard}, plafond {plafond}.", source)


# ─── Agrégation ───────────────────────────────────────────────────────────────

def build_score(
    memoire_config,
    vault_docs: List,
    compliance_items: List,
    criteres_jugement: Optional[list],
    critical_fields: Optional[dict],
    infos_marche: Optional[dict],
    today: Optional[date] = None,
) -> dict:
    composantes = [
        _eval_ca(compliance_items, memoire_config, infos_marche),
        _eval_qualifications(compliance_items, vault_docs),
        _eval_ponderation(criteres_jugement),
        _eval_delai(critical_fields, today),
        _eval_penalites(critical_fields),
    ]

    evaluable = [c for c in composantes if c["statut"] != "non_evaluable"]
    if not evaluable:
        return {"score": None, "verdict": None, "composantes": composantes}

    total_weight = sum(_WEIGHTS[c["id"]] for c in evaluable)
    points = sum(_WEIGHTS[c["id"]] * _STATUS_POINTS[c["statut"]] for c in evaluable)
    score = round(points / total_weight * 100)

    if score >= 70:
        verdict = "go"
    elif score >= 45:
        verdict = "vigilance"
    else:
        verdict = "no_go"
    return {"score": score, "verdict": verdict, "composantes": composantes}
