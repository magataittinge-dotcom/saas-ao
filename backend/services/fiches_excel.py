"""Fiches « Mon entreprise » en Excel (openpyxl) : le même contenu que le Word, en tableaux à trier ou à compléter.

Identité et Moyens : UNE SEULE feuille « Fiche » (en-tête du classeur, « Chiffres clés », puis chaque section l'une sous
l'autre sous son intitulé), tableau à deux colonnes (Information · Valeur) ; une troisième colonne « Échéance » (date
``jj/mm/aaaa``) s'ajoute quand une ligne porte une date. Références (rubrique « certifications ») : une feuille par
section (``donnees["sections"]``), une feuille « Références » (N° · Client / donneur d'ordre · Intervention · Chantier et
travaux réalisés · Montant HT, puis ligne TOTAL) et une feuille « Chiffres clés » (tuiles et lignes d'en-tête). Chaque feuille ouvre sur deux lignes d'en-tête (société et SIRET, titre du bordereau), puis la ligne
des intitulés de colonnes, figée (``freeze_panes``) et répétée à l'impression (A4, ajusté à la largeur d'une page,
paysage pour les références).

Règles : aucune ligne vide (une section sans ligne n'a pas de feuille) ; les montants sont des NOMBRES au format
``# ##0 € "HT"`` (jamais du texte à re-saisir) ; aucune formule (le total est écrit en valeur).

Sécurité (injection de formules, OWASP « CSV/formula injection ») : toute cellule TEXTE qui commence par ``=``,
``+``, ``-``, ``@``, une tabulation ou un retour chariot est préfixée d'une apostrophe, et forcée en type texte :
Excel ou LibreOffice ne l'évalueront jamais, même si le contenu vient d'un champ libre de l'entreprise.
"""
from __future__ import annotations

import io
import re
from datetime import date
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.worksheet.worksheet import Worksheet

from services.fiches_donnees import INTERVENTIONS, VIDE_SECTION
from services.fiches_entreprise import lignes_effectives

TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FORMAT_EUROS = '# ##0 "€ HT"'
FORMAT_DATE = "DD/MM/YYYY"
POLICE = "Calibri"
_DEBUTS_DANGEREUX = ("=", "+", "-", "@", "\t", "\r")
_INTERDITS_FEUILLE = re.compile(r"[\\/*?:\[\]]")
# Rubriques dont l'Excel tient sur UNE feuille « Fiche » ; la rubrique des références garde une feuille par section.
RUBRIQUES_FEUILLE_UNIQUE = ("identite", "moyens")
_ENTETES_COLONNES = 3          # ligne des intitulés ; les données commencent à la suivante


def neutraliser(valeur: Any) -> Any:
    """Texte inoffensif pour un tableur : préfixé d'une apostrophe s'il pourrait être pris pour une formule."""
    if isinstance(valeur, str) and valeur.startswith(_DEBUTS_DANGEREUX):
        return "'" + valeur
    return valeur


def _poser(cellule: Cell, valeur: Any, **style) -> Cell:
    """Écrit une valeur : le texte est neutralisé puis forcé en type texte (openpyxl prendrait « =… » pour une formule)."""
    valeur = neutraliser(valeur)
    cellule.value = valeur
    if isinstance(valeur, str):
        cellule.data_type = "s"
    for nom, v in style.items():
        setattr(cellule, nom, v)
    return cellule


def _hex(couleur: str) -> str:
    return couleur.lstrip("#").upper()


def _nom_feuille(texte: str, pris: set) -> str:
    """31 caractères au plus, sans ``\\ / * ? : [ ]``, unique dans le classeur (Excel compare sans la casse)."""
    base = _INTERDITS_FEUILLE.sub(" ", texte).strip().strip("'")[:31].strip() or "Fiche"
    nom, i = base, 2
    while nom.lower() in pris:
        suffixe = f" ({i})"
        nom, i = base[: 31 - len(suffixe)] + suffixe, i + 1
    pris.add(nom.lower())
    return nom


class _Style:
    def __init__(self, pal: dict) -> None:
        filet = Side(style="thin", color=_hex(pal["filet"]))
        self.bordure = Border(bottom=filet)
        self.entete_fond = PatternFill("solid", fgColor=_hex(pal["bandeau"]))
        self.entete_police = Font(name=POLICE, bold=True, size=10, color="FFFFFF")
        self.societe = Font(name=POLICE, bold=True, size=13, color=_hex(pal["encre"]))
        self.titre = Font(name=POLICE, size=10, color=_hex(pal["discret"]))
        self.texte = Font(name=POLICE, size=10, color=_hex(pal["texte"]))
        self.gras = Font(name=POLICE, size=10, bold=True, color=_hex(pal["encre"]))
        self.numero = Font(name=POLICE, size=10, bold=True, color=_hex(pal["accent_texte"]))
        self.total_fond = PatternFill("solid", fgColor=_hex(pal["accent_pale"]))
        self.total_police = Font(name=POLICE, size=10, bold=True, color=_hex(pal["accent_texte"]))
        self.note = Font(name=POLICE, size=9, italic=True, color=_hex(pal["discret"]))
        self.haut = Alignment(vertical="top", wrap_text=True)
        self.haut_droite = Alignment(vertical="top", horizontal="right")
        self.haut_centre = Alignment(vertical="top", horizontal="center")


def _mise_en_page(ws: Worksheet, *, paysage: bool, colonnes: int) -> None:
    """A4, marges réduites, ajusté à la largeur d'une page (hauteur libre), intitulés répétés."""
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "landscape" if paysage else "portrait"
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.print_title_rows = f"{_ENTETES_COLONNES}:{_ENTETES_COLONNES}"
    ws.print_options.horizontalCentered = False
    ws.sheet_view.showGridLines = False


def _entete_classeur(ws: Worksheet, st: _Style, donnees: dict, bordereau: dict, colonnes: int) -> None:
    """Lignes 1 et 2 : société et SIRET, titre du bordereau ; ligne 3 : intitulés (posés par l'appelant)."""
    societe = donnees["societe"]
    ligne1 = " · ".join(x for x in (societe["nom"], f"SIRET {societe['siret']}" if societe["siret"] else "") if x)
    _poser(ws.cell(1, 1), ligne1 or "Fiche entreprise", font=st.societe, alignment=Alignment(vertical="center"))
    ligne2 = " · ".join(x for x in (bordereau.get("titre"), bordereau.get("sous_titre")) if x)
    _poser(ws.cell(2, 1), ligne2 or donnees["rubrique"], font=st.titre, alignment=Alignment(vertical="center"))
    ws.row_dimensions[1].height = 22


def _intitules(ws: Worksheet, st: _Style, noms: tuple, droite: tuple = ()) -> None:
    for i, nom in enumerate(noms, start=1):
        _poser(ws.cell(_ENTETES_COLONNES, i), nom.upper(), font=st.entete_police, fill=st.entete_fond,
               alignment=Alignment(vertical="center", horizontal="right" if i in droite else "left",
                                   indent=0 if i in droite else 1))
    ws.row_dimensions[_ENTETES_COLONNES].height = 20
    ws.freeze_panes = ws.cell(_ENTETES_COLONNES + 1, 1)


def _largeurs(ws: Worksheet, largeurs: list) -> None:
    for i, l in enumerate(largeurs, start=1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = l


def _hauteur_ligne(textes: list, largeurs: list) -> float:
    """Hauteur (points) d'une ligne dont les cellules passent à la ligne : LibreOffice et Excel ne recalculent pas toujours
    la hauteur d'une cellule à retours à la ligne, et le texte se chevaucherait. ~1,15 caractère de Calibri 10 par unité de
    largeur de colonne ; 13 points par ligne, plus 4 de marge."""
    lignes = 1
    for texte, largeur in zip(textes, largeurs):
        if isinstance(texte, str) and texte:
            utile = max(1.0, largeur * 1.15)
            lignes = max(lignes, sum(max(1, -(-len(par) // int(utile))) for par in texte.split("\n")))
    return min(409.0, 13.0 * lignes + 4)


def _date_iso(brut: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(brut)) if brut else None
    except ValueError:
        return None


def _lignes_non_vides(lignes: list) -> list:
    return [l for l in lignes if str(l.get("valeur", "")).strip()]


def _ecrire_lignes(ws: Worksheet, st: _Style, lignes: list, debut: int, avec_echeance: bool, largeurs: list) -> int:
    """Écrit les lignes Information · Valeur (· Échéance) à partir de la ligne ``debut`` ; renvoie la ligne suivante."""
    for i, l in enumerate(lignes, start=debut):
        libelle = l.get("libelle") or ""
        if libelle.isdigit():                                    # un effectif reste un nombre (pas de « nombre en texte »)
            libelle = int(libelle)
        _poser(ws.cell(i, 1), libelle, font=st.gras, alignment=Alignment(vertical="top", horizontal="left", wrap_text=True, indent=1),
               border=st.bordure)
        _poser(ws.cell(i, 2), l["valeur"], font=st.texte, alignment=st.haut, border=st.bordure)
        ws.row_dimensions[i].height = _hauteur_ligne([str(libelle), l["valeur"]], largeurs)
        if avec_echeance:
            fin = _date_iso(l.get("fin"))
            c = ws.cell(i, 3)
            if fin is not None:
                c.value, c.number_format = fin, FORMAT_DATE
            c.font, c.alignment, c.border = st.texte, st.haut_centre, st.bordure
    return debut + len(lignes)


def _a_echeance(lignes: list) -> bool:
    return any(_date_iso(l.get("fin")) for l in lignes)


def _feuille_information(wb: Workbook, st: _Style, pris: set, titre: str, lignes: list, donnees: dict,
                         bordereau: dict) -> Optional[Worksheet]:
    """Tableau à deux colonnes (Information · Valeur), plus « Échéance » si une ligne porte une date."""
    lignes = _lignes_non_vides(lignes)
    if not lignes:
        return None
    ws = wb.create_sheet(_nom_feuille(titre, pris))
    avec_echeance = _a_echeance(lignes)
    noms = ("Information", "Valeur") + (("Échéance",) if avec_echeance else ())
    _entete_classeur(ws, st, donnees, bordereau, len(noms))
    _intitules(ws, st, noms)
    largeurs = [38, 78] + ([14] if avec_echeance else [])
    _ecrire_lignes(ws, st, lignes, _ENTETES_COLONNES + 1, avec_echeance, largeurs)
    _largeurs(ws, largeurs)
    _mise_en_page(ws, paysage=False, colonnes=len(noms))
    return ws


def _titre_de_section(ws: Worksheet, st: _Style, ligne: int, titre: str, colonnes: int) -> None:
    """Ligne de titre d'une section dans la feuille unique : bandeau pâle sur toute la largeur du tableau."""
    for col in range(1, colonnes + 1):
        c = ws.cell(ligne, col)
        c.fill, c.font = st.total_fond, st.total_police
        c.alignment = Alignment(vertical="center", horizontal="left", indent=1 if col == 1 else 0)
    _poser(ws.cell(ligne, 1), titre)
    ws.row_dimensions[ligne].height = 22


def _feuille_unique(wb: Workbook, st: _Style, blocs: list, donnees: dict, bordereau: dict) -> Optional[Worksheet]:
    """Une seule feuille « Fiche » : les blocs (titre, lignes) l'un sous l'autre, sans ligne vide entre eux."""
    blocs = [(t, _lignes_non_vides(l)) for t, l in blocs]
    blocs = [(t, l) for t, l in blocs if l]
    if not blocs:
        return None
    ws = wb.create_sheet("Fiche")
    avec_echeance = any(_a_echeance(l) for _, l in blocs)
    noms = ("Information", "Valeur") + (("Échéance",) if avec_echeance else ())
    _entete_classeur(ws, st, donnees, bordereau, len(noms))
    _intitules(ws, st, noms)
    largeurs = [38, 78] + ([14] if avec_echeance else [])
    ligne = _ENTETES_COLONNES + 1
    for titre, lignes in blocs:
        _titre_de_section(ws, st, ligne, titre, len(noms))
        ligne = _ecrire_lignes(ws, st, lignes, ligne + 1, avec_echeance, largeurs)
    _largeurs(ws, largeurs)
    _mise_en_page(ws, paysage=False, colonnes=len(noms))
    return ws


LARGEURS_REFERENCES = [6, 36, 19, 72, 18]


def _feuille_references(wb: Workbook, st: _Style, pris: set, ref: dict, donnees: dict, bordereau: dict) -> Worksheet:
    ws = wb.create_sheet(_nom_feuille("Références", pris))
    noms = ("N°", "Client / donneur d'ordre", "Intervention", "Chantier et travaux réalisés", "Montant HT")
    _entete_classeur(ws, st, donnees, bordereau, len(noms))
    _intitules(ws, st, noms, droite=(5,))
    ligne = _ENTETES_COLONNES
    for x in ref["lignes"]:
        ligne += 1
        client = x["client"] + (" (particulier)" if x["particulier"] else "")
        if x["client_adresse"]:
            client += "\n" + x["client_adresse"]
        chantier = "\n".join(t for t in (x["chantier"], x["lieu"], x["travaux"]) if t)
        _poser(ws.cell(ligne, 1), x["numero"], font=st.numero, alignment=st.haut_centre, border=st.bordure)
        _poser(ws.cell(ligne, 2), client, font=st.gras, alignment=st.haut, border=st.bordure)
        _poser(ws.cell(ligne, 3), INTERVENTIONS.get(x["intervention"], "") if x["intervention"] else "",
               font=st.texte, alignment=st.haut, border=st.bordure)
        _poser(ws.cell(ligne, 4), chantier, font=st.texte, alignment=st.haut, border=st.bordure)
        c = ws.cell(ligne, 5)
        if x.get("montant_valeur") is not None:
            c.value, c.number_format = float(x["montant_valeur"]), FORMAT_EUROS
        c.font, c.alignment, c.border = st.gras, st.haut_droite, st.bordure
        ws.row_dimensions[ligne].height = _hauteur_ligne([str(x['numero']), client, "", chantier], LARGEURS_REFERENCES)
    total = ref["total"]
    ligne += 1
    n = total["chantiers"]
    texte = f"TOTAL · {n} chantier{'s' if n > 1 else ''}"
    if total.get("sous_traitance"):
        texte += f" · dont {total['sous_traitance']} en sous-traitance"
    for col in range(1, 6):
        c = ws.cell(ligne, col)
        c.fill, c.font = st.total_fond, st.total_police
        c.alignment = st.haut_droite if col == 5 else Alignment(vertical="center")
    _poser(ws.cell(ligne, 2), texte)
    if total.get("montant_valeur") is not None:
        ws.cell(ligne, 5).value = float(total["montant_valeur"])
        ws.cell(ligne, 5).number_format = FORMAT_EUROS
    ligne += 1
    _poser(ws.cell(ligne, 1), ref["note"], font=st.note, alignment=Alignment(vertical="top"))
    _largeurs(ws, LARGEURS_REFERENCES)
    _mise_en_page(ws, paysage=True, colonnes=len(noms))
    return ws


def generer_xlsx(donnees: dict, bordereau: dict, pal: dict) -> bytes:
    """Classeur Excel de la fiche. ``bordereau`` : titre, sous_titre, lignes_libres (valeurs effectives)."""
    wb = Workbook()
    wb.remove(wb.active)
    st = _Style(pal)
    pris: set = set()
    lignes_libres = bordereau.get("lignes_libres") or []

    cles = [{"libelle": t["libelle"][:1].upper() + t["libelle"][1:],
             "valeur": int(t["valeur"]) if str(t["valeur"]).isdigit() else t["valeur"]}      # un nombre reste un nombre
            for t in donnees.get("tuiles") or []]
    cles += list(donnees.get("lignes_cles") or [])
    sections = [(f"{section['id']} {section['titre']}",
                 ([{"libelle": "", "valeur": section["texte"]}] if section.get("texte") else [])
                 + lignes_effectives(section, lignes_libres)) for section in donnees.get("sections") or []]
    if donnees.get("rubrique") in RUBRIQUES_FEUILLE_UNIQUE:
        _feuille_unique(wb, st, [("Chiffres clés", cles)] + sections, donnees, bordereau)
    else:
        _feuille_information(wb, st, pris, "Chiffres clés", cles, donnees, bordereau)
        ref = donnees.get("references")
        if ref and ref.get("lignes"):
            _feuille_references(wb, st, pris, ref, donnees, bordereau)
        for titre, lignes in sections:
            _feuille_information(wb, st, pris, titre, lignes, donnees, bordereau)
    if not wb.sheetnames:                       # une fiche sans aucune donnée : une feuille, pas de classeur vide
        ws = wb.create_sheet("Fiche")
        _entete_classeur(ws, st, donnees, bordereau, 2)
        _intitules(ws, st, ("Information", "Valeur"))
        _poser(ws.cell(_ENTETES_COLONNES + 1, 1), "Précisions", font=st.gras)
        _poser(ws.cell(_ENTETES_COLONNES + 1, 2), VIDE_SECTION, font=st.texte)
        _largeurs(ws, [38, 78])
        _mise_en_page(ws, paysage=False, colonnes=2)
    wb.properties.title = str(bordereau.get("titre") or "")[:200]
    wb.properties.creator = (donnees["societe"]["nom"] or "Synorix")[:200]
    wb.properties.lastModifiedBy = wb.properties.creator
    sortie = io.BytesIO()
    wb.save(sortie)
    return sortie.getvalue()
