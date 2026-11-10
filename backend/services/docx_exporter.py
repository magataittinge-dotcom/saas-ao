"""Convertit le content_json d'un mémoire technique en fichier .docx formaté."""
from __future__ import annotations

import io
import logging
import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor, Twips

from services import memoire_markdown as md
from services.docx_sommaire import inserer_sommaire
from services.raison_sociale import raison_sociale_de

# ─── Passages « À compléter » ──────────────────────────────────────────────────
#
# Un « [À COMPLÉTER : X] » restant est une donnée d'entreprise que l'IA n'avait
# pas : il ne part jamais en silence ni entre crochets, il devient un passage
# surligné « À compléter : X » et il est compté (l'écran dira « N passages à
# compléter avant le dépôt »). Même traitement pour un « [📍 … ] » d'un ancien
# mémoire, dont le prompt demandait une consigne de carte.

_A_COMPLETER_RE = re.compile(
    r"\[\s*[ÀA]\s*COMPL[ÉE]TER(?:\s+PAR\s+L['’]ENTREPRISE)?\s*(?::\s*([^\]]{0,300}))?\]", re.IGNORECASE,
)
_PIN_RE = re.compile(r"\[📍[^\]]{0,600}\]")
# R26 — consignes et notes de l'outil restées entre crochets dans d'anciens mémoires
# (« [Ici : … la carte est dessinée par Synorix … ] », « [L'organigramme visuel … ] »,
# « [Insérer une photo … ] ») : jamais imprimées. Ni un lien Markdown « [texte](url) », ni un
# « [À COMPLÉTER : … ] » (traité plus haut : passage surligné et compté).
_CONSIGNE_RE = re.compile(
    r"\[\s*(?:ici\s*:|l['’]organigramme\b|(?:ins[ée]rer|ins[ée]rez|ajouter|ajoutez)\b"
    r"|(?:image|photo|sch[ée]ma|visuel|carte|plan|logo)\b)[^\]\n]{0,600}\](?!\()"
    r"|\[[^\]\n]{0,600}\bsynorix\b[^\]\n]{0,600}\](?!\()",
    re.IGNORECASE,
)
from services.mentions_outil import retirer_mentions_outil  # phrases qui nomment l'outil (recette du 2/11)

_DEBUT_PASSAGE, _FIN_PASSAGE = "\ue000", "\ue001"   # balises privées, jamais imprimées
_PASSAGE_RE = re.compile(f"{_DEBUT_PASSAGE}([^{_FIN_PASSAGE}]*){_FIN_PASSAGE}")


@dataclass(frozen=True)
class PassageACompleter:
    section: str    # titre de la section où il se trouve
    libelle: str    # ce qui est attendu ; vide si l'IA n'a rien précisé


@dataclass
class ExportDocx:
    octets: bytes
    a_completer: list[PassageACompleter] = field(default_factory=list)

    @property
    def nombre(self) -> int:
        return len(self.a_completer)


_COLLECTE: ContextVar[list[PassageACompleter] | None] = ContextVar("docx_a_completer", default=None)
_SECTION: ContextVar[str] = ContextVar("docx_section", default="")


def _libelle_pin(texte: str) -> str:
    """« [📍 INSÉREZ ICI UNE CARTE DE LOCALISATION — … ] » → « carte de localisation »."""
    avant_tiret = texte.strip("[]").split("—")[0]
    nettoye = re.sub(r"^\W*(?:ins[ée]rez ici\s+)?(?:une?\s+)?", "", avant_tiret, flags=re.IGNORECASE)
    return nettoye.strip().lower()


def _marquer_passages(texte: str, *, retirer_marqueur_carte: bool = False) -> str:
    """Remplace chaque passage à compléter par une balise privée portant le
    libellé, et l'enregistre dans l'ordre du document. `retirer_marqueur_carte` :
    la carte est dessinée, l'ancienne consigne « [📍 … ] » n'a plus lieu d'être."""
    if retirer_marqueur_carte:
        texte = _PIN_RE.sub("", texte)
    collecte = _COLLECTE.get()

    def enregistrer(libelle: str) -> str:
        libelle = " ".join(libelle.split())
        if collecte is not None:
            collecte.append(PassageACompleter(_SECTION.get(), libelle))
        return f"{_DEBUT_PASSAGE}{libelle}{_FIN_PASSAGE}"

    # un seul balayage, dans l'ordre du texte
    def remplacer(m: re.Match[str]) -> str:
        if m.group(0).startswith("[📍"):
            return enregistrer(_libelle_pin(m.group(0)))
        return enregistrer(m.group(1) or "")

    marque = re.sub(f"{_PIN_RE.pattern}|{_A_COMPLETER_RE.pattern}", remplacer, texte, flags=re.IGNORECASE)
    return retirer_mentions_outil(_retirer_consignes(marque))


def _retirer_consignes(texte: str) -> str:
    """Retire les consignes et notes de l'outil entre crochets ; une ligne qui n'était que cela disparaît."""
    lignes: list[str] = []
    for ligne in texte.split("\n"):
        if not _CONSIGNE_RE.search(ligne):
            lignes.append(ligne)
            continue
        reste = _CONSIGNE_RE.sub("", ligne)
        if reste.strip():
            lignes.append(re.sub(r" {2,}", " ", reste).rstrip())
    return "\n".join(lignes)

logger = logging.getLogger(__name__)


# ─── Couleurs ──────────────────────────────────────────────────────────────────
# Mission finale DOCUMENTS : le mémoire est le document de l'entreprise, pas une publicité pour l'outil.
# Encre neutre et imprimable (aucun bleu de logiciel) ; la hiérarchie tient aux tailles et aux graisses.
_ENCRE    = RGBColor(0x11, 0x18, 0x27)   # titres 1 et titre de couverture
_ENCRE_2  = RGBColor(0x1F, 0x29, 0x37)   # titres 2
_GREY_TXT = RGBColor(0x1F, 0x2D, 0x3D)
_GREY_META= RGBColor(0x4B, 0x55, 0x63)   # légendes, en-tête courant (contraste suffisant imprimé)
_GREY_PG  = RGBColor(0x6B, 0x72, 0x80)   # pied de page, date de couverture
_FOND_ENTETE_TABLEAU = "E5E7EB"          # fond clair, texte foncé : lisible en noir et blanc
_FOND_LIGNE_PAIRE    = "F3F4F6"
_TRAIT_ENTETE        = "4B5563"

_PART_A: list[tuple[str, str]] = [
    ("implantation",          "1. Implantation géographique"),
    ("historique",            "2. Historique"),
    ("engagement_qualitatif", "3. Engagement qualitatif"),
    ("activites",             "4. Nos activités"),
    ("organigramme",          "5. Organigramme"),
    ("roles_missions",        "6. Rôles et missions de l'équipe d'encadrement"),
    ("moyens_informatiques",  "7. Moyens informatiques"),
    ("vehicules",             "8. Véhicules"),
    ("materiel",              "9. Matériel"),
    ("references",            "10. Références chantiers"),
    ("fournisseurs",          "11. Fournisseurs"),
]
_PART_B: list[tuple[str, str]] = [
    ("demarrage",        "1. Démarrage du chantier"),
    ("interlocuteur",    "2. Interlocuteur dédié"),
    ("qualite_ouvrages", "3. Qualité des ouvrages"),
    ("respect_planning", "4. Respect du planning"),
    ("securite",         "5. Dispositions relatives à la sécurité"),
    ("dechets",          "6. Traitement des déchets"),
    ("environnement",    "7. Environnement"),
]
_PART_C: list[tuple[str, str]] = [
    ("methodologie",             "1. Méthodologie détaillée"),
    ("effectifs",                "2. Effectifs dédiés au chantier"),
    ("materiels",                "3. Matériels dédiés"),
    ("hygiene_securite",         "4. Hygiène et sécurité"),
    ("mesures_environnementales","5. Mesures environnementales"),
    ("gpa",                      "6. Garantie de parfait achèvement (GPA)"),
    ("delai",                    "7. Délai de travaux"),
]


def sections_de_la_partie(content_json: dict[str, Any] | None, part_key: str,
                          defaut: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Les sections d'une partie (clé, titre numéroté) : celles du plan suivi à la rédaction (``_plan``, rangé avec
    le mémoire : titres du patron, ordre, parties ajoutées), sinon les 25 du modèle. Sans plan : ``defaut`` tel quel."""
    plan = (content_json or {}).get("_plan") if isinstance(content_json, dict) else None
    liste = plan.get("parties") if isinstance(plan, dict) else None
    if not isinstance(liste, list):
        return defaut
    sortie: list[tuple[str, str]] = []
    for p in liste:
        if isinstance(p, dict) and p.get("partie") == part_key and isinstance(p.get("sous_cle"), str) \
                and isinstance(p.get("titre"), str):
            sortie.append((p["sous_cle"], f"{len(sortie) + 1}. {p['titre']}"))
    return sortie


# ─── Date en français, sans dépendre de la locale du système ───────────────────

_MOIS_FR = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet",
            "août", "septembre", "octobre", "novembre", "décembre")


def _date_fr(jour: date) -> str:
    """« Octobre 2026 » : majuscule, car le mot ouvre la ligne de la couverture.
    `strftime("%B")` suit la locale du processus (anglais sur un serveur sans
    locale française) : on n'y touche pas."""
    mois = _MOIS_FR[jour.month - 1]
    return f"{mois[0].upper()}{mois[1:]} {jour.year}"


def _aujourdhui() -> date:
    return date.today()


# ─── Helpers document ──────────────────────────────────────────────────────────

def _champ(para, instruction: str, resultat: str = "1", *, taille: float = 9,
           couleur: RGBColor = _GREY_PG):
    """Champ Word complet (begin / instruction / separate / résultat en cache /
    end), un run par étape, mis en forme comme le texte voisin : le résultat en
    cache s'affiche tel quel dans LibreOffice, Word le recalcule."""
    def run(enfant=None, texte: str | None = None):
        r = para.add_run(texte) if texte is not None else para.add_run()
        r.font.size = Pt(taille)
        r.font.color.rgb = couleur
        if enfant is not None:
            r._r.append(enfant)
        return r

    debut = OxmlElement("w:fldChar")
    debut.set(qn("w:fldCharType"), "begin")
    run(debut)
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = f" {instruction} "
    run(instr)
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run(sep)
    run(texte=resultat)
    fin = OxmlElement("w:fldChar")
    fin.set(qn("w:fldCharType"), "end")
    run(fin)


def _effacer_tabulations_du_style(para):
    """Les styles En-tête / Pied de page du modèle portent des tabulations
    (centre 8,25 cm, droite 16,5 cm) qui décalent tout texte après une
    tabulation : on les efface sur le paragraphe."""
    ts = para.paragraph_format.tab_stops
    ts.add_tab_stop(Twips(4680), WD_TAB_ALIGNMENT.CLEAR)
    ts.add_tab_stop(Twips(9360), WD_TAB_ALIGNMENT.CLEAR)


def _add_footer_page_numbers(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    para = footer.paragraphs[0]
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _effacer_tabulations_du_style(para)

    r_before = para.add_run("Page ")
    r_before.font.size = Pt(9)
    r_before.font.color.rgb = _GREY_PG
    _champ(para, "PAGE")
    r_sep = para.add_run(" / ")
    r_sep.font.size = Pt(9)
    r_sep.font.color.rgb = _GREY_PG
    _champ(para, "NUMPAGES")


def titre_du_marche(objet: str | None, lot_name: str | None, project_name: str) -> str:
    """Le titre que l'acheteur reconnaît : l'objet du marché lu dans le DCE, sans le lot qui le précède
    (« Lot 05 — Façade — Restructuration de l'école » → « Restructuration de l'école »). Sans objet : le nom
    de l'AO dans l'outil, faute de mieux."""
    objet = " ".join((objet or "").split())
    if not objet:
        return project_name

    def forme(t: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[—–-]", "-", t)).strip().casefold()

    lot = " ".join((lot_name or "").split())
    if lot and forme(objet).startswith(forme(lot)) and len(objet) > len(lot):
        reste = objet[len(lot):].lstrip(" —–-:·")
        if reste:
            return reste
    return objet


def _poser_proprietes(doc: Document, titre: str, lot_name: str | None, org_name: str):
    """Propriétés du fichier (Fichier > Propriétés, titre du PDF) : au nom de l'entreprise, en français.
    Jamais « python-docx » ni la date du modèle (2013)."""
    from datetime import datetime, timezone

    cp = doc.core_properties
    cp.title = " — ".join(x for x in ("Mémoire technique", titre, lot_name or "") if x)[:250]
    cp.subject = (lot_name or "")[:250]
    cp.author = org_name
    cp.last_modified_by = org_name
    cp.comments = ""
    cp.keywords = ""
    cp.category = "Mémoire technique"
    cp.language = "fr-FR"
    maintenant = datetime.now(timezone.utc).replace(microsecond=0)
    cp.created = maintenant
    cp.modified = maintenant
    cp.revision = 1


def _langue_par_defaut(doc: Document, langue: str = "fr-FR"):
    """Langue des valeurs par défaut du document (le modèle python-docx dit en-US) : correcteur, césure et
    `/Lang` du PDF en français."""
    defauts = doc.styles.element.find(qn("w:docDefaults"))
    rpr = defauts.find(f"{qn('w:rPrDefault')}/{qn('w:rPr')}") if defauts is not None else None
    if rpr is None:
        return
    lang = rpr.find(qn("w:lang"))
    if lang is None:
        lang = OxmlElement("w:lang")
        rpr.append(lang)
    for attr in ("w:val", "w:eastAsia"):
        lang.set(qn(attr), langue)


def _setup_doc(org_name: str, titre_entete: str = "") -> Document:
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21.0), Cm(29.7)   # A4 (le modèle python-docx est en Letter)
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(2.0)
    section.right_margin  = Cm(2.0)

    # Couverture sans en-tête ni pied : première page distincte, laissée vide.
    # Les en-têtes / pieds ci-dessous valent pour les pages suivantes.
    section.different_first_page_header_footer = True

    # En-tête courant : le marché à gauche, l'entreprise à droite, un trait fin dessous. Raison sociale
    # inconnue : le marché seul (la page de garde porte le passage « À compléter »).
    header = section.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _effacer_tabulations_du_style(hp)
    hp.paragraph_format.tab_stops.add_tab_stop(Cm(_LARGEUR_UTILE_CM), WD_TAB_ALIGNMENT.RIGHT)
    ppr = hp._p.get_or_add_pPr()
    bordure = OxmlElement("w:pBdr")
    bas = OxmlElement("w:bottom")
    for cle, val in (("w:val", "single"), ("w:sz", "4"), ("w:space", "4"), ("w:color", "D1D5DB")):
        bas.set(qn(cle), val)
    bordure.append(bas)
    ppr.append(bordure)
    titre_court = titre_entete if len(titre_entete) <= 70 else titre_entete[:69].rstrip() + "…"
    morceaux = [titre_court] + ([f"\t{org_name}"] if org_name else [])
    for texte in morceaux:
        if not texte:
            continue
        hr = hp.add_run(texte)
        hr.font.name = "Calibri"
        hr.font.size = Pt(8.5)
        hr.font.color.rgb = _GREY_META

    _add_footer_page_numbers(section)

    _styles(doc)
    # Pas de police embarquée : le Word déclare Calibri (présente dans tout Word). Le PDF
    # sort en Carlito grâce à `pdf_export`, qui la montre à LibreOffice.
    return doc


def _police_style(style, police: str = "Calibri"):
    """Police posée sur les 4 attributs (ascii, hAnsi, cs, eastAsia) : sinon
    Word et LibreOffice retombent sur la police du thème (Cambria/Calibri) pour
    les titres."""
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), police)


def _styles(doc: Document):
    """Styles Word natifs : le patron retouche dans Word sans casser la mise en
    page (modifier « Titre 2 » change tous les titres 2)."""
    st = doc.styles
    normal = st["Normal"]
    normal.font.size = Pt(11)
    normal.font.color.rgb = _GREY_TXT
    normal.paragraph_format.space_after = Pt(4)
    _police_style(normal)
    langue = OxmlElement("w:lang")
    langue.set(qn("w:val"), "fr-FR")
    normal.element.get_or_add_rPr().append(langue)
    _langue_par_defaut(doc)

    for nom, taille, couleur, avant, apres in (
        ("Heading 1", 16, _ENCRE, 20, 8),
        ("Heading 2", 13, _ENCRE_2, 12, 4),
        ("Heading 3", 11.5, _GREY_TXT, 10, 3),
        ("Heading 4", 11, _GREY_META, 8, 2),
        ("Heading 5", 11, _GREY_META, 6, 2),
        ("Heading 6", 11, _GREY_META, 6, 2),
    ):
        h = st[nom]
        h.font.size = Pt(taille)
        h.font.bold = True
        h.font.italic = nom in ("Heading 5", "Heading 6")
        h.font.color.rgb = couleur
        _police_style(h)
        h.paragraph_format.space_before = Pt(avant)
        h.paragraph_format.space_after = Pt(apres)
        h.paragraph_format.keep_with_next = True

    for nom in ("List Bullet", "List Bullet 2", "List Number", "List Number 2", "Caption"):
        _police_style(st[nom])
    for nom in ("List Bullet", "List Bullet 2", "List Number", "List Number 2"):
        st[nom].paragraph_format.space_after = Pt(2)


def _centered_line(doc: Document, text: str, *, size: int, color, bold: bool = False,
                   space_after: int = 6):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    p.paragraph_format.space_after = Pt(space_after)
    return p


def _cover_page(
    doc: Document,
    project_name: str,
    org_name: str,
    *,
    logo_image: bytes | None = None,
    lot_name: str | None = None,
    maitre_ouvrage: str | None = None,
    org_address: str | None = None,
    org_siret: str | None = None,
):
    """C8b — page de garde sobre : logo (si présent), marché, lot, MOA,
    date, coordonnées entreprise. Sans logo → texte propre, jamais de
    placeholder d'image cassé."""
    # Mission finale DOCUMENTS : la page entière est composée (bloc du marché au premier tiers, bloc de
    # l'entreprise en bas), le titre est l'objet du marché en casse normale (`project_name` a déjà été
    # résolu par `titre_du_marche`), en encre neutre.
    logo_pose = False
    if logo_image:
        try:
            p_logo = doc.add_paragraph()
            p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo.paragraph_format.space_before = Pt(36)
            p_logo.add_run().add_picture(io.BytesIO(logo_image), width=Cm(4.5))
            p_logo.paragraph_format.space_after = Pt(30)
            logo_pose = True
        except Exception:
            # Logo illisible → page de garde texte propre, pas d'image cassée.
            pass

    surtitre = _centered_line(doc, "Mémoire technique", size=12, color=_GREY_META, space_after=16)
    surtitre.paragraph_format.space_before = Pt(0 if logo_pose else 150)
    titre = _centered_line(doc, project_name, size=22 if len(project_name) <= 60 else 19,
                           color=_ENCRE, bold=True, space_after=12)
    titre.paragraph_format.keep_with_next = True
    if lot_name:
        _centered_line(doc, lot_name, size=14, color=_ENCRE_2, space_after=8)
    trait = doc.add_paragraph()
    trait.alignment = WD_ALIGN_PARAGRAPH.CENTER
    trait.paragraph_format.space_after = Pt(10)
    r_trait = trait.add_run("—")
    r_trait.font.size = Pt(12)
    r_trait.font.color.rgb = _GREY_PG
    if maitre_ouvrage:
        _centered_line(doc, f"Maître d'ouvrage : {maitre_ouvrage}", size=11, color=_GREY_META, space_after=0)

    presente = _centered_line(doc, "Présenté par", size=10, color=_GREY_PG, space_after=4)
    presente.paragraph_format.space_before = Pt(120 if logo_pose else 170)
    presente.paragraph_format.keep_with_next = True
    if org_name:
        _centered_line(doc, org_name, size=14, color=_ENCRE, bold=True, space_after=4)
    else:
        # Raison sociale inconnue (SIRET non validé) : un passage « À compléter » surligné et compté, comme
        # ceux du corps (jamais le nom du compte, jamais un blanc silencieux).
        _SECTION.set("Page de garde")
        marque = _marquer_passages("[À COMPLÉTER : raison sociale]")
        p_nom = doc.add_paragraph()
        p_nom.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_nom.paragraph_format.space_after = Pt(6)
        _ajouter_segments(p_nom, [md.Segment(marque)], taille=13)
    if org_address:
        _centered_line(doc, org_address, size=10, color=_GREY_PG, space_after=2)
    if org_siret:
        _centered_line(doc, f"SIRET {org_siret}", size=10, color=_GREY_PG, space_after=2)

    date_couv = _centered_line(doc, _date_fr(_aujourdhui()), size=10, color=_GREY_PG)
    date_couv.paragraph_format.space_before = Pt(10)

    # Pas de saut de page ici : le sommaire (ou, à défaut, le premier titre)
    # démarre sa page par `page_break_before`, sans paragraphe vide en tête.


def _h1(doc: Document, text: str):
    doc.add_heading(text, level=1)


def _h2(doc: Document, text: str):
    _SECTION.set(text)
    doc.add_heading(text, level=2)


# ─── Corps : Markdown de l'IA → styles Word natifs ─────────────────────────────

_LARGEUR_UTILE_CM = 17.0   # A4 21 cm - 2 × 2 cm de marge
_TEXTE_TABLEAU_PT = 9.5
_CM_PAR_SIGNE = 0.21          # Calibri/Carlito 9,5 pt, gras compris (« À compléter » est en gras en en-tête)
_MARGES_CELLULE_CM = 0.35     # 2 × 90 twips de marge de cellule + bordures


def _ajouter_segments(p, segments: list[md.Segment], *, taille: float | None = None,
                      couleur: RGBColor | None = None, gras: bool = False):
    for seg in segments:
        position = 0
        morceaux: list[tuple[str, bool]] = []
        for m in _PASSAGE_RE.finditer(seg.texte):
            if m.start() > position:
                morceaux.append((seg.texte[position:m.start()], False))
            libelle = m.group(1)
            morceaux.append((f"À compléter : {libelle}" if libelle else "À compléter", True))
            position = m.end()
        if position < len(seg.texte):
            morceaux.append((seg.texte[position:], False))
        for texte, a_completer in morceaux:
            texte = texte.replace(_DEBUT_PASSAGE, "").replace(_FIN_PASSAGE, "")
            if not texte:
                continue
            r = p.add_run(texte)
            if seg.gras or gras:
                r.bold = True
            if seg.italique:
                r.italic = True
            if taille is not None:
                r.font.size = Pt(taille)
            if a_completer:
                r.font.highlight_color = WD_COLOR_INDEX.YELLOW
                r.font.color.rgb = _GREY_TXT      # lisible sur le surlignage, même en en-tête de tableau
            elif couleur is not None:
                r.font.color.rgb = couleur


def _nouvelle_numerotation(doc: Document) -> int | None:
    """Crée une instance de numérotation qui repart à 1, branchée sur la
    définition abstraite du style « List Number ». Sans cela, toutes les listes
    numérotées du document se suivent (1 à 3, puis 4 à 6…)."""
    try:
        style_ppr = doc.styles["List Number"].element.pPr
        num_id_style = style_ppr.numPr.numId.val
        numbering = doc.part.numbering_part.element
        abstract_id = None
        for num in numbering.findall(qn("w:num")):
            if int(num.get(qn("w:numId"))) == int(num_id_style):
                abstract_id = num.find(qn("w:abstractNumId")).get(qn("w:val"))
        if abstract_id is None:
            return None
        nouvel_id = max(int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))) + 1
        num = OxmlElement("w:num")
        num.set(qn("w:numId"), str(nouvel_id))
        ref = OxmlElement("w:abstractNumId")
        ref.set(qn("w:val"), abstract_id)
        num.append(ref)
        override = OxmlElement("w:lvlOverride")
        override.set(qn("w:ilvl"), "0")
        start = OxmlElement("w:startOverride")
        start.set(qn("w:val"), "1")
        override.append(start)
        num.append(override)
        numbering.append(num)
        return nouvel_id
    except (KeyError, AttributeError, ValueError):
        return None


def _rendre_liste(doc: Document, liste: md.Liste):
    num_id = _nouvelle_numerotation(doc) if liste.numerotee else None
    base = "List Number" if liste.numerotee else "List Bullet"
    for el in liste.elements:
        style = f"{base} 2" if el.profondeur else base
        p = doc.add_paragraph(style=style)
        if num_id is not None and not el.profondeur:
            p._p.get_or_add_pPr().get_or_add_numPr().get_or_add_numId().val = num_id
            p._p.pPr.numPr.get_or_add_ilvl().val = 0
        _ajouter_segments(p, el.segments)


def _texte_imprime(texte: str) -> str:
    return _PASSAGE_RE.sub(lambda m: f"À compléter : {m.group(1)}" if m.group(1) else "À compléter", texte)


def _largeurs_colonnes(tableau: md.Tableau) -> list[float]:
    """Largeurs (cm) proportionnelles au contenu, bornées : ni colonne
    écrasée, ni colonne qui mange la page."""
    n = len(tableau.entetes)
    poids = []
    minimums = []
    for j in range(n):
        textes = [tableau.entetes[j]] + [ligne[j] for ligne in tableau.lignes]
        imprimes = ["".join(_texte_imprime(s.texte) for s in segs) for segs in textes]
        # M2 (2/11) : la longueur est celle du texte IMPRIMÉ (un passage s'imprime « À compléter : X », pas « X »)
        longueur = max((len(t) for t in imprimes), default=1)
        poids.append(min(max(longueur, 6), 38))
        # Mission finale : jamais un mot coupé en deux (« À complé/ter », « Directio/n ») — la colonne est
        # au moins aussi large que son mot le plus long (borné : une adresse ou une référence très longue
        # peut, elle, passer à la ligne).
        mot = max((len(m) for t in imprimes for m in t.split()), default=1)
        minimums.append(min(mot, 16) * _CM_PAR_SIGNE + _MARGES_CELLULE_CM)
    total = sum(poids)
    largeurs = [_LARGEUR_UTILE_CM * w / total for w in poids]
    if sum(minimums) >= _LARGEUR_UTILE_CM:
        return [_LARGEUR_UTILE_CM * m / sum(minimums) for m in minimums]
    for _ in range(n):                    # relever les colonnes sous leur minimum, pris sur les autres
        manque = sum(max(m - w, 0) for w, m in zip(largeurs, minimums))
        if manque < 1e-6:
            break
        largeurs = [max(w, m) for w, m in zip(largeurs, minimums)]
        marge = [w - m for w, m in zip(largeurs, minimums)]
        dispo = sum(marge)
        largeurs = [w - manque * (mg / dispo) if dispo else w for w, mg in zip(largeurs, marge)]
    return largeurs


def _ombrer(cellule, couleur_hex: str):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), couleur_hex)
    cellule._tc.get_or_add_tcPr().append(shd)


def _trait_bas(cellule, couleur_hex: str, epaisseur: int = 8):
    """Trait sous la cellule d'en-tête (en huitièmes de point) : sépare l'en-tête sans aplat foncé."""
    tc_pr = cellule._tc.get_or_add_tcPr()
    bords = OxmlElement("w:tcBorders")
    bas = OxmlElement("w:bottom")
    for cle, val in (("w:val", "single"), ("w:sz", str(epaisseur)), ("w:space", "0"), ("w:color", couleur_hex)):
        bas.set(qn(cle), val)
    bords.append(bas)
    shd = tc_pr.find(qn("w:shd"))
    if shd is not None:
        shd.addprevious(bords)       # ordre du schéma : tcBorders avant shd
    else:
        tc_pr.append(bords)


def _rendre_tableau(doc: Document, tableau: md.Tableau):
    """Vrai tableau Word : en-tête répété sur chaque page, lignes non coupées."""
    n = len(tableau.entetes)
    if n == 0:
        return
    largeurs = _largeurs_colonnes(tableau)
    t = doc.add_table(rows=1, cols=n)
    t.style = doc.styles["Table Grid"]
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    tbl_pr = t._tbl.tblPr
    marges = OxmlElement("w:tblCellMar")
    for cote, valeur in (("top", 50), ("left", 90), ("bottom", 50), ("right", 90)):
        e = OxmlElement(f"w:{cote}")
        e.set(qn("w:w"), str(valeur))
        e.set(qn("w:type"), "dxa")
        marges.append(e)
    tbl_pr.append(marges)
    bordures = OxmlElement("w:tblBorders")
    for cote in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{cote}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "4")
        e.set(qn("w:space"), "0")
        e.set(qn("w:color"), "D1D5DB")
        bordures.append(e)
    tbl_pr.append(bordures)
    for col, largeur in zip(t.columns, largeurs):
        col.width = Cm(largeur)

    def remplir(cellule, segments, largeur, *, entete=False):
        cellule.width = Cm(largeur)
        p = cellule.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        _ajouter_segments(
            p, segments, taille=_TEXTE_TABLEAU_PT, gras=entete,
            couleur=_ENCRE if entete else None,
        )

    for j, segs in enumerate(tableau.entetes):
        cellule = t.rows[0].cells[j]
        remplir(cellule, segs, largeurs[j], entete=True)
        _ombrer(cellule, _FOND_ENTETE_TABLEAU)
        _trait_bas(cellule, _TRAIT_ENTETE)
    ligne0 = t.rows[0]._tr.get_or_add_trPr()
    ligne0.append(OxmlElement("w:cantSplit"))
    ligne0.append(OxmlElement("w:tblHeader"))
    for k, ligne in enumerate(tableau.lignes):
        row = t.add_row()
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for j, segs in enumerate(ligne):
            remplir(row.cells[j], segs, largeurs[j])
            if k % 2 == 1:
                _ombrer(row.cells[j], _FOND_LIGNE_PAIRE)
    # respiration après le tableau
    espace = doc.add_paragraph()
    espace.paragraph_format.space_after = Pt(2)


def _body(doc: Document, text: str, *, skip_map_placeholder: bool = False, niveau_base: int = 2):
    """Convertit le Markdown d'une section en styles Word natifs (titres, listes
    à puces et numérotées, gras, italique, tableaux). `niveau_base` : niveau du
    titre qui précède la section ; un `#` de l'IA descend d'un cran dessous."""
    text = _marquer_passages(text or "", retirer_marqueur_carte=skip_map_placeholder)
    for bloc in md.analyser(text):
        if isinstance(bloc, md.Titre):
            niveau = min(niveau_base + bloc.niveau, 6)
            p = doc.add_heading("", level=niveau)
            _ajouter_segments(p, bloc.segments)
        elif isinstance(bloc, md.Liste):
            _rendre_liste(doc, bloc)
        elif isinstance(bloc, md.Tableau):
            _rendre_tableau(doc, bloc)
        else:
            p = doc.add_paragraph()
            _ajouter_segments(p, bloc.segments)


def _add_map_image(doc: Document, map_image: bytes, caption: str):
    """Insert a map PNG image with a caption below it."""
    img_stream = io.BytesIO(map_image)
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p_img.add_run()
    run.add_picture(img_stream, width=Cm(15))
    p_img.paragraph_format.space_before = Pt(8)
    p_img.paragraph_format.space_after = Pt(4)

    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap = p_cap.add_run(caption)
    r_cap.font.name = "Calibri"
    r_cap.font.size = Pt(9)
    r_cap.font.italic = True
    r_cap.font.color.rgb = _GREY_META
    p_cap.paragraph_format.space_after = Pt(12)


def _ajouter_visuel(doc: Document, svg: str, png: bytes, largeur_cm: float,
                    texte_alt: str, legende: str | None = None, paysage: bool = False):
    """Pose un visuel (SVG vectoriel + PNG de repli + texte alternatif) et sa légende.
    `paysage` : le visuel occupe une page A4 paysage, puis le document revient en portrait."""
    from services.visuels.word import inserer_svg_png

    if paysage:
        _changer_orientation(doc, paysage=True)
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img.paragraph_format.space_before = Pt(8)
    p_img.paragraph_format.space_after = Pt(4)
    p_img.paragraph_format.keep_with_next = bool(legende)
    inserer_svg_png(p_img, svg, png, largeur_cm, texte_alt)
    if legende:
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_cap = p_cap.add_run(legende)
        r_cap.font.name = "Calibri"
        r_cap.font.size = Pt(9)
        r_cap.font.italic = True
        r_cap.font.color.rgb = _GREY_META
        p_cap.paragraph_format.space_after = Pt(12)
    if paysage:
        _changer_orientation(doc, paysage=False)


def _changer_orientation(doc: Document, *, paysage: bool):
    """Nouvelle section (nouvelle page) en A4 paysage ou portrait."""
    from docx.enum.section import WD_ORIENT, WD_SECTION

    s = doc.add_section(WD_SECTION.NEW_PAGE)
    portrait_l, portrait_h = Cm(21.0), Cm(29.7)
    s.orientation = WD_ORIENT.LANDSCAPE if paysage else WD_ORIENT.PORTRAIT
    s.page_width, s.page_height = (portrait_h, portrait_l) if paysage else (portrait_l, portrait_h)
    s.different_first_page_header_footer = False   # pas de « première page » sur ces sections


def _add_part(
    doc: Document,
    title: str,
    part: dict[str, Any],
    sections: list[tuple[str, str]],
    *,
    part_key: str = "",
    map_image: bytes | None = None,
    map_caption: str | None = None,
    visuels: list | None = None,
):
    from services.visuels.modele import retirer_gabarits

    part = part or {}
    # Les sections qui ont du contenu (texte ou visuel), dans l'ordre. Aucune : le titre de la partie
    # ne s'imprime pas non plus (sinon « PARTIE B » sortait seul, suivi de rien).
    a_ecrire = []
    for key, label in sections:
        text = part.get(key, "")
        ses_visuels = [v for v in (visuels or []) if v.section == (part_key, key)]
        if (text and text.strip()) or ses_visuels:
            a_ecrire.append((key, label, text, ses_visuels))
    if not a_ecrire:
        return

    _h1(doc, title)
    for key, label, text, ses_visuels in a_ecrire:
        _h2(doc, label)
        text = retirer_gabarits(text or "", ses_visuels)
        if key == "implantation" and map_image:
            _body(doc, text, skip_map_placeholder=True)
            _add_map_image(doc, map_image, map_caption or "")
        else:
            _body(doc, text)
        for v in ses_visuels:
            if v.tableau:
                from services.visuels.word import ajouter_tableau
                ajouter_tableau(doc, v.tableau, v.legende)
                continue
            try:
                png = v.png          # un visuel qui ne se rastérise pas disparaît, l'export continue
            except Exception:
                logger.warning("Visuel %s omis : PNG de repli impossible", v.section, exc_info=True)
                continue
            _ajouter_visuel(doc, v.svg, png, v.largeur_cm, v.texte_alt, v.legende, v.paysage)


# ─── Point d'entrée public ─────────────────────────────────────────────────────

def build_memoire_docx(
    content_json: dict[str, Any],
    project_name: str,
    org_name: str,
    *,
    map_image: bytes | None = None,
    map_caption: str | None = None,
    visuels: list | None = None,
    logo_image: bytes | None = None,
    lot_name: str | None = None,
    maitre_ouvrage: str | None = None,
    org_address: str | None = None,
    org_siret: str | None = None,
    objet_marche: str | None = None,
) -> bytes:
    """Retourne les bytes du .docx prêt à être streamé en réponse HTTP.
    `objet_marche` : l'objet lu dans le DCE ; il titre la page de garde, l'en-tête et les propriétés
    (sinon `project_name`, le nom de l'AO dans l'outil)."""
    titre = titre_du_marche(objet_marche, lot_name, project_name)
    doc = _setup_doc(org_name, titre)
    _poser_proprietes(doc, titre, lot_name, org_name)
    _cover_page(
        doc, titre, org_name,
        logo_image=logo_image, lot_name=lot_name, maitre_ouvrage=maitre_ouvrage,
        org_address=org_address, org_siret=org_siret,
    )

    ancre_sommaire = doc.add_paragraph()   # le sommaire prendra cette place, une fois les titres écrits

    preambule = content_json.get("preambule", "")
    if preambule and preambule.strip():
        _SECTION.set("Préambule")
        _h1(doc, "PRÉAMBULE")
        _body(doc, preambule, niveau_base=1)

    _add_part(doc, "PARTIE A — PRÉSENTATION GÉNÉRALE",       content_json.get("partie_a", {}), sections_de_la_partie(content_json, "partie_a", _PART_A), part_key="partie_a", map_image=map_image, map_caption=map_caption, visuels=visuels)
    _add_part(doc, "PARTIE B — PRÉSENTATION DE LA PRESTATION", content_json.get("partie_b", {}), sections_de_la_partie(content_json, "partie_b", _PART_B), part_key="partie_b", visuels=visuels)
    _add_part(doc, "PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE",   content_json.get("partie_c", {}), sections_de_la_partie(content_json, "partie_c", _PART_C), part_key="partie_c", visuels=visuels)

    inserer_sommaire(doc, ancre_sommaire._p)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def compter_passages_a_completer(content_json: dict[str, Any] | None, *, raison_sociale_vide: bool = False) -> int:
    """Nombre de passages « À compléter » du mémoire, SANS construire le Word (pas de carte ni de visuels :
    l'écran d'export l'appelle à chaque ouverture). Mêmes sections et même règle que l'export : le préambule
    et les sections des parties A, B, C. Seuls les « [À COMPLÉTER : … ] » sont comptés ; l'ancienne consigne
    « [📍 … ] » d'un vieux mémoire ne l'est pas (l'export la retire quand la carte est dessinée).
    `raison_sociale_vide` : la page de garde porte alors un passage « À compléter » de plus, compté ici aussi."""
    cj = content_json or {}
    textes: list[str] = []
    if isinstance(cj.get("preambule"), str):
        textes.append(cj["preambule"])
    for cle, defaut in (("partie_a", _PART_A), ("partie_b", _PART_B), ("partie_c", _PART_C)):
        partie = cj.get(cle)
        if not isinstance(partie, dict):
            continue
        for sous_cle, _ in sections_de_la_partie(cj, cle, defaut):
            if isinstance(partie.get(sous_cle), str):
                textes.append(partie[sous_cle])
    return sum(len(_A_COMPLETER_RE.findall(t)) for t in textes) + (1 if raison_sociale_vide else 0)


def build_memoire_docx_ex(*args: Any, **kwargs: Any) -> ExportDocx:
    """Comme `build_memoire_docx` (mêmes paramètres), mais renvoie aussi les
    passages « À compléter » du document (nombre et libellés, dans l'ordre),
    pour que l'écran dise « N passages à compléter avant le dépôt »."""
    collecte: list[PassageACompleter] = []
    jeton_collecte = _COLLECTE.set(collecte)
    jeton_section = _SECTION.set("")
    try:
        octets = build_memoire_docx(*args, **kwargs)
    finally:
        _COLLECTE.reset(jeton_collecte)
        _SECTION.reset(jeton_section)
    return ExportDocx(octets, collecte)


# ─── Compatibilité avec routers/export.py ──────────────────────────────────────

class DocxExporter:
    """Façade conservée pour la rétrocompatibilité avec routers/export.py."""

    def export(self, content_json: dict, organization) -> bytes:
        org_name = raison_sociale_de(organization) if organization else ""
        project_name = content_json.get("_project_name", "Projet")
        return build_memoire_docx(content_json, project_name, org_name)
