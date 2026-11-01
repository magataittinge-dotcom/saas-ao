"""Masquage RGPD avant tout envoi au modèle (CONCEPTION-memoire-entreprise.md § 6, minimisation, art. 5-1-c).

Le texte masqué est le SEUL qui part chez le fournisseur du modèle ; le texte d'origine ne quitte pas le serveur.
Sont remplacés par une étiquette :
- numéro de sécurité sociale (NIR)            -> [NIR]
- IBAN                                         -> [IBAN]
- adresses e-mail                              -> [EMAIL]
- téléphones français (fixe, mobile, +33)      -> [TELEPHONE]
- dates de naissance (« né le … », « date de naissance … ») -> [DATE_NAISSANCE]
- lignes « (Date et) lieu de naissance … », « Date de naissance … », « Naissance … » (Kbis) -> [DATE_NAISSANCE], jusqu'à
  la fin de la ligne, ou la ligne suivante quand le libellé est seul sur la sienne
- lignes « Domicile (personnel) », « Domicilié(e) à », « Demeurant », « Résidant à », « Adresse personnelle » -> le
  libellé suivi de [ADRESSE] (même règle des deux lignes) ; « Domiciliation » (celle de l'entreprise) reste lisible
Et, pour les cases qui parlent de PERSONNES (organigramme, liste du personnel, CV), en plus :
- adresses postales personnelles               -> [ADRESSE]
- civilité + nom, « Prénom NOM », « NOM Prénom » -> [NOM]
NE sont PAS masqués : le SIRET/SIREN, le numéro de TVA, le numéro de police d'assurance et le numéro de certificat
Qualibat. Ce sont ceux de l'entreprise : ils font partie du profil.

Aucune valeur masquée n'est écrite dans un journal : `comptes` ne donne que des nombres par type.
`noms` (cases « personnes » seulement) garde les mots masqués comme noms, pour écarter après coup toute réponse
du modèle qui les reprendrait.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

_MOIS = (r"janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre")
_DATE = (r"(?:\d{1,2}(?:er)?\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*(?:\d{4}|\d{2})"
         rf"|\d{{1,2}}(?:er)?\s+(?:{_MOIS})\s+\d{{4}})")

# NIR : 1 ou 2, année, mois (01-12, ou 20+ pour les cas particuliers), département (2 chiffres ou 2A/2B), commune, ordre,
# clé facultative. Bornes (?<!\d) et (?!\d) : un SIRET de 14 chiffres ne s'y reconnaît pas.
_NIR = re.compile(
    r"(?<![\dA-Za-z])[12]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}(?:\s?\d{2})?(?![\dA-Za-z])")
_IBAN = re.compile(r"(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?(?![A-Za-z0-9])")
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_TEL = re.compile(r"(?<![\d.])(?:\+33\s?\(?0?\)?|0033\s?|0)[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
# Le lieu qui suit la date (« … à Riom (63) ») est masqué avec elle, dans TOUTES les formes (revue du 2/11).
# Séparateurs admis avant le lieu : espace, virgule, tiret (« …1978, Riom », « …1978 - Riom », 2e revue du 2/11).
_LIEU = (r"(?:[^\S\n]*[,\-–—]?[^\S\n]*(?:[àa][^\S\n]+)?[A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:[ \-][A-ZÀ-Ý][\wÀ-ÿ'’\-]+)*"
         r"(?:[^\S\n]*\(\w{2,3}\))?)?")
_NAISSANCE = re.compile(
    rf"(?:\bn[ée]e?\s+(?:[àa]\s+[A-ZÀ-Ý][\wÀ-ÿ'’\- ]{{1,40}}?\s+)?le\s+{_DATE}{_LIEU}"
    rf"|\bdate\s+(?:et\s+lieu\s+)?de\s+naissance\s*[:\-]?\s*(?:le\s+)?{_DATE}{_LIEU}"
    rf"|\bnaissance\s*[:\-]?\s*(?:le\s+)?{_DATE}{_LIEU})", re.IGNORECASE)
# Kbis, statuts, procès-verbaux : l'état civil et le domicile du dirigeant tiennent sur UNE ligne (« Date et lieu de
# naissance Le 12/09/1978 à Riom (63) », « Domicile personnel 8 allée … 63200 Riom »). Ces lignes sont masquées
# jusqu'au bout, pour TOUTES les cases (la case Kbis n'est pas une case « personnes » : l'adresse du siège y reste).
# Essai réel du 2/11/2026 : ces deux lignes partaient au modèle en clair.
# Revue de sécurité du 2/11 : dans un tableau de PDF, le libellé et sa valeur tombent souvent sur DEUX lignes
# (« Date et lieu de naissance » puis « Le 12/09/1978 à Riom ») : un libellé seul sur sa ligne masque la ligne suivante.
_VALEUR_DE_LIGNE = r"[^\S\n]*[:\-–—]*[^\S\n]*(?:[^\s:\-–—][^\n]*|\n\s*[^\n]+)"
_LIEU_NAISSANCE = re.compile(
    r"\b(?:date\s+et\s+lieu\s+de\s+naissance|lieu\s+de\s+naissance|date\s+de\s+naissance|naissance)\b"
    + _VALEUR_DE_LIGNE, re.IGNORECASE)
_DOMICILE = re.compile(
    r"\b(domicile(?:\s+personnel)?|domicili[ée]e?(?:\s+(?:à|au|aux))?|demeurant(?:\s+(?:à|au|aux))?"
    r"|r[ée]sidant(?:\s+(?:à|au|aux))?|adresse\s+personnelle)\b" + _VALEUR_DE_LIGNE, re.IGNORECASE)

_VOIE = (r"rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|all[ée]e|place|route|square|quai|cours|passage|lotissement|r[ée]sidence|hameau|lieu[- ]dit")
_VILLE = r"[A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:[ \-][A-ZÀ-Ý][\wÀ-ÿ'’\-]+)*"
_ADRESSE = re.compile(
    rf"\b\d{{1,4}}\s*(?:bis|ter)?\s*,?\s+(?:{_VOIE})\s+[^\n;|\t,\d]{{2,60}}?(?=\s*(?:,|\d{{5}}|\n|;|\||\t|$))"
    rf"(?:\s*,?\s*\d{{5}}\s+{_VILLE})?",
    re.IGNORECASE)
_CODE_POSTAL_VILLE = re.compile(r"\b\d{5}\s+[A-ZÀ-Ý][A-ZÀ-Ý'’\-]{2,}(?:[ \-][A-ZÀ-Ý'’\-]{2,})*\b")

_MAJ = r"A-ZÀ-ÝŒ"
_MIN = r"a-zà-ÿœ"
_CIVILITE = re.compile(
    rf"\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)\s+[{_MAJ}][{_MAJ}{_MIN}'’\-]+(?:\s+[{_MAJ}][{_MAJ}{_MIN}'’\-]+){{0,2}}")
_PRENOM_NOM = re.compile(rf"\b[{_MAJ}][{_MIN}][{_MIN}'’\-]*\s+[{_MAJ}]{{2,}}(?:-[{_MAJ}]{{2,}})?\b")
_NOM_PRENOM = re.compile(rf"\b[{_MAJ}]{{2,}}(?:-[{_MAJ}]{{2,}})?\s+[{_MAJ}][{_MIN}][{_MIN}'’\-]*\b")

# Mots du métier qui ressemblent à un nom dans ces motifs (« Chef CHANTIER », « MAÇON Qualifié ») : jamais gardés
# comme noms à écarter.
_MOTS_DU_METIER = frozenset("""
chef equipe chantier chantiers conducteur conducteurs travaux macon macons ouvrier ouvriers compagnon compagnons
apprenti apprentis directeur directrice gerant gerante president presidente responsable assistant assistante
secretaire comptable administratif administration technicien technicienne ingenieur metreur dessinateur charpentier
couvreur plombier electricien peintre carreleur menuisier platrier facadier ravaleur grutier cariste magasinier
qualite securite environnement encadrement personnel effectif effectifs organigramme direction service
hse sst caces habilitation habilitations certificat formation diplome experience annees ans poste
ppsps dpgf dce ccap cctp
""".split())

# Sigles administratifs : un motif qui en contient un (« RCS Reims », « Certificat RGE ») n'est jamais un nom.
_SIGLES_ADMINISTRATIFS = frozenset("rge rcs rm siret siren tva sarl sas sasu eurl sci btp qualibat qualifelec iso mase naf ape".split())


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texte.lower()) if not unicodedata.combining(c))


def _iban_valide(brut: str) -> bool:
    """Un IBAN français est masqué sans autre test ; tout autre pays doit passer la clé (modulo 97) : un numéro de
    police du type « AB12 3456 7890 1234 » n'est pas pris pour un IBAN."""
    compact = re.sub(r"\s", "", brut)
    if compact.startswith("FR") and len(compact) == 27:
        return True
    if not 15 <= len(compact) <= 34:
        return False
    rearrange = compact[4:] + compact[:4]
    nombre = "".join(str(int(c, 36)) for c in rearrange)
    return int(nombre) % 97 == 1


_ESPACES_SPECIAUX = str.maketrans({"\u00a0": " ", "\u202f": " ", "\u2007": " ", "\u2009": " "})


@dataclass
class TexteMasque:
    texte: str
    comptes: dict = field(default_factory=dict)       # type -> nombre de remplacements (jamais les valeurs)
    noms: frozenset = frozenset()                      # mots masqués comme noms (cases « personnes »)


def masquer(texte: str, personnes: bool = False) -> TexteMasque:
    """`texte` -> texte masqué + comptes. `personnes=True` : cases qui parlent de salariés (masquage renforcé)."""
    comptes: dict = {}
    noms: set = set()

    def remplacer(motif: re.Pattern, etiquette: str, texte: str, accepte=None, garde_noms: bool = False) -> str:
        def _sub(m: re.Match) -> str:
            if accepte is not None and not accepte(m.group(0)):
                return m.group(0)
            comptes[etiquette] = comptes.get(etiquette, 0) + 1
            if garde_noms:
                for mot in re.findall(rf"[{_MAJ}{_MIN}]{{2,}}", m.group(0)):
                    brut = _sans_accents(mot)
                    if len(brut) >= 3 and brut not in _MOTS_DU_METIER and brut not in ("mme", "mlle", "monsieur", "madame", "mademoiselle"):
                        noms.add(brut)
            return f"[{etiquette}]"
        return motif.sub(_sub, texte)

    # Espaces insécables et retours chariot ramenés à l'espace et au saut de ligne avant tout motif : un « :\u00a0» ou
    # un « \r\n » ne doit jamais faire manquer un libellé (2e revue de sécurité du 2/11).
    t = (texte or "").replace("\r\n", "\n").replace("\r", "\n").translate(_ESPACES_SPECIAUX)
    t = remplacer(_IBAN, "IBAN", t, accepte=_iban_valide)
    t = remplacer(_EMAIL, "EMAIL", t)
    t = remplacer(_NAISSANCE, "DATE_NAISSANCE", t)          # d'abord la date seule (« né le …, 12 ans d'expérience »)
    t = remplacer(_LIEU_NAISSANCE, "DATE_NAISSANCE", t)     # puis ce qui reste d'un libellé (lieu seul, valeur à la ligne)
    t = _DOMICILE.sub(lambda m: _compter(comptes, "ADRESSE", f"{m.group(1)} [ADRESSE]"), t)
    t = remplacer(_NIR, "NIR", t)
    t = remplacer(_TEL, "TELEPHONE", t)
    if personnes:
        t = remplacer(_ADRESSE, "ADRESSE", t)
        t = remplacer(_CODE_POSTAL_VILLE, "ADRESSE", t)
        t = remplacer(_CIVILITE, "NOM", t, garde_noms=True)
        t = remplacer(_PRENOM_NOM, "NOM", t, accepte=_pas_un_intitule, garde_noms=True)
        t = remplacer(_NOM_PRENOM, "NOM", t, accepte=_pas_un_intitule, garde_noms=True)
    return TexteMasque(t, comptes, frozenset(noms))


def _compter(comptes: dict, etiquette: str, remplacement: str) -> str:
    comptes[etiquette] = comptes.get(etiquette, 0) + 1
    return remplacement


def _pas_un_intitule(morceau: str) -> bool:
    """« Chef CHANTIER », « Responsable QUALITE » : deux mots du métier ne sont pas un nom de personne."""
    mots = [_sans_accents(m) for m in re.findall(rf"[{_MAJ}{_MIN}][{_MAJ}{_MIN}'’\-]+", morceau)]
    if any(m in _SIGLES_ADMINISTRATIFS for m in mots):
        return False
    return not all(m in _MOTS_DU_METIER for m in mots)
