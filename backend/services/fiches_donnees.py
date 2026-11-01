"""Données des fiches « Mon entreprise » : une seule assemblée, lue par l'aperçu, le Word et le PDF.

``assembler(db, org_id, rubrique)`` relit les tables actuelles (organizations, memoire_configs,
team_members, references, documents) et, quand ils existent, les champs de la migration 0029 (agent PAGE) :
tout champ de 0029 est lu avec ``getattr(…, None)`` et un repli vide, la table ``qualifications`` par un
import protégé. Rien n'est recopié en base : le bordereau (titre, logo, lignes libres) vit dans
``fiches_entreprise``, les données restent à leur place.

Règles d'écriture (règles produit) : jamais « manquant », « incomplet » ni « absent » ; une rubrique ou une
valeur sans donnée n'est pas listée, une section sans ligne imprime « Précisions sur demande » ; aucun avis
sur les prix : le tableau des références reprend les montants saisis, il ne les commente pas.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.reference import Reference
from models.team_member import TeamMember
from schemas.fiches_entreprise import COULEUR_PAR_DEFAUT, nettoyer

MOIS_FR = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)
NBSP = " "
VIDE_SECTION = "Précisions sur demande"
MAX_REFERENCES = 60          # une fiche de 2 à 4 pages ; au-delà, l'entreprise choisit ses meilleures
MAX_TEXTE_SECTION = 600      # un texte long du profil est repris jusqu'à cette taille, coupé à une phrase

TITRES = {
    "identite": "FICHE ENTREPRISE",
    "moyens": "MOYENS DE L'ENTREPRISE",
    "certifications": "RÉFÉRENCES ET CERTIFICATIONS",
}
LIBELLES_RUBRIQUE = {
    "identite": "Identité",
    "moyens": "Moyens humains et matériels",
    "certifications": "Certifications et références",
}
NOMS_FICHIER = {
    "identite": "Fiche_entreprise_identite",
    "moyens": "Fiche_entreprise_moyens",
    "certifications": "Fiche_entreprise_references_certifications",
}

_TYPES_DOCUMENT = {
    "kbis": "Extrait Kbis",
    "urssaf": "Attestation de vigilance URSSAF",
    "fiscal": "Attestation de régularité fiscale",
    "pro_btp": "Attestation Pro BTP",
    "cibtp": "Attestation de congés payés (CIBTP)",
    "decennale": "Assurance décennale",
    "rc_civile": "Assurance responsabilité civile",
    "trc": "Assurance tous risques chantier",
    "dommages_ouvrage": "Assurance dommages-ouvrage",
    "qualibat": "Qualibat",
    "rge": "Label RGE",
    "caces": "CACES",
    "amiante_ss4": "Amiante sous-section 4",
}
_PIECES_SUR_DEMANDE = ("kbis", "urssaf", "fiscal", "rc_civile", "decennale", "trc", "dommages_ouvrage",
                       "pro_btp", "cibtp")
_TYPES_QUALIFICATION = ("qualibat", "rge")
_TYPES_ASSURANCE = ("decennale", "rc_civile", "trc", "dommages_ouvrage")
_TYPES_HABILITATION = ("caces", "amiante_ss4")

_HABILITATIONS = {
    "sst": "Sauveteurs secouristes du travail (SST)",
    "caces": "CACES",
    "habilitation_electrique": "Habilitations électriques",
    "amiante_ss3": "Amiante sous-section 3",
    "amiante_ss4": "Amiante sous-section 4",
    "travail_hauteur": "Travail en hauteur",
}
_CATEGORIES_EFFECTIF = {
    "encadrement": "Encadrement",
    "chef_equipe": "Chefs d'équipe",
    "ouvrier": "Ouvriers et compagnons",
    "administratif": "Administratif",
    "apprenti": "Apprentis",
}


# ─── Petits outils ─────────────────────────────────────────────────────────────

def aujourdhui() -> date:
    return date.today()


def date_fr(jour: Optional[date]) -> str:
    return jour.strftime("%d/%m/%Y") if jour else ""


def mois_annee(jour: date) -> str:
    return f"{MOIS_FR[jour.month - 1]} {jour.year}"


def groupe_milliers(n: float) -> str:
    entier = int(round(n))
    signe = "-" if entier < 0 else ""
    chiffres = f"{abs(entier):,}".replace(",", NBSP)
    return signe + chiffres


def euros(n: Optional[float], ht: bool = True) -> str:
    if n is None:
        return ""
    return f"{groupe_milliers(n)}{NBSP}€" + (f"{NBSP}HT" if ht else "")


def montant_saisi(brut: Any) -> Optional[float]:
    """« 1 200 000 », « 1,2 M€ »… saisis à la main : un nombre si on peut le lire, sinon None."""
    if brut is None:
        return None
    if isinstance(brut, (int, float)):
        return float(brut)
    texte = str(brut).replace(NBSP, " ").replace(" ", " ").strip()
    if not re.fullmatch(r"[0-9 .,]+(?:\s*(?:€|eur|euros?|k€|m€))?", texte, re.IGNORECASE):
        return None
    nombre = re.sub(r"[^0-9,.]", "", texte).replace(",", ".")
    if nombre.count(".") > 1:
        nombre = nombre.replace(".", "")
    try:
        return float(nombre)
    except ValueError:
        return None


def _g(objet: Any, nom: str, defaut: Any = None) -> Any:
    """Lecture tolérante : un champ de la migration 0029 absent de ce schéma donne le repli."""
    valeur = getattr(objet, nom, None) if objet is not None else None
    return defaut if valeur is None else valeur


def _t(valeur: Any) -> str:
    """Texte propre d'une valeur de profil (caractères de contrôle retirés)."""
    if valeur is None:
        return ""
    return nettoyer(str(valeur)) or ""


def _court(texte: str, limite: int = MAX_TEXTE_SECTION) -> str:
    """Un texte long est repris jusqu'à ``limite`` caractères, coupé à la fin d'une phrase si possible."""
    texte = re.sub(r"\s*\n\s*", " ", texte).strip()
    if len(texte) <= limite:
        return texte
    coupe = texte[:limite]
    fin = max(coupe.rfind(". "), coupe.rfind("; "))
    if fin >= limite * 0.5:
        return coupe[: fin + 1]
    return coupe.rsplit(" ", 1)[0].rstrip(",;: ") + " …"


def _validite(fin: Optional[date], jour: date) -> str:
    if fin is None:
        return "À confirmer"
    if fin < jour:
        return f"À renouveler (échue le {date_fr(fin)})"
    if fin <= jour + timedelta(days=60):
        return f"À renouveler avant le {date_fr(fin)}"
    return f"valable jusqu'au {date_fr(fin)}"


def _ligne(libelle: str, valeur: str) -> dict:
    return {"libelle": libelle, "valeur": valeur}


def _liste_json(valeur: Any) -> list:
    return valeur if isinstance(valeur, list) else []


def _entier(valeur: Any) -> int:
    try:
        return max(int(valeur), 0)
    except (TypeError, ValueError):
        return 0


# ─── Palette ───────────────────────────────────────────────────────────────────

def palette(couleur: Optional[str]) -> dict:
    """Couleurs dérivées de l'accent (celui du thème par défaut) : le bandeau est l'accent très assombri,
    le chiffre des tuiles et les numéros sont l'accent assombri jusqu'à 4,5:1 sur blanc. Jamais de texte
    foncé sur un aplat d'accent."""
    from services.visuels.couleurs import Theme, melange

    brut = (couleur or COULEUR_PAR_DEFAUT).lower()
    theme = Theme(brut.upper())
    return {
        "accent": brut,                                   # filets et traits (décor)
        "accent_texte": theme.accent.lower(),             # chiffres, numéros, pastilles : 4,5:1 sur blanc
        "bandeau": melange(brut.upper(), "#000000", 0.72).lower(),
        "bandeau_texte": "#ffffff",
        "accent_pale": theme.accent_pale.lower(),
        "accent_clair": theme.accent_clair.lower(),
        "encre": theme.encre.lower(),
        "texte": theme.texte.lower(),
        "discret": theme.discret.lower(),
        "filet": theme.filet.lower(),
    }


# ─── Lecture de la base ────────────────────────────────────────────────────────

def _qualifications_declarees(db: Session, org_id: str) -> list:
    """Table ``qualifications`` de la migration 0029 (agent PAGE) : lue seulement si elle existe."""
    try:
        from models.qualification import Qualification   # type: ignore[import-not-found]
    except Exception:
        return []
    try:
        return (
            db.query(Qualification)
            .filter(Qualification.organization_id == org_id, Qualification.deleted_at.is_(None))
            .order_by(Qualification.date_fin.is_(None), Qualification.date_fin)
            .all()
        )
    except Exception:
        return []


def _documents(db: Session, org_id: str) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.organization_id == org_id, Document.deleted_at.is_(None))
        .order_by(Document.uploaded_at.desc())
        .all()
    )


def _references(db: Session, org_id: str) -> list[Reference]:
    q = db.query(Reference).filter(
        Reference.organization_id == org_id,
        Reference.deleted_at.is_(None),
        Reference.is_reference.is_(True),
        Reference.statut != "perdu",
    )
    return q.order_by(Reference.annee.desc(), Reference.montant_ht.desc(), Reference.id).limit(MAX_REFERENCES).all()


# ─── Éléments communs ──────────────────────────────────────────────────────────

def _societe(org: Organization, cfg: Optional[MemoireConfig]) -> dict:
    nom = _t(_g(cfg, "nom_entreprise")) or _t(org.name)
    email, tel = _t(_g(org, "email_contact")), _t(_g(org, "telephone"))
    return {
        "nom": nom,
        "siret": _t(org.siret),
        "forme": _t(_g(org, "forme_juridique")),
        "adresse": _t(org.address),
        "contact": " · ".join(x for x in (email, tel) if x),
    }


def contact_par_defaut(org: Organization) -> str:
    return " · ".join(x for x in (_t(_g(org, "email_contact")), _t(_g(org, "telephone"))) if x)


def _pied(societe: dict) -> str:
    morceaux = [societe["nom"], societe["forme"], f"SIRET {societe['siret']}" if societe["siret"] else "",
                societe["adresse"]]
    return " · ".join(x for x in morceaux if x)


def _identite_ligne(societe: dict) -> list:
    lignes = [_ligne("Société", societe["nom"]), _ligne("SIRET", societe["siret"]),
              _ligne("Siège", societe["adresse"]), _ligne("Contact", societe["contact"])]
    return [x for x in lignes if x["valeur"]]


def _section(numero: str, titre: str, lignes: list, texte: str = "") -> dict:
    return {
        "id": numero, "titre": titre, "lignes": [x for x in lignes if x["valeur"] or x["libelle"]],
        "texte": texte, "vide": not lignes and not texte,
    }


def _tuile(valeur: Any, libelle: str) -> dict:
    return {"valeur": str(valeur) if valeur not in (None, "", 0) else "—", "libelle": libelle}


# ─── Rubrique Moyens ───────────────────────────────────────────────────────────

def _effectifs(cfg: Optional[MemoireConfig]) -> list[dict]:
    lignes = []
    for ligne in _liste_json(_g(cfg, "effectifs_par_categorie")):
        if isinstance(ligne, dict) and _entier(ligne.get("effectif")):
            lignes.append({
                "categorie": str(ligne.get("categorie") or ""),
                "specialite": _t(ligne.get("specialite")),
                "effectif": _entier(ligne.get("effectif")),
            })
    return lignes


def _lignes_liste(valeur: Any) -> list[dict]:
    """matériel_liste / vehicules_liste : [{quantite, designation, unite, famille}]."""
    lignes = []
    for ligne in _liste_json(valeur):
        if not isinstance(ligne, dict) or not _t(ligne.get("designation")):
            continue
        lignes.append({
            "quantite": _entier(ligne.get("quantite")) or 1,
            "designation": _t(ligne.get("designation")),
            "unite": _t(ligne.get("unite")),
            "famille": _t(ligne.get("famille")),
        })
    return lignes


def _texte_en_lignes(texte: str) -> list[dict]:
    """Repli : le texte libre actuel (matériel, véhicules), une ligne non vide = une entrée."""
    return [_ligne("", _t(l).lstrip("-•* ").strip()) for l in (texte or "").splitlines() if _t(l).strip(" -•*")][:30]


def _lignes_quantite(lignes: list[dict]) -> list[dict]:
    sortie = []
    for l in lignes:
        quantite = f"{groupe_milliers(l['quantite'])}{NBSP}{l['unite']}" if l["unite"] else str(l["quantite"])
        designation = l["designation"] + (f" ({l['famille']})" if l["famille"] else "")
        sortie.append(_ligne(quantite, designation))
    return sortie


def _habilitations(cfg: Optional[MemoireConfig]) -> list[dict]:
    lignes = []
    for ligne in _liste_json(_g(cfg, "habilitations")):
        if not isinstance(ligne, dict) or not _entier(ligne.get("nombre")):
            continue
        type_ = str(ligne.get("type") or "")
        libelle = _HABILITATIONS.get(type_) or _t(ligne.get("libelle")) or "Autre habilitation"
        fin = None
        try:
            fin = date.fromisoformat(str(ligne.get("valide_jusqu")))
        except ValueError:
            pass
        lignes.append({"type": type_, "libelle": libelle, "nombre": _entier(ligne.get("nombre")), "fin": fin})
    return lignes


def _moyens(db: Session, org: Organization, cfg: Optional[MemoireConfig], jour: date) -> dict:
    equipe = db.query(TeamMember).filter(TeamMember.organization_id == org.id).all()
    postes = [p for p in _liste_json(_g(cfg, "postes_cles")) if isinstance(p, dict) and _t(p.get("nom"))]
    effectifs = _effectifs(cfg)
    materiel = _lignes_liste(_g(cfg, "materiel_liste"))
    vehicules = _lignes_liste(_g(cfg, "vehicules_liste"))
    habilitations = _habilitations(cfg)

    # 01 Moyens humains : effectifs en nombres (jamais de nom de salarié), puis postes de direction.
    humains = [_ligne(str(e["effectif"]), _CATEGORIES_EFFECTIF.get(e["categorie"], e["categorie"].capitalize())
                      + (f" — {e['specialite']}" if e["specialite"] else "")) for e in effectifs]
    cles = [_ligne(_t(p.get("poste")) or _t(p.get("role")), _t(p.get("nom"))) for p in postes[:6]]
    if not cles:
        cles = [_ligne(_t(m.role), _t(m.name) + (f" ({_t(m.specialite)})" if _t(m.specialite) else ""))
                for m in equipe[:6]]
    # 02
    informatique = _court(_t(_g(cfg, "moyens_informatiques") or _g(org, "moyens_informatiques")))
    # 03 Matériel
    lignes_materiel = _lignes_quantite(materiel) or _texte_en_lignes(_t(_g(cfg, "materiel") or _g(org, "materiel")))
    # 04 Véhicules
    lignes_vehicules = _lignes_quantite(vehicules) or _texte_en_lignes(
        _t(_g(cfg, "vehicules") or _g(org, "vehicules")))
    # 05 Sécurité et premiers secours
    securite = [_ligne(str(h["nombre"]), h["libelle"]) for h in habilitations]
    texte_securite = _court(_t(_g(cfg, "gestion_securite")))
    # 06 Qualité et environnement
    qualite = []
    for libelle, brut in (("Qualité", _g(cfg, "demarche_qualite")), ("Déchets", _g(cfg, "traitement_dechets")),
                          ("Environnement", _g(cfg, "mesures_environnementales")),
                          ("Garantie et SAV", _g(cfg, "sav_garantie"))):
        if _t(brut):
            qualite.append(_ligne(libelle, _court(_t(brut), 260)))
    for q in _qualifications_declarees(db, org.id):
        if _g(q, "famille") == "systeme_management":
            qualite.append(_ligne(_t(q.intitule), _t(q.organisme) or ""))
    # 07 Documents sur demande
    documents = _documents(db, org.id)
    sur_demande = []
    vus = set()
    for d in documents:
        if d.type in _PIECES_SUR_DEMANDE and d.type not in vus:
            vus.add(d.type)
            sur_demande.append(_ligne(_TYPES_DOCUMENT[d.type],
                                      "disponible" + (f" — {_validite(d.expiry_date, jour)}" if d.expiry_date else "")))
    if not sur_demande:
        sur_demande = [_ligne("Pièces administratives", "Kbis, attestations URSSAF et fiscale, assurances")]

    sections = [
        _section("01", "Moyens humains", humains + cles),
        _section("02", "Moyens informatiques", [], informatique),
        _section("03", "Matériel", lignes_materiel),
        _section("04", "Véhicules", lignes_vehicules),
        _section("05", "Sécurité et premiers secours", securite, texte_securite),
        _section("06", "Qualité et environnement", qualite),
        _section("07", "Documents sur demande", sur_demande),
    ]

    total_effectif = sum(e["effectif"] for e in effectifs) or len(equipe) or len(postes)
    chefs = sum(e["effectif"] for e in effectifs if e["categorie"] == "chef_equipe")
    nb_vehicules = sum(v["quantite"] for v in vehicules)
    nb_materiel = sum(m["quantite"] for m in materiel if not m["unite"])
    tuiles = [
        _tuile(total_effectif, "personnes" if effectifs else "personnes clés"),
        _tuile(chefs, "chefs d'équipe"),
        _tuile(nb_vehicules, "véhicules"),
        _tuile(nb_materiel or len(materiel), "matériels"),
    ]
    lignes_cles = [_ligne("Activités", _court(_t(_g(cfg, "activites") or _g(org, "activites")), 300)),
                   _ligne("Zone d'intervention", _t(_g(cfg, "zone_intervention")))]
    return {"tuiles": tuiles, "lignes_cles": [x for x in lignes_cles if x["valeur"]], "sections": sections,
            "references": None}


# ─── Rubrique Identité ─────────────────────────────────────────────────────────

def _exercices(cfg: Optional[MemoireConfig]) -> list[dict]:
    lignes = []
    for l in _liste_json(_g(cfg, "chiffre_affaires")):
        if not isinstance(l, dict):
            continue
        annee, montant = _t(l.get("annee")), _t(l.get("montant"))
        if not annee and not montant:
            continue
        lignes.append({
            "annee": annee, "montant": montant, "valeur": montant_saisi(montant),
            "domaine": _t(l.get("montant_domaine")), "effectif": l.get("effectif_moyen"),
        })
    return sorted(lignes, key=lambda x: x["annee"], reverse=True)


def _identite(db: Session, org: Organization, cfg: Optional[MemoireConfig], jour: date) -> dict:
    societe = _societe(org, cfg)
    capital = _g(org, "capital_social")
    exercices = _exercices(cfg)
    creation = _t(_g(cfg, "date_creation"))
    nb_refs = len(_references(db, org.id))

    identite = [
        _ligne("Raison sociale", societe["nom"]), _ligne("Forme juridique", societe["forme"]),
        _ligne("SIRET", societe["siret"]), _ligne("Code NAF", _t(org.naf_code)),
        _ligne("Greffe", _t(_g(org, "greffe_rcs"))),
        _ligne("Capital social", euros(capital, ht=False) if capital else ""),
        _ligne("Création", creation), _ligne("Siège", societe["adresse"]),
    ]
    dirigeant = " — ".join(x for x in (_t(_g(cfg, "gerant_nom")), _t(_g(cfg, "gerant_titre"))) if x)
    contacts = [_ligne("Dirigeant", dirigeant), _ligne("E-mail", _t(_g(org, "email_contact"))),
                _ligne("Téléphone", _t(_g(org, "telephone")))]
    chiffres = []
    for e in exercices:
        valeur = euros(e["valeur"]) if e["valeur"] is not None else e["montant"]
        morceaux = [valeur] if valeur else []
        if e["domaine"]:
            morceaux.append(f"dont {e['domaine']} dans le domaine")
        if e["effectif"] not in (None, ""):
            morceaux.append(f"effectif moyen {_entier(e['effectif'])}")
        if morceaux:
            chiffres.append(_ligne(e["annee"] or "Exercice", " · ".join(morceaux)))
    if _t(org.effectif_tranche):
        chiffres.append(_ligne("Tranche d'effectif", _t(org.effectif_tranche)))
    from services.veille.metiers import LIBELLES
    metiers = ", ".join(LIBELLES.get(m, m) for m in _liste_json(_g(cfg, "metiers")) if m != "autre")
    departements = ", ".join(str(d) for d in _liste_json(_g(cfg, "departements_intervention")))
    activite = [_ligne("Activités", _court(_t(_g(cfg, "activites") or _g(org, "activites")), 300)),
                _ligne("Métiers", metiers), _ligne("Zone d'intervention", _t(_g(cfg, "zone_intervention"))),
                _ligne("Départements", departements)]

    derniere = next((e for e in exercices if e["montant"]), None)
    effectif = next((_entier(e["effectif"]) for e in exercices if e["effectif"] not in (None, "")), 0)
    annee_creation = re.search(r"(?:19|20)\d{2}", creation)
    tuiles = [
        _tuile(effectif, "effectif moyen"),
        _tuile(euros(derniere["valeur"], ht=False) if derniere and derniere["valeur"] is not None else
               (derniere["montant"] if derniere else ""), f"CA HT {derniere['annee']}" if derniere and derniere["annee"] else "CA HT"),
        _tuile(annee_creation.group(0) if annee_creation else "", "création"),
        _tuile(nb_refs, "chantiers référencés"),
    ]
    return {
        "tuiles": tuiles, "lignes_cles": [],
        "sections": [
            _section("01", "Identité de l'entreprise", identite),
            _section("02", "Dirigeant et contacts", contacts),
            _section("03", "Chiffres", chiffres),
            _section("04", "Activités et zone d'intervention", activite),
        ],
        "references": None,
    }


# ─── Rubrique Certifications et références ─────────────────────────────────────

NOTE_REFERENCES = (
    "Montants exprimés en euros hors taxes. « En direct » : l'entreprise a contracté avec le maître d'ouvrage ; "
    "« sous-traitance » : l'entreprise est intervenue pour le compte d'une autre entreprise ; « cotraitance » : "
    "l'entreprise a répondu en groupement. Pour un client particulier, l'adresse du client est indiquée."
)
INTERVENTIONS = {"direct": "EN DIRECT", "sous_traitance": "SOUS-TRAITANCE", "cotraitance": "COTRAITANCE"}


def _tableau_references(db: Session, org_id: str) -> dict:
    lignes, total, nb_sous = [], 0.0, 0
    clients = set()
    for i, r in enumerate(_references(db, org_id), start=1):
        mode = _g(r, "mode_intervention")
        particulier = _g(r, "client_type") == "particulier"
        client = _t(r.maitre_ouvrage)
        if client:
            clients.add(client.lower())
        if mode == "sous_traitance":
            nb_sous += 1
        if r.montant_ht is not None:
            total += float(r.montant_ht)
        lieu = " · ".join(x for x in (_t(r.adresse), str(r.annee) if r.annee else "") if x)
        lignes.append({
            "numero": i, "client": client, "client_adresse": _t(_g(r, "client_adresse")) if particulier else "",
            "particulier": particulier, "intervention": mode if mode in INTERVENTIONS else None,
            "chantier": _t(r.intitule), "lieu": lieu, "travaux": _court(_t(_g(r, "description") or r.lot), 220),
            "montant": euros(r.montant_ht) if r.montant_ht is not None else "",
        })
    return {
        "lignes": lignes,
        "total": {"chantiers": len(lignes), "montant": euros(total) if lignes else "", "sous_traitance": nb_sous,
                  "donneurs_ordre": len(clients)},
        "note": NOTE_REFERENCES,
    }


def _certifications(db: Session, org: Organization, cfg: Optional[MemoireConfig], jour: date) -> dict:
    tableau = _tableau_references(db, org.id)
    declarees = _qualifications_declarees(db, org.id)
    documents = _documents(db, org.id)
    relies = {_g(q, "document_id") for q in declarees if _g(q, "document_id")}

    def ligne_declaree(q) -> dict:
        details = " · ".join(x for x in (_t(q.organisme), f"n° {_t(q.numero)}" if _t(q.numero) else "",
                                         _t(q.perimetre)) if x)
        return _ligne(_t(q.intitule), " — ".join(x for x in (details, _validite(q.date_fin, jour)) if x))

    def ligne_document(d: Document) -> dict:
        return _ligne(_TYPES_DOCUMENT[d.type], _validite(d.expiry_date, jour) if d.expiry_date else "À confirmer")

    qualifications = [ligne_declaree(q) for q in declarees if _g(q, "famille") in ("qualification", "rge", "systeme_management")]
    qualifications += [ligne_document(d) for d in documents if d.type in _TYPES_QUALIFICATION and d.id not in relies]
    assurances = [ligne_declaree(q) for q in declarees if _g(q, "famille") == "assurance"]
    assurances += [ligne_document(d) for d in documents if d.type in _TYPES_ASSURANCE and d.id not in relies]
    habilitations = [_ligne(h["libelle"], f"{h['nombre']} personne" + ("s" if h["nombre"] > 1 else "")
                            + (f" — {_validite(h['fin'], jour)}" if h["fin"] else ""))
                     for h in _habilitations(cfg)]
    habilitations += [ligne_document(d) for d in documents if d.type in _TYPES_HABILITATION and d.id not in relies]

    total = tableau["total"]
    tuiles = [
        _tuile(total["chantiers"], "chantiers"), _tuile(total["montant"], "montant cumulé"),
        _tuile(total["sous_traitance"] if any(l["intervention"] for l in tableau["lignes"]) else "", "en sous-traitance"),
        _tuile(total["donneurs_ordre"], "donneurs d'ordre"),
    ]
    return {
        "tuiles": tuiles, "lignes_cles": [],
        "sections": [
            _section("01", "Qualifications et labels", qualifications),
            _section("02", "Assurances", assurances),
            _section("03", "Habilitations", habilitations),
        ],
        "references": tableau,
    }


# ─── Assemblage ────────────────────────────────────────────────────────────────

def pages_estimees(rubrique: str, donnees: dict) -> int:
    """Estimation du nombre de pages (l'aperçu n'est pas paginé). Calée sur les PDF réellement produits."""
    if rubrique != "certifications":
        return 1
    n = len((donnees.get("references") or {}).get("lignes", []))
    return 1 + max(0, -(-(n - 8) // 12)) if n > 8 else 1


def assembler(db: Session, org_id: str, rubrique: str, *, jour: Optional[date] = None) -> dict:
    """Toutes les données de la fiche d'une rubrique, prêtes à être affichées ou imprimées."""
    jour = jour or aujourdhui()
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org is None:
        raise LookupError("organisation introuvable")
    cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first()
    societe = _societe(org, cfg)
    corps = {"moyens": _moyens, "identite": _identite, "certifications": _certifications}[rubrique](
        db, org, cfg, jour)
    donnees = {
        "rubrique": rubrique, "societe": societe, "identite_ligne": _identite_ligne(societe), **corps,
        "pied": _pied(societe),
    }
    donnees["pages"] = pages_estimees(rubrique, donnees)
    return donnees
