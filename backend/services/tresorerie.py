"""
Traduction trésorerie du CCAP (C19) — déterministe, 0 € API.

On LIT le contrat (faits CCAP déjà extraits par l'analyse + regex ciblées)
et on le traduit « en clair » pour un patron de PME BTP.

FRONTIÈRE FERME (CLAUDE.md) : Synorix ne commente JAMAIS le prix de
l'utilisateur et ne donne AUCUN conseil de chiffrage. Chaque ligne est une
lecture factuelle du contrat, sourcée.

Sortie : liste de lignes {id, label, valeur, explication, formule?, source}.
Champ absent du CCAP → ligne omise (jamais de « non trouvé » anxiogène).
"""
import re
from typing import List, Optional

from services.critical_fields import _find_in_docs  # helper de sourcing partagé

_AVANCE_CTX = re.compile(r'avance[^.]{0,150}?(\d{1,2}(?:[.,]\d)?)\s*%', re.DOTALL)
_DELAI_PAIEMENT_CTX = re.compile(
    r'delai\s+(?:global\s+)?de\s+paiement[^.]{0,80}?(\d{1,3})\s*jours', re.DOTALL,
)
_RG_CTX = re.compile(r'retenue\s+de\s+garantie[^.]{0,120}?(\d{1,2}(?:[.,]\d)?)\s*%', re.DOTALL)
_CAUTION_CTX = re.compile(
    r'(?:remplac\w+[^.]{0,80}?)?(?:garantie\s+a\s+premiere\s+demande|caution)', re.DOTALL,
)
_PENALITE_CTX = re.compile(
    r'penalite[^.]{0,200}?(\d[\d\s.,]*\s*(?:€|euros?)\s*(?:ht\s*)?(?:par|/)\s*jour|1\s*/\s*\d{3,4})',
    re.DOTALL,
)
_PLAFOND_CTX = re.compile(r'plafonn?\w*[^.]{0,80}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%', re.DOTALL)
_PRIX_FERMES = re.compile(r'prix\s+(?:sont\s+)?fermes')
_PRIX_REVISABLES = re.compile(r'revis(?:able|ion)|actualisation\s+des\s+prix')
_FORMULE = re.compile(r'(P\s*=\s*P0?[^.\n]{0,120})')


def _ligne(lid: str, label: str, valeur: str, explication: str,
           source: Optional[dict] = None, formule: Optional[str] = None) -> dict:
    out = {
        "id": lid, "label": label, "valeur": valeur,
        "explication": explication, "source": source,
    }
    if lid == "revision_prix":
        out["formule"] = formule
    return out


def build_tresorerie(infos_marche: Optional[dict], docs: List) -> List[dict]:
    """Tableau « Trésorerie du marché » — uniquement les faits présents."""
    infos = infos_marche or {}
    paiement = infos.get("conditions_paiement") or {}
    lignes: List[dict] = []

    # ── Avance ────────────────────────────────────────────────────────────────
    avance_pct = paiement.get("avance_pct")
    m, source = _find_in_docs(docs, _AVANCE_CTX, ("ccap", "rc"))
    if avance_pct is None and m:
        avance_pct = m.group(1).replace(",", ".")
    if avance_pct is not None:
        lignes.append(_ligne(
            "avance", "Avance",
            f"{avance_pct} % du montant du marché",
            "Somme versée au démarrage, avant tout travail facturé — elle se "
            "rembourse ensuite sur vos situations.",
            source,
        ))

    # ── Délai de paiement ─────────────────────────────────────────────────────
    delai = paiement.get("delai_jours")
    m, source = _find_in_docs(docs, _DELAI_PAIEMENT_CTX, ("ccap", "rc"))
    if delai is None and m:
        delai = int(m.group(1))
    if delai is not None:
        lignes.append(_ligne(
            "delai_paiement", "Délai de paiement",
            f"{delai} jours",
            "Temps maximum entre votre facture (situation) et le virement de "
            "l'acheteur public.",
            source,
        ))

    # ── Retenue de garantie ───────────────────────────────────────────────────
    rg_pct = infos.get("retenue_garantie_pct")
    m, source = _find_in_docs(docs, _RG_CTX, ("ccap", "rc"))
    if rg_pct is None and m:
        rg_pct = m.group(1).replace(",", ".")
    if rg_pct is not None:
        caution = infos.get("caution_remplacante")
        if caution is None:
            m_caution, _ = _find_in_docs(docs, _CAUTION_CTX, ("ccap",))
            caution = bool(m_caution)
        if caution:
            explication = (
                "Part de chaque paiement bloquée jusqu'à la fin de la garantie "
                "de parfait achèvement — remplaçable par une caution bancaire "
                "pour garder la trésorerie."
            )
        else:
            explication = (
                "Part de chaque paiement bloquée jusqu'à la fin de la garantie "
                "de parfait achèvement. Le CCAP ne prévoit pas de caution de "
                "remplacement."
            )
        lignes.append(_ligne(
            "retenue_garantie", "Retenue de garantie",
            f"{rg_pct} % de chaque situation",
            explication,
            source,
        ))

    # ── Pénalités de retard ───────────────────────────────────────────────────
    retard = infos.get("penalites_retard")
    m, source = _find_in_docs(docs, _PENALITE_CTX, ("ccap", "rc"))
    if not retard and m:
        retard = " ".join(m.group(1).split())
    if retard:
        plafond_txt = ""
        m_plafond, plafond_source = _find_in_docs(docs, _PLAFOND_CTX, ("ccap", "rc"))
        if m_plafond:
            plafond_txt = f" — plafonnées à {m_plafond.group(1)} % du montant"
        lignes.append(_ligne(
            "penalites", "Pénalités de retard",
            f"{retard}{plafond_txt}",
            "Montant retenu automatiquement par jour de dépassement du délai "
            "contractuel.",
            source or plafond_source,
        ))

    # ── Révision de prix ──────────────────────────────────────────────────────
    m_fermes, source_fermes = _find_in_docs(docs, _PRIX_FERMES, ("ccap", "rc"))
    if m_fermes:
        lignes.append(_ligne(
            "revision_prix", "Révision de prix",
            "Prix fermes",
            "Le contrat ne prévoit aucun ajustement : le montant signé reste "
            "identique quelle que soit l'évolution des coûts.",
            source_fermes,
        ))
    else:
        m_rev, source_rev = _find_in_docs(docs, _PRIX_REVISABLES, ("ccap", "rc"))
        if m_rev:
            # La formule est cherchée sur le texte ORIGINAL (les index BT01…
            # perdent leur casse dans le texte normalisé des helpers).
            formule = None
            for doc in docs:
                if (getattr(doc, "type", "") or "") not in ("ccap", "rc"):
                    continue
                m_formule = _FORMULE.search(getattr(doc, "extracted_text", None) or "")
                if m_formule:
                    formule = " ".join(m_formule.group(1).split())
                    break
            lignes.append(_ligne(
                "revision_prix", "Révision de prix",
                "Prix révisables",
                "Le montant du marché suit l'évolution des index BTP selon la "
                "formule du CCAP.",
                source_rev,
                formule=formule,
            ))

    return lignes
