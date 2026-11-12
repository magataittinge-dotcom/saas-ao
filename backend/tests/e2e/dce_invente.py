"""Dossier de consultation INVENTÉ pour le test de bout en bout (frontend/e2e).

Acheteur, commune, adresse, montants et dates n'existent pas : aucun texte d'un vrai dossier.
Deux lots, une date de remise à venir (aujourd'hui + 40 jours), quatre pièces : règlement (RC),
CCAP, CCTP (PDF) et DPGF (tableur), réunies dans une archive ZIP (le geste du client).

    python -m tests.e2e.dce_invente <dossier>     (depuis backend/) → écrit les quatre fichiers

Les phrases citées par l'IA simulée (tests/e2e/api_simulee.py) viennent de PHRASES : elles sont
recopiées mot pour mot dans les pièces, pour que l'ancrage des sources les retrouve.
"""
from __future__ import annotations

import io
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

ACHETEUR = "Communauté de communes du Val de Lisande"
COMMUNE = "Quintorbe-sur-Lisande"
ADRESSE = "4 chemin des Grèbes, 99871 Quintorbe-sur-Lisande"
OBJET = "Extension de l'école élémentaire des Grèbes"
LOT1 = "Lot 01 - Gros œuvre"
LOT2 = "Lot 02 - Menuiseries extérieures"
# Le nom de l'AO vient du nom du fichier : il sert aussi de marque pour le ménage du test.
NOM_ZIP = "E2E Ecole des Grebes.zip"
MARQUE = "E2E Ecole des Grebes"


def date_remise() -> date:
    return date.today() + timedelta(days=40)


def _fr(d: date) -> str:
    return d.strftime("%d/%m/%Y")


PHRASES = {
    "dc1": "Le candidat produit le formulaire DC1 dûment complété et signé.",
    "dc2": "Le candidat produit le formulaire DC2 ou une déclaration équivalente.",
    "assurance": "Le candidat joint son attestation d'assurance de responsabilité civile décennale en cours de validité.",
    "memoire": "Le candidat remet un mémoire technique présentant la méthodologie, les moyens humains et matériels et le planning.",
    "criteres": "Les offres sont jugées sur la valeur technique pour 60 % et sur le prix pour 40 %.",
    "delai": "Le délai global d'exécution est de six mois à compter de l'ordre de service.",
    "penalites": "Les pénalités de retard sont fixées à 1/3000 du montant du marché par jour calendaire.",
    "retenue": "Une retenue de garantie de 5 % est appliquée sur chaque acompte.",
    "paiement": "Le délai de paiement est de trente jours.",
    "beton": "Les bétons de fondation sont de classe C25/30 et respectent la norme NF EN 206.",
    "coffrage": "Les parements vus sont de type soigné, sans reprise apparente.",
    "planning": "L'entreprise remet un planning détaillé des travaux de son lot sous quinze jours.",
    "menuiseries": "Les menuiseries extérieures sont en aluminium à rupture de pont thermique.",
}


def textes() -> dict[str, list[str]]:
    """Pages des trois pièces PDF (une chaîne par page)."""
    remise = _fr(date_remise())
    rc = [
        f"REGLEMENT DE LA CONSULTATION\n{ACHETEUR}\n{OBJET}\n\n"
        "Article 1 - Objet de la consultation\n"
        f"La consultation porte sur l'{OBJET.lower()}, {ADRESSE}.\n"
        "Procédure adaptée ouverte (article R2123-1 du code de la commande publique).\n\n"
        "Article 2 - Décomposition en lots\n"
        "Les travaux sont répartis en deux lots :\n"
        f"{LOT1}\n{LOT2}\n"
        "Le candidat peut répondre à un ou plusieurs lots.\n\n"
        "Article 3 - Date limite de remise des offres\n"
        f"Les offres sont remises au plus tard le {remise} à 12h00 sur le profil d'acheteur.",
        "Article 4 - Contenu du dossier de candidature\n"
        f"{PHRASES['dc1']}\n{PHRASES['dc2']}\n{PHRASES['assurance']}\n\n"
        "Article 5 - Contenu de l'offre\n"
        f"{PHRASES['memoire']}\n"
        "Le candidat joint la DPGF du lot complétée.\n\n"
        "Article 6 - Jugement des offres\n"
        f"{PHRASES['criteres']}",
    ]
    ccap = [
        "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIERES\n"
        f"{ACHETEUR} - {OBJET}\n\n"
        "Article 1 - Délais\n"
        f"{PHRASES['delai']}\n\n"
        "Article 2 - Pénalités\n"
        f"{PHRASES['penalites']}\n\n"
        "Article 3 - Retenue de garantie\n"
        f"{PHRASES['retenue']}\n\n"
        "Article 4 - Paiement\n"
        f"{PHRASES['paiement']}",
    ]
    cctp = [
        "CAHIER DES CLAUSES TECHNIQUES PARTICULIERES\n"
        f"{OBJET}\n\n"
        f"{LOT1}\n"
        "Article 1.1 - Bétons\n"
        f"{PHRASES['beton']}\n"
        "Article 1.2 - Coffrages\n"
        f"{PHRASES['coffrage']}\n"
        "Article 1.3 - Planning\n"
        f"{PHRASES['planning']}\n\n"
        f"{LOT2}\n"
        "Article 2.1 - Menuiseries\n"
        f"{PHRASES['menuiseries']}",
    ]
    return {"RC": rc, "CCAP": ccap, "CCTP": cctp}


def dpgf_xlsx() -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Lot 01"
    ws.append([f"DPGF - {LOT1}", "", "", "", ""])
    ws.append(["N°", "Désignation", "Unité", "Quantité", "Prix unitaire HT"])
    ws.append(["1.1", "Béton de fondation C25/30", "m3", 42, None])
    ws.append(["1.2", "Coffrage des voiles", "m2", 180, None])
    ws.append(["1.3", "Dallage sur terre-plein", "m2", 210, None])
    ws2 = wb.create_sheet("Lot 02")
    ws2.append([f"DPGF - {LOT2}", "", "", "", ""])
    ws2.append(["N°", "Désignation", "Unité", "Quantité", "Prix unitaire HT"])
    ws2.append(["2.1", "Fenêtre aluminium deux vantaux", "u", 14, None])
    tampon = io.BytesIO()
    wb.save(tampon)
    return tampon.getvalue()


def ecrire(dossier: Path) -> list[Path]:
    from tests.pdf_fabrique import ecrire_pdf

    dossier.mkdir(parents=True, exist_ok=True)
    t = textes()
    sorties = [
        ecrire_pdf(dossier / "RC - Reglement de la consultation.pdf", t["RC"]),
        ecrire_pdf(dossier / "CCAP.pdf", t["CCAP"]),
        ecrire_pdf(dossier / "CCTP.pdf", t["CCTP"]),
    ]
    dpgf = dossier / "DPGF.xlsx"
    dpgf.write_bytes(dpgf_xlsx())
    sorties.append(dpgf)
    # La pièce que l'entreprise joint à l'étape Pièces (hors archive) : un DC2 rempli, inventé lui aussi.
    dc2 = ecrire_pdf(dossier / "DC2 - Entreprise E2E.pdf",
                     ["DECLARATION DU CANDIDAT (DC2)\nEntreprise E2E Batiment\nSIRET fictif : 000 000 000 00000\n"
                      f"Consultation : {OBJET} - {LOT1}"])
    archive = dossier / NOM_ZIP
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorties:
            z.write(f, f.name)
    return [archive, *sorties, dc2]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage : python -m tests.e2e.dce_invente <dossier>")
        sys.exit(2)
    for p in ecrire(Path(sys.argv[1])):
        print(p)
