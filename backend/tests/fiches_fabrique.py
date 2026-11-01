"""Entreprise INVENTÉE pour les fiches « Mon entreprise » : aucune donnée réelle.

Les champs de la migration 0029 (agent PAGE) n'existent pas encore dans cette branche : ils sont posés sur un
objet de remplacement (``SimpleNamespace``) lu par ``services.fiches_donnees`` avec ``getattr`` — exactement le
chemin que prendra le code quand les colonnes existeront."""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from models.document import Document
from models.organization import Organization
from models.reference import Reference
from models.team_member import TeamMember
from services import fiches_donnees as fd

AUJOURDHUI = date(2026, 11, 1)


def profil_0029() -> SimpleNamespace:
    """Profil complet : textes actuels + listes de la migration 0029."""
    return SimpleNamespace(
        nom_entreprise="Lambert Maçonnerie", date_creation="2009", gerant_nom="Camille Lambert",
        gerant_titre="Gérante", zone_intervention="Marne, Aube et Ardennes (rayon de 80 km autour de Reims)",
        historique="", activites="Gros œuvre, maçonnerie traditionnelle, rénovation de bâtiments anciens, "
                                 "façades et enduits.",
        chiffre_affaires=[
            {"annee": "2025", "montant": "1 640 000", "montant_domaine": "1 480 000", "effectif_moyen": 12},
            {"annee": "2024", "montant": "1 420 000", "montant_domaine": "1 300 000", "effectif_moyen": 11},
            {"annee": "2023", "montant": "1 210 000", "montant_domaine": "", "effectif_moyen": 10},
        ],
        organigramme_description="", postes_cles=[
            {"poste": "Conducteur de travaux", "nom": "Jean Moreau", "role": ""},
            {"poste": "Chef de chantier", "nom": "Luc Perrin", "role": ""},
        ],
        moyens_informatiques="Postes de bureau et tablettes de chantier, logiciel de métrés et de suivi de chantier, "
                             "sauvegardes quotidiennes, messagerie professionnelle.",
        vehicules="", materiel="", demarche_qualite="Autocontrôles à chaque étape, réception interne avant la "
                                                    "réception avec le maître d'ouvrage, fiches de suivi.",
        procedure_demarrage="", gestion_securite="PPSPS établi pour chaque chantier, accueil sécurité de chaque "
                                                  "nouvel intervenant, causerie hebdomadaire.",
        traitement_dechets="Tri sur site en trois bennes, bordereaux de suivi des déchets conservés.",
        mesures_environnementales="Arrosage des zones poussiéreuses, nettoyage quotidien des abords.",
        fournisseurs_principaux="",
        metiers=["gros_oeuvre", "facade_ite"], departements_intervention=["51", "10", "08"],
        effectifs_par_categorie=[
            {"categorie": "encadrement", "specialite": None, "effectif": 2},
            {"categorie": "chef_equipe", "specialite": "Maçonnerie", "effectif": 3},
            {"categorie": "chef_equipe", "specialite": "Façades", "effectif": 1},
            {"categorie": "ouvrier", "specialite": "Maçons", "effectif": 5},
            {"categorie": "administratif", "specialite": None, "effectif": 1},
        ],
        habilitations=[
            {"type": "sst", "libelle": None, "nombre": 4, "valide_jusqu": "2027-06-30"},
            {"type": "caces", "libelle": None, "nombre": 3, "valide_jusqu": None},
            {"type": "travail_hauteur", "libelle": None, "nombre": 6, "valide_jusqu": None},
            {"type": "autre", "libelle": "Conduite de grue auxiliaire", "nombre": 1, "valide_jusqu": None},
        ],
        materiel_liste=[
            {"quantite": 700, "designation": "Échafaudage de façade", "unite": "m²", "famille": "Échafaudages"},
            {"quantite": 2, "designation": "Bétonnières", "unite": None, "famille": "Gros œuvre"},
            {"quantite": 1, "designation": "Mini-pelle de 3 tonnes", "unite": None, "famille": "Terrassement"},
            {"quantite": 2, "designation": "Machines à projeter les enduits", "unite": None, "famille": "Façades"},
            {"quantite": 4, "designation": "Perforateurs-burineurs", "unite": None, "famille": "Outillage"},
        ],
        vehicules_liste=[
            {"quantite": 3, "designation": "Fourgons aménagés", "unite": None, "famille": None},
            {"quantite": 1, "designation": "Camion benne de 3,5 tonnes", "unite": None, "famille": None},
        ],
        sous_traitance_partenaires="", sous_traitance_part_pct=None, sav_garantie="Intervention sous 48 heures "
        "ouvrées en garantie de parfait achèvement, interlocuteur dédié.",
    )


def creer_entreprise(db, org_id="org-fiches", nom="Maçonnerie Lambert SAS") -> Organization:
    org = Organization(id=org_id, name=nom, siret="12345678900019", address="12 avenue du Port, 51100 Reims",
                       naf_code="4399C", effectif_tranche="10 à 19 salariés")
    db.add(org)
    db.commit()
    # Champs de 0029 posés comme attributs simples (lus par getattr).
    org.forme_juridique, org.email_contact, org.telephone = "SAS", "contact@lambert-maconnerie.example", "03 26 00 00 00"
    org.capital_social, org.greffe_rcs = 40000, "Reims"
    return org


def creer_references(db, org_id: str, n: int = 20) -> None:
    """Références persistées (colonnes actuelles) : le tableau les lit tel quel."""
    for i in range(n):
        champs = champs_reference(i)
        db.add(Reference(
            organization_id=org_id, intitule=champs["intitule"], adresse=champs["adresse"],
            maitre_ouvrage=champs["maitre_ouvrage"], lot=champs["lot"], montant_ht=champs["montant_ht"],
            annee=champs["annee"], statut="gagné", is_reference=True))
    db.commit()


CLIENTS = ["Ville de Reims", "Habitat Marne", "Commune d'Épernay", "Groupe Sablier", "Mme Dubois",
           "Département de la Marne"]
TRAVAUX = ["Gros œuvre et façades", "Réhabilitation de logements", "Extension en maçonnerie", "Ravalement et enduits",
           "Reprise en sous-œuvre"]
MODES = ["direct", "sous_traitance", "direct", "sous_traitance", "cotraitance"]


def champs_reference(i: int) -> dict:
    return {
        "intitule": f"Opération {i + 1:02d} — {TRAVAUX[i % len(TRAVAUX)]}", "adresse": f"{10 + i} rue des Lilas, 51000 Châlons",
        "maitre_ouvrage": CLIENTS[i % len(CLIENTS)], "lot": TRAVAUX[i % len(TRAVAUX)],
        "montant_ht": float(18000 + i * 3450 + (i % 3) * 1175), "annee": 2025 - (i % 5),
    }


def references_0029(n: int = 20) -> list:
    """Les mêmes références avec les 4 champs de la migration 0029 (mode, type et adresse du client, travaux)."""
    sortie = []
    for i in range(n):
        champs = champs_reference(i)
        particulier = champs["maitre_ouvrage"] == "Mme Dubois"
        sortie.append(SimpleNamespace(
            **champs, mode_intervention=MODES[i % len(MODES)], client_type="particulier" if particulier else "public",
            client_adresse="4 rue des Roses, 51100 Reims" if particulier else None,
            description=f"{champs['lot']} : élévation des murs, planchers, enduits de finition.",
            maitre_oeuvre=None, statut="gagné", is_reference=True))
    return sortie


def creer_documents(db, org_id: str, jour: date = AUJOURDHUI) -> None:
    for type_, fin in (("kbis", 90), ("urssaf", 120), ("fiscal", None), ("rc_civile", 300), ("decennale", 20),
                       ("qualibat", 400), ("caces", None)):
        db.add(Document(organization_id=org_id, type=type_, file_url=f"/uploads/x/{type_}.pdf",
                        file_name=f"{type_}.pdf", status="valid",
                        expiry_date=jour + timedelta(days=fin) if fin else None))
    db.commit()


def donnees(db, org: Organization, rubrique: str, cfg=None, jour: date = AUJOURDHUI, references=None) -> dict:
    """Données assemblées avec le profil et les références complets de la migration 0029."""
    cfg = cfg or profil_0029()
    with mock.patch.object(fd, "_references", lambda db_, org_id: references_0029(20) if references is None else references):
        corps = {"moyens": fd._moyens, "identite": fd._identite, "certifications": fd._certifications}[rubrique](
            db, org, cfg, jour)
    societe = fd._societe(org, cfg)
    d = {"rubrique": rubrique, "societe": societe, "identite_ligne": fd._identite_ligne(societe), **corps,
         "pied": fd._pied(societe)}
    d["pages"] = fd.pages_estimees(rubrique, d)
    return d


def bordereau(rubrique: str, **surcharges) -> dict:
    base = {"titre": fd.TITRES[rubrique], "sous_titre": "Dossier entreprise · novembre 2026",
            "contact": "contact@lambert-maconnerie.example · 03 26 00 00 00", "couleur": "#008cf8",
            "lignes_libres": []}
    base.update(surcharges)
    return base
