"""Lecture d'un fichier déposé dans une case et PROPOSITIONS d'informations pour la rubrique.

Parcours d'une lecture (tâche détachée, une seule à la fois par organisation) :
  1. texte sans IA, page par page (`depot_lecture`) ; scan ou image : « lisible seulement avec un OCR » ;
  2. masquage RGPD avant tout envoi (`masquage_rgpd`) : seul le texte masqué part chez le modèle ;
  3. découpe en morceaux de taille raisonnable (jamais de troncature silencieuse), un appel Haiku par morceau
     (`ai.depot_extracteur`), le coût de chaque appel est enregistré (`couts_ia`) ;
  4. fusion, schéma Pydantic strict de la case (les lignes invalides sont écartées), puis GARDE « MOT POUR MOT » :
     toute valeur dont les termes ne se retrouvent pas dans le texte source est écartée (dates et nombres compris) ;
  5. pour les cases « personnes » : aucun nom ne passe (mots masqués comme noms, majuscules inhabituelles), seulement
     des nombres par rôle et par habilitation ; l'extrait d'origine n'est pas conservé ;
  6. comparaison avec le profil : une valeur déjà identique n'est pas proposée ; une valeur différente est proposée
     « à confirmer : remplace … » ;
  7. chaque proposition garde sa source (fichier, page) et un extrait d'origine de 200 caractères au plus.
RIEN n'est écrit dans le profil ici : les propositions attendent la validation du patron (`depot_validation`).

Aucun journal ne contient de texte du fichier ni de nom : seulement des types, des nombres et des identifiants.
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from database import SessionLocal
from models.depot_entreprise import LectureDepot, PropositionProfil
from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.qualification import Qualification
from models.reference import Reference
from schemas.profil_entreprise import LigneEffectif, LigneHabilitation, LigneMoyen
from schemas.qualification import QualificationCreate
from services import couts_ia, depot_budget, depot_lecture, file_storage, masquage_rgpd
from services.ai import depot_extracteur
from services.ai.profile_structurer import _norm, _value_grounded_in_text
from services.depot_cases import CaseDepot, case_par_id
from services.depot_lecture import Lecture, Unite

logger = logging.getLogger(__name__)

TAILLE_MORCEAU = 10_000          # caractères par appel (≈ 3 000 jetons) : une page de PDF en tient une dizaine
MAX_MORCEAUX = 40                # un fichier de 40 pages ne dépasse jamais ce nombre d'appels
MAX_EXTRAIT = 200
USAGE_COUT = "depot_entreprise"

# Les clés qui portent une LISTE de lignes, par case (« vehicules » est une liste pour le matériel, un texte pour la fiche).
_LISTES = {
    "materiel": ("materiel", "vehicules"), "personnel": ("effectifs", "habilitations"),
    "certificat": ("certificats",), "references": ("references",),
}
_TEXTES_FICHE = ("activites", "organigramme_description", "moyens_informatiques", "vehicules", "materiel", "demarche_qualite")
_LIBELLES_TEXTE = {
    "activites": "Activités principales", "organigramme_description": "Équipe et effectifs",
    "moyens_informatiques": "Moyens informatiques", "vehicules": "Véhicules", "materiel": "Matériel",
    "demarche_qualite": "Démarche qualité",
}
_LIBELLES_CATEGORIE = {
    "encadrement": "Encadrement", "chef_equipe": "Chefs d'équipe", "ouvrier": "Ouvriers",
    "administratif": "Administratif", "apprenti": "Apprentis",
}
_LIBELLES_HABILITATION = {
    "sst": "SST", "caces": "CACES", "habilitation_electrique": "Habilitation électrique",
    "amiante_ss3": "Amiante SS3", "amiante_ss4": "Amiante SS4", "travail_hauteur": "Travail en hauteur",
}
_MOIS = ("janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre",
         "novembre", "decembre")
_SIGLES = frozenset({"sst", "caces", "hse", "bim", "epi", "ppsps", "cqp", "aipr", "btp", "ss3", "ss4", "r482", "r486", "r489"})
_CIVILITES = re.compile(r"^\s*(?:m\.|mme|mlle|monsieur|madame|mademoiselle)\s+", re.IGNORECASE)


# ─── Schémas stricts, un par case ────────────────────────────────────────────

class _Kbis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    forme_juridique: Optional[str] = Field(default=None, max_length=80)
    capital_social: Optional[int] = Field(default=None, ge=0, le=10_000_000_000)
    greffe_rcs: Optional[str] = Field(default=None, max_length=80)
    adresse_siege: Optional[str] = Field(default=None, max_length=300)
    annee_creation: Optional[int] = Field(default=None, ge=1800, le=2100)
    date_extrait: Optional[str] = None
    gerant_nom: Optional[str] = Field(default=None, max_length=120)
    gerant_titre: Optional[str] = Field(default=None, max_length=80)


class _Assurance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assureur: Optional[str] = Field(default=None, max_length=120)
    numero_contrat: Optional[str] = Field(default=None, max_length=80)
    activites_garanties: Optional[str] = Field(default=None, max_length=500)
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None


class _Reference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intitule: str = Field(min_length=1, max_length=500)
    maitre_ouvrage: Optional[str] = Field(default=None, max_length=255)
    adresse: Optional[str] = Field(default=None, max_length=500)
    annee: Optional[int] = Field(default=None, ge=1900, le=2100)
    montant_ht: Optional[float] = Field(default=None, ge=0, le=10_000_000_000)
    lot: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1500)


_SCALAIRES = {
    "kbis": _Kbis, "assurance": _Assurance,
    "fiche_moyens": None,   # des textes : validés champ par champ
}
_ITEMS = {
    "materiel": {"materiel": LigneMoyen, "vehicules": LigneMoyen},
    "personnel": {"effectifs": LigneEffectif, "habilitations": LigneHabilitation},
    "certificat": {"certificats": QualificationCreate},
    "references": {"references": _Reference},
}
_CLES_AUTORISEES = {
    "kbis": set(_Kbis.model_fields), "assurance": set(_Assurance.model_fields),
    "fiche_moyens": set(_TEXTES_FICHE),
    "materiel": {"materiel", "vehicules"}, "personnel": {"effectifs", "habilitations"},
    "certificat": {"certificats"}, "references": {"references"},
}


# ─── Brouillon d'une proposition ─────────────────────────────────────────────

@dataclass
class _Brouillon:
    champ: str
    libelle: str
    valeur: Any
    affichage: str
    ancre: str                      # texte (valeurs) servant à retrouver la page et l'extrait d'origine
    remplace: Optional[str] = None


@dataclass
class _Contexte:
    org: Optional[Organization]
    config: Optional[MemoireConfig]
    qualifications: list = field(default_factory=list)
    references: list = field(default_factory=list)


def _charger_contexte(db, org_id: str) -> _Contexte:
    return _Contexte(
        org=db.get(Organization, org_id),
        config=db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first(),
        qualifications=db.query(Qualification).filter(
            Qualification.organization_id == org_id, Qualification.deleted_at.is_(None)).all(),
        references=db.query(Reference).filter(
            Reference.organization_id == org_id, Reference.deleted_at.is_(None)).all(),
    )


# ─── Gardes « mot pour mot » ─────────────────────────────────────────────────

def _compact(source_norm: str) -> str:
    """Texte normalisé, espaces et séparateurs de milliers retirés : « 40 000,00 » devient « 40000,00 »."""
    return re.sub(r"[\s  .]", "", source_norm)


def _nombre_ancre(nombre: int, source_norm: str) -> bool:
    return re.search(rf"(?<!\d){nombre}(?!\d)", _compact(source_norm)) is not None


def _formes_date(d: date) -> list[str]:
    j, m, a = d.day, d.month, d.year
    mois = _MOIS[m - 1]
    formes = [f"{j:02d}/{m:02d}/{a}", f"{j}/{m}/{a}", f"{j:02d}.{m:02d}.{a}", f"{j}.{m}.{a}",
              f"{j:02d}-{m:02d}-{a}", f"{j}-{m}-{a}", f"{a}-{m:02d}-{j:02d}", f"{j:02d}/{m:02d}/{a % 100:02d}",
              f"{j} {mois} {a}"]
    if j == 1:
        formes.append(f"1er {mois} {a}")
    return formes


def _date_ancree(d: date, source_norm: str) -> bool:
    """La date, écrite dans l'une de ses formes courantes, est dans le texte (jamais déduite)."""
    texte = re.sub(r"(?<=\d)\s*([/.\-])\s*(?=\d)", r"\1", re.sub(r"\s+", " ", source_norm))
    return any(re.search(rf"(?<!\d){re.escape(f)}(?!\d)", texte) for f in _formes_date(d))


def _date(valeur: Any, source_norm: str) -> Optional[date]:
    """Date ISO du modèle, acceptée seulement si le texte la porte mot pour mot."""
    if not isinstance(valeur, str):
        return None
    try:
        d = date.fromisoformat(valeur.strip())
    except ValueError:
        return None
    return d if _date_ancree(d, source_norm) else None


def _texte(valeur: Any, source_norm: str, maximum: int = 500) -> Optional[str]:
    if not isinstance(valeur, str):
        return None
    v = " ".join(valeur.split())
    if not v or len(v) > maximum or not _value_grounded_in_text(v, source_norm):
        return None
    return v


def _ressemble_a_un_nom(texte: str, noms: frozenset) -> bool:
    """Cases « personnes » : un mot masqué comme nom dans le fichier, ou un mot en majuscules (hors sigles) à partir
    du deuxième : « Jean Dupont » ne passe pas ; « maçon coffreur » et « SST » passent."""
    mots = re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*\d*", texte)
    for i, mot in enumerate(mots):
        brut = masquage_rgpd._sans_accents(mot)
        if brut in noms:
            return True
        if i >= 1 and brut not in _SIGLES and (mot[0].isupper() and not mot.isupper() or (mot.isupper() and len(mot) > 1)):
            return True
    return bool(_CIVILITES.match(texte))


def _afficher_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _montant(n: float) -> str:
    entier = f"{round(n):,}".replace(",", " ")
    return f"{entier} €"


# ─── Validation : schéma strict + filtre des clés ────────────────────────────

def _fusionner(extracteur: str, sorties: list[dict]) -> dict:
    """Plusieurs morceaux, une seule réponse : listes concaténées, valeurs simples : la première trouvée."""
    fusion: dict = {}
    listes = _LISTES.get(extracteur, ())
    for sortie in sorties:
        for cle, valeur in (sortie or {}).items():
            if cle in listes:
                if isinstance(valeur, list):
                    fusion.setdefault(cle, []).extend(valeur)
            elif cle not in fusion and valeur not in (None, "", []):
                fusion[cle] = valeur
    return fusion


def _valider(extracteur: str, brut: dict) -> dict:
    """Garde les clés de la case (les autres sont écartées : « aucun champ hors schéma ») et chaque ligne valide."""
    autorisees = _CLES_AUTORISEES[extracteur]
    propre: dict = {}
    for cle, valeur in brut.items():
        if cle not in autorisees:
            logger.warning("depot : clé hors schéma écartée (%s) : %s", extracteur, cle[:40])
            continue
        if cle in _LISTES.get(extracteur, ()):
            modele = _ITEMS[extracteur][cle]
            lignes = []
            for ligne in valeur if isinstance(valeur, list) else []:
                try:
                    # une clé étrangère glissée par le modèle est ignorée ; une valeur invalide écarte la ligne
                    lignes.append(modele.model_validate({k: x for k, x in ligne.items() if k in modele.model_fields}))
                except (ValidationError, TypeError, AttributeError):
                    logger.warning("depot : ligne invalide écartée (%s.%s)", extracteur, cle)
            propre[cle] = lignes
        elif extracteur in ("kbis", "assurance"):
            try:
                _SCALAIRES[extracteur].model_validate({cle: valeur})
                propre[cle] = valeur
            except ValidationError:
                logger.warning("depot : valeur invalide écartée (%s.%s)", extracteur, cle)
        else:
            propre[cle] = valeur
    return propre


# ─── Comparaison avec le profil ──────────────────────────────────────────────

def _identique(a: Any, b: Any) -> bool:
    return _norm(str(a if a is not None else "")).strip() == _norm(str(b if b is not None else "")).strip()


def _simple(ctx: _Contexte, champ: str, valeur: Any) -> tuple[bool, Optional[str]]:
    """(garder ?, valeur remplacée) pour un champ simple de l'organisation ou du profil."""
    source, nom = champ.split(".", 1)
    objet = ctx.org if source == "organisation" else ctx.config
    actuel = getattr(objet, nom, None) if objet is not None else None
    if actuel in (None, ""):
        return True, None
    if _identique(actuel, valeur):
        return False, None
    return True, str(actuel)


def _trouver_ligne(lignes: Any, cle) -> Optional[dict]:
    for l in lignes or []:
        if isinstance(l, dict) and cle(l):
            return l
    return None


# ─── Construction des propositions, case par case ────────────────────────────

def _propositions_kbis(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []

    def simple(champ: str, libelle: str, valeur: Any, affichage: str):
        garder, remplace = _simple(ctx, champ, valeur)
        if garder:
            sortie.append(_Brouillon(champ, libelle, valeur, affichage, str(valeur), remplace))

    if (t := _texte(v.get("forme_juridique"), norm, 80)):
        simple("organisation.forme_juridique", "Forme juridique", t, t)
    capital = v.get("capital_social")
    if isinstance(capital, int) and not isinstance(capital, bool) and _nombre_ancre(capital, norm):
        simple("organisation.capital_social", "Capital social", capital, _montant(capital))
    if (t := _texte(v.get("greffe_rcs"), norm, 80)):
        simple("organisation.greffe_rcs", "Greffe du RCS", t, t)
    if (t := _texte(v.get("adresse_siege"), norm, 300)):
        simple("organisation.address", "Adresse du siège", t, t)
    annee = v.get("annee_creation")
    if isinstance(annee, int) and not isinstance(annee, bool) and re.search(rf"(?<!\d){annee}(?!\d)", norm):
        simple("profil.date_creation", "Année de création", str(annee), str(annee))
    if (t := _texte(v.get("gerant_nom"), norm, 120)):
        simple("profil.gerant_nom", "Nom du dirigeant", t, t)
    if (t := _texte(v.get("gerant_titre"), norm, 80)):
        simple("profil.gerant_titre", "Fonction du dirigeant", t, t)
    if (d := _date(v.get("date_extrait"), norm)):
        sortie.append(_Brouillon("document.issued_date", "Date de l'extrait", d.isoformat(), _afficher_date(d),
                                 _afficher_date(d)))
    return sortie


def _resume_qualification(q: dict) -> str:
    morceaux = [q.get("intitule") or ""]
    detail = [x for x in (q.get("organisme"), f"n° {q['numero']}" if q.get("numero") else None) if x]
    if detail:
        morceaux.append(", ".join(detail))
    if q.get("date_fin"):
        morceaux.append(f"jusqu'au {_afficher_date(date.fromisoformat(str(q['date_fin'])))}")
    return " — ".join(m for m in morceaux if m)


def _qualification(ctx: _Contexte, champs: dict, libelle: str, ancre: str) -> Optional[_Brouillon]:
    try:
        q = QualificationCreate.model_validate(champs)
    except ValidationError:
        # une date de fin qui précède la date d'obtention : on garde la fin, qui est surveillée
        champs = {**champs, "date_obtention": None}
        try:
            q = QualificationCreate.model_validate(champs)
        except ValidationError:
            return None
    valeur = q.model_dump(mode="json", exclude={"document_id"})
    existante = next((x for x in ctx.qualifications
                      if x.famille == q.famille and _identique(x.intitule, q.intitule)), None)
    remplace = None
    if existante is not None:
        actuel = {c: (getattr(existante, c).isoformat() if hasattr(getattr(existante, c), "isoformat") else getattr(existante, c))
                  for c in ("famille", "intitule", "organisme", "numero", "perimetre", "date_obtention", "date_fin")}
        if all(_identique(actuel[c], valeur.get(c)) for c in actuel if valeur.get(c) not in (None, "")):
            return None
        remplace = _resume_qualification(actuel)
    return _Brouillon("qualification", libelle, valeur, _resume_qualification(valeur), ancre, remplace)


def _propositions_assurance(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    intitule = "Garantie décennale" if case.id == "decennale" else "Responsabilité civile professionnelle"
    debut, fin = _date(v.get("date_debut"), norm), _date(v.get("date_fin"), norm)
    champs = {
        "famille": "assurance", "intitule": intitule,
        "organisme": _texte(v.get("assureur"), norm, 120), "numero": _texte(v.get("numero_contrat"), norm, 80),
        "perimetre": _texte(v.get("activites_garanties"), norm, 500),
        "date_obtention": debut.isoformat() if debut else None, "date_fin": fin.isoformat() if fin else None,
    }
    sortie: list[_Brouillon] = []
    if any(champs[c] for c in ("organisme", "numero", "perimetre", "date_fin")):
        ancre = " ".join(str(champs[c]) for c in ("organisme", "numero", "perimetre") if champs[c])
        b = _qualification(ctx, champs, "Assurance", ancre or intitule)
        if b:
            sortie.append(b)
    if fin:
        sortie.append(_Brouillon("document.expiry_date", "Valable jusqu'au", fin.isoformat(), _afficher_date(fin),
                                 _afficher_date(fin)))
    return sortie


def _propositions_certificat(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []
    fins: list[date] = []
    for c in v.get("certificats", []):
        if c.famille == "assurance":
            continue
        debut, fin = _date(c.date_obtention.isoformat() if c.date_obtention else None, norm), \
            _date(c.date_fin.isoformat() if c.date_fin else None, norm)
        champs = {
            "famille": c.famille, "intitule": _texte(c.intitule, norm, 200),
            "organisme": _texte(c.organisme, norm, 120), "numero": _texte(c.numero, norm, 80),
            "perimetre": _texte(c.perimetre, norm, 500),
            "date_obtention": debut.isoformat() if debut else None, "date_fin": fin.isoformat() if fin else None,
        }
        if not champs["intitule"]:
            continue
        libelle = {"rge": "Label RGE", "systeme_management": "Certification"}.get(c.famille, "Qualification")
        b = _qualification(ctx, champs, libelle, " ".join(str(champs[k]) for k in ("intitule", "organisme", "numero") if champs[k]))
        if b:
            sortie.append(b)
        if fin:
            fins.append(fin)
    if fins:
        fin = min(fins)
        sortie.append(_Brouillon("document.expiry_date", "Valable jusqu'au", fin.isoformat(), _afficher_date(fin),
                                 _afficher_date(fin)))
    return sortie


def _propositions_materiel(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []
    for cle, champ, libelle in (("materiel", "profil.materiel_liste", "Matériel"),
                                ("vehicules", "profil.vehicules_liste", "Véhicule")):
        existants = getattr(ctx.config, f"{champ.split('.')[1]}", None) if ctx.config else None
        vus: set = set()
        for ligne in v.get(cle, []):
            if not _value_grounded_in_text(ligne.designation, norm) or not _value_grounded_in_text(str(ligne.quantite), norm):
                continue
            cle_ligne = _norm(ligne.designation).strip()
            if cle_ligne in vus:
                continue
            vus.add(cle_ligne)
            actuelle = _trouver_ligne(existants, lambda l: _identique(l.get("designation"), ligne.designation))
            remplace = None
            if actuelle is not None:
                if int(actuelle.get("quantite") or 0) == ligne.quantite:
                    continue
                remplace = f"{actuelle.get('quantite')} × {actuelle.get('designation')}"
            sortie.append(_Brouillon(
                champ, libelle, ligne.model_dump(exclude_none=True), f"{ligne.quantite} × {ligne.designation}",
                ligne.designation, remplace))
    return sortie


def _propositions_personnel(case: CaseDepot, v: dict, norm: str, ctx: _Contexte, noms: frozenset) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []
    effectifs = ctx.config.effectifs_par_categorie if ctx.config else None
    habilitations = ctx.config.habilitations if ctx.config else None
    vus: set = set()
    for e in v.get("effectifs", []):
        if e.specialite and (_ressemble_a_un_nom(e.specialite, noms) or not _value_grounded_in_text(e.specialite, norm)):
            continue
        cle = (e.categorie, _norm(e.specialite or "").strip())
        if cle in vus:
            continue
        vus.add(cle)
        actuelle = _trouver_ligne(effectifs, lambda l: l.get("categorie") == e.categorie
                                  and _identique(l.get("specialite"), e.specialite))
        remplace = None
        if actuelle is not None:
            if int(actuelle.get("effectif") or 0) == e.effectif:
                continue
            remplace = f"{actuelle.get('effectif')} personne(s)"
        affichage = f"{e.effectif} · {_LIBELLES_CATEGORIE[e.categorie]}" + (f" ({e.specialite})" if e.specialite else "")
        sortie.append(_Brouillon("profil.effectifs_par_categorie", "Effectif", e.model_dump(exclude_none=True),
                                 affichage, e.specialite or e.categorie.replace("_", " "), remplace))
    vues: set = set()
    for h in v.get("habilitations", []):
        if h.libelle and (_ressemble_a_un_nom(h.libelle, noms) or not _value_grounded_in_text(h.libelle, norm)):
            if h.type == "autre":
                continue                       # « autre » ne vaut que par son libellé
            h = h.model_copy(update={"libelle": None})   # le type et le nombre restent, le libellé douteux tombe
        valide = _date(h.valide_jusqu, norm) if h.valide_jusqu else None
        cle = (h.type, _norm(h.libelle or "").strip() if h.type == "autre" else "")
        if cle in vues:
            continue
        vues.add(cle)
        actuelle = _trouver_ligne(habilitations, lambda l: l.get("type") == h.type and (
            h.type != "autre" or _identique(l.get("libelle"), h.libelle)))
        remplace = None
        if actuelle is not None:
            if int(actuelle.get("nombre") or 0) == h.nombre:
                continue
            remplace = f"{actuelle.get('nombre')} personne(s)"
        valeur = h.model_dump(exclude_none=True)
        if h.valide_jusqu and not valide:
            valeur.pop("valide_jusqu", None)
        nom = h.libelle if h.type == "autre" else _LIBELLES_HABILITATION[h.type]
        sortie.append(_Brouillon("profil.habilitations", "Habilitation", valeur, f"{h.nombre} × {nom}",
                                 h.libelle or nom, remplace))
    return sortie


def _propositions_fiche(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []
    for cle in _TEXTES_FICHE:
        t = _texte(v.get(cle), norm, 4000)
        if not t:
            continue
        garder, remplace = _simple(ctx, f"profil.{cle}", t)
        if garder:
            sortie.append(_Brouillon(f"profil.{cle}", _LIBELLES_TEXTE[cle], t, t[:300], t, remplace))
    return sortie


_PARTICULIER = re.compile(r"^\s*(?:m\.|mme|mlle|monsieur|madame|mademoiselle|m\s+et\s+mme|mr)\b", re.IGNORECASE)


def _propositions_references(case: CaseDepot, v: dict, norm: str, ctx: _Contexte) -> list[_Brouillon]:
    sortie: list[_Brouillon] = []
    vus = {_norm(r.intitule).strip() for r in ctx.references}
    for r in v.get("references", []):
        intitule = _texte(r.intitule, norm, 500)
        if not intitule or _norm(intitule).strip() in vus:
            continue   # une référence déjà au profil n'est pas proposée
        vus.add(_norm(intitule).strip())
        valeur: dict = {"intitule": intitule, "statut": "gagné", "is_reference": True}
        maitre = _texte(r.maitre_ouvrage, norm, 255)
        if maitre and _PARTICULIER.match(maitre):
            valeur["client_type"] = "particulier"      # le nom d'un particulier n'est jamais repris
            maitre = None
        if maitre:
            valeur["maitre_ouvrage"] = maitre
        if (a := _texte(r.adresse, norm, 500)):
            valeur["adresse"] = a
        if r.annee and re.search(rf"(?<!\d){r.annee}(?!\d)", norm):
            valeur["annee"] = r.annee
        if r.montant_ht is not None and _nombre_ancre(int(round(r.montant_ht)), norm):
            valeur["montant_ht"] = r.montant_ht
        if (l := _texte(r.lot, norm, 255)):
            valeur["lot"] = l
        if (d := _texte(r.description, norm, 1500)):
            valeur["description"] = d
        details = [str(valeur[k]) for k in ("maitre_ouvrage", "annee") if k in valeur]
        if "montant_ht" in valeur:
            details.append(_montant(valeur["montant_ht"]) + " HT")
        sortie.append(_Brouillon("reference", "Référence", valeur,
                                 intitule + (f" — {', '.join(details)}" if details else ""), intitule))
    return sortie


def construire_propositions(case: CaseDepot, brut: dict, norm: str, ctx: _Contexte,
                            noms: frozenset = frozenset()) -> list[_Brouillon]:
    """Sortie du modèle (fusionnée) -> propositions : schéma strict, garde mot pour mot, comparaison au profil."""
    v = _valider(case.extracteur, brut)
    if case.extracteur == "kbis":
        return _propositions_kbis(case, v, norm, ctx)
    if case.extracteur == "assurance":
        return _propositions_assurance(case, v, norm, ctx)
    if case.extracteur == "certificat":
        return _propositions_certificat(case, v, norm, ctx)
    if case.extracteur == "materiel":
        return _propositions_materiel(case, v, norm, ctx)
    if case.extracteur == "personnel":
        return _propositions_personnel(case, v, norm, ctx, noms)
    if case.extracteur == "fiche_moyens":
        return _propositions_fiche(case, v, norm, ctx)
    if case.extracteur == "references":
        return _propositions_references(case, v, norm, ctx)
    return []


# ─── Source : page et extrait d'origine ──────────────────────────────────────

def _jetons(ancre: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", _norm(ancre)) if len(t) > 3 or t.isdigit()]


def localiser(ancre: str, unites: list[tuple[Unite, str]], avec_extrait: bool) -> tuple[Optional[Unite], Optional[str]]:
    """L'unité (page, feuille) qui porte le mieux l'ancre, et la ligne d'origine (200 caractères au plus, texte masqué)."""
    jetons = _jetons(ancre)
    if not jetons:
        return (unites[0][0] if unites else None), None
    def present(t: str, texte: str) -> bool:      # « 40000 » se lit « 40 000 » dans le texte
        return t in texte or (t.isdigit() and t in _compact(texte))

    meilleure, score = None, 0
    for unite, texte_norm in unites:
        n = sum(1 for t in jetons if present(t, texte_norm))
        if n > score:
            meilleure, score = (unite, texte_norm), n
    if meilleure is None:
        return None, None
    unite = meilleure[0]
    if not avec_extrait:
        return unite, None
    lignes = [l for l in unite.texte.splitlines() if l.strip()]
    pire = max(lignes, key=lambda l: sum(1 for t in jetons if present(t, _norm(l))), default="")
    if not pire.strip():
        return unite, None
    ligne = " | ".join(p.strip() for p in pire.split("\t") if p.strip()) if "\t" in pire else " ".join(pire.split())
    return unite, (ligne if len(ligne) <= MAX_EXTRAIT else ligne[:MAX_EXTRAIT - 1].rstrip() + "…")


# ─── Découpe en morceaux ─────────────────────────────────────────────────────

def decouper(unites: list[Unite], taille: int = TAILLE_MORCEAU) -> list[str]:
    """Morceaux de `taille` caractères au plus, coupés entre deux lignes, chacun précédé du lieu d'où il vient.
    Rien n'est jeté : la somme des morceaux couvre tout le texte lu."""
    morceaux: list[str] = []
    courant: list[str] = []
    n = 0

    def vider():
        nonlocal courant, n
        if courant:
            morceaux.append("\n".join(courant))
        courant, n = [], 0

    for unite in unites:
        entete = f"--- {unite.lieu} ---"
        reste = [l for l in unite.texte.splitlines() if l.strip()]
        if n + len(entete) > taille:
            vider()
        courant.append(entete)
        n += len(entete) + 1
        for ligne in reste:
            while len(ligne) > taille - 20:        # une ligne démesurée est coupée, jamais jetée
                coupe, ligne = ligne[:taille - 20], ligne[taille - 20:]
                if n + len(coupe) > taille:
                    vider()
                    courant.append(entete)
                courant.append(coupe)
                n += len(coupe) + 1
            if n + len(ligne) + 1 > taille:
                vider()
                courant.append(entete)
                n += len(entete) + 1
            courant.append(ligne)
            n += len(ligne) + 1
    vider()
    return morceaux


# ─── Traitement d'une lecture (tâche détachée) ───────────────────────────────

_VERROUS: dict[str, threading.Lock] = {}
_VERROU_VERROUS = threading.Lock()


def _verrou(org_id: str) -> threading.Lock:
    with _VERROU_VERROUS:
        return _VERROUS.setdefault(org_id, threading.Lock())


def lancer(lecture_id: str, organisation_id: str) -> threading.Thread:
    """Lance la lecture dans un fil détaché ; une seule lecture à la fois par organisation (les autres attendent)."""
    def _travail():
        with _verrou(organisation_id):
            traiter_lecture(lecture_id)

    fil = threading.Thread(target=_travail, daemon=True, name=f"synorix-depot-{lecture_id[:8]}")
    fil.start()
    return fil


def _chemin(doc: Document):
    racine = file_storage.UPLOADS_ROOT
    if not doc.file_url.startswith("/uploads/"):
        return None
    chemin = racine / doc.file_url.removeprefix("/uploads/")
    return chemin if chemin.exists() else None


def _terminer(db, lecture: LectureDepot, etat: str, message: Optional[str] = None, nb: int = 0,
              lu: Optional[Lecture] = None) -> None:
    lecture.etat, lecture.message, lecture.nb_propositions = etat, message, nb
    if lu is not None:
        lecture.pages_lues, lecture.pages_total = lu.pages_lues, lu.pages_total
        lecture.plafond_atteint = bool(lu.plafond_atteint and lu.pages_lues)
    lecture.terminee_le = datetime.utcnow()
    db.commit()


def traiter_lecture(lecture_id: str) -> None:
    db = SessionLocal()
    try:
        lecture = db.get(LectureDepot, lecture_id)
        if lecture is None or lecture.etat != "en_lecture":
            return
        case = case_par_id(lecture.case_depot)
        doc = db.get(Document, lecture.document_id)
        if case is None or doc is None or doc.organization_id != lecture.organization_id:
            _terminer(db, lecture, "echec", depot_lecture.MESSAGE_ECHEC)
            return
        chemin = _chemin(doc)
        if chemin is None:
            _terminer(db, lecture, "echec", depot_lecture.MESSAGE_ECHEC)
            return
        extension = chemin.suffix.lower()
        lu = depot_lecture.lire_fichier(chemin, extension, personnes=case.personnes)
        if lu.echec:
            _terminer(db, lecture, "echec", lu.message, lu=lu)
            return
        if lu.ocr_requis:
            _terminer(db, lecture, "ocr_requis", lu.message, lu=lu)
            return
        if not lu.lisible:
            _terminer(db, lecture, "coffre_seul", lu.message, lu=lu)
            return
        nb, arret, appels = _extraire(db, lecture, case, doc, lu)
        if arret is not None and appels == 0:
            # le plafond a été atteint (par une autre lecture) avant le premier appel : la lecture est différée, pas perdue
            _terminer(db, lecture, "differee", depot_budget.MESSAGES[arret], 0, lu)
            lecture.terminee_le = None
            db.commit()
            return
        message = lu.message if lu.plafond_atteint else None
        if arret is not None:
            suite = "demain" if arret == "jour" else "le mois prochain"
            message = f"Lecture partielle : plafond atteint. Redéposez le fichier {suite} pour lire la suite."
        _terminer(db, lecture, "lu", message, nb, lu)
        logger.info("depot : lecture terminée (case=%s, propositions=%d, plafond=%s)", case.id, nb, lu.plafond_atteint)
    except Exception as exc:    # jamais de contenu : le type de l'erreur et l'identifiant suffisent
        logger.error("depot : lecture %s en échec (%s)", lecture_id[:8], type(exc).__name__, exc_info=False)
        try:
            db.rollback()
            lecture = db.get(LectureDepot, lecture_id)
            if lecture is not None and lecture.etat == "en_lecture":
                _terminer(db, lecture, "echec", depot_lecture.MESSAGE_ECHEC)
        except Exception:
            db.rollback()
    finally:
        db.close()


def _extraire(db, lecture: LectureDepot, case: CaseDepot, doc: Document, lu: Lecture) -> tuple[int, Optional[str], int]:
    """Masque, découpe, appelle le modèle, garde, compare, enregistre. Rend (propositions, raison d'arrêt, appels faits)."""
    masquees: list[Unite] = []
    noms: set = set()
    for u in lu.unites:
        m = masquage_rgpd.masquer(u.texte, personnes=case.personnes)
        masquees.append(Unite(u.lieu, u.page, m.texte))
        noms |= set(m.noms)
    morceaux = decouper(masquees)[:MAX_MORCEAUX]
    sorties: list[dict] = []
    arret: Optional[str] = None
    for morceau in morceaux:
        # Le plafond du jour ou du mois peut être atteint entre deux appels d'une lecture longue : on s'arrête là.
        arret = depot_budget.raison_de_report(db, lecture.organization_id, avec_file=False)
        if arret is not None:
            break
        champs, usage = depot_extracteur.extraire(case.extracteur, morceau)
        couts_ia.enregistrer(db, lecture.organization_id, USAGE_COUT, depot_extracteur.MODELE, usage, lecture.id)
        sorties.append(champs)
    unites_norm = [(u, _norm(u.texte)) for u in masquees]
    norm = " ".join(t for _, t in unites_norm)
    ctx = _charger_contexte(db, lecture.organization_id)
    brouillons = construire_propositions(case, _fusionner(case.extracteur, sorties), norm, ctx, frozenset(noms))

    for b in brouillons:
        unite, extrait = localiser(b.ancre, unites_norm, avec_extrait=not case.personnes)
        db.add(PropositionProfil(
            organization_id=lecture.organization_id, lecture_id=lecture.id, document_id=doc.id,
            case_depot=case.id, rubrique=case.rubrique, champ=b.champ, libelle=b.libelle[:200],
            valeur=_json(b.valeur), affichage=b.affichage[:300], remplace=b.remplace,
            source_fichier=_source_fichier(case, doc), source_page=unite.page if unite else None,
            source_lieu=unite.lieu if unite else None, extrait=extrait, statut="proposee"))
    db.commit()
    return len(brouillons), arret, len(sorties)


def _source_fichier(case: CaseDepot, doc: Document) -> str:
    """Le nom du fichier, sauf pour les cases « personnes » : un CV porte souvent le nom de la personne dans son nom."""
    if case.personnes:
        return f"{case.nom} ({Path(doc.file_name).suffix.lower().lstrip('.') or 'fichier'})"
    return doc.file_name


def _json(valeur: Any) -> str:
    import json
    return json.dumps(valeur, ensure_ascii=False)
