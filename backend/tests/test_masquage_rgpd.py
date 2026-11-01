"""Masquage RGPD avant envoi au modèle : chaque motif est testé un par un, et ce qui NE doit PAS être masqué aussi
(SIRET, TVA, numéro de police, numéro de certificat). Toutes les valeurs sont inventées."""
import pytest

from services.masquage_rgpd import masquer


def _m(texte, personnes=False):
    return masquer(texte, personnes=personnes)


# ── ce qui est masqué ───────────────────────────────────────────────────────

@pytest.mark.parametrize("brut", ["1 85 05 78 006 084 36", "185057800608436", "2 99 12 2A 004 123 45", "1850578006084"])
def test_nir(brut):
    r = _m(f"Numéro de sécurité sociale : {brut}")
    assert "[NIR]" in r.texte and brut not in r.texte and r.comptes == {"NIR": 1}


@pytest.mark.parametrize("brut", ["FR76 3000 6000 0112 3456 7890 189", "FR7630006000011234567890189",
                                  "BE68 5390 0754 7034", "DE89 3704 0044 0532 0130 00"])
def test_iban(brut):
    r = _m(f"IBAN : {brut} merci")
    assert "[IBAN]" in r.texte and brut not in r.texte


@pytest.mark.parametrize("brut", ["jean.dupont@exemple.fr", "contact+chantier@lambert-maconnerie.com"])
def test_email(brut):
    r = _m(f"Écrire à {brut}.")
    assert r.texte == "Écrire à [EMAIL]." and r.comptes == {"EMAIL": 1}


@pytest.mark.parametrize("brut", ["03 26 00 00 00", "03.26.00.00.00", "0326000000", "06 12 34 56 78", "+33 6 12 34 56 78",
                                  "+33 (0)6 12 34 56 78", "0033 612345678", "06-12-34-56-78"])
def test_telephone(brut):
    r = _m(f"Tél. {brut} (bureau)")
    assert "[TELEPHONE]" in r.texte and brut not in r.texte and r.comptes == {"TELEPHONE": 1}


@pytest.mark.parametrize("texte", [
    "né le 12/05/1980", "Née le 3 mars 1975", "date de naissance : 12.05.1980", "Date de naissance 01/02/85",
    "né à Reims le 12 mai 1980",
])
def test_date_de_naissance(texte):
    r = _m(f"Chef de chantier, {texte}, 12 ans d'expérience")
    assert "[DATE_NAISSANCE]" in r.texte and "1980" not in r.texte and "1975" not in r.texte and "85" not in r.texte.split("]")[0]
    assert "12 ans d'expérience" in r.texte


def test_une_date_ordinaire_n_est_pas_une_naissance():
    r = _m("Attestation valable du 01/01/2026 au 31/12/2026, établie le 12 octobre 2026")
    assert r.texte == "Attestation valable du 01/01/2026 au 31/12/2026, établie le 12 octobre 2026"


# ── cases « personnes » : adresses et noms ──────────────────────────────────

def test_adresse_personnelle_seulement_dans_les_cases_personnes():
    texte = "Habite 12 rue des Lilas, 51100 Reims\nSiège : 12 avenue du Port 51100 REIMS"
    sans = _m(texte, personnes=False)
    assert "12 rue des Lilas" in sans.texte           # une Kbis garde l'adresse du siège
    avec = _m(texte, personnes=True)
    assert "[ADRESSE]" in avec.texte and "rue des Lilas" not in avec.texte and "avenue du Port" not in avec.texte


@pytest.mark.parametrize("brut,mots", [
    ("Mme Martin", {"martin"}), ("M. Pierre Durand", {"pierre", "durand"}), ("Jean DUPONT", {"jean", "dupont"}),
    ("MARTIN Camille", {"martin", "camille"}), ("Anne-Sophie LEROY-BLANC", {"leroy"}),
])
def test_noms_dans_les_cases_personnes(brut, mots):
    r = _m(f"{brut}, maçon", personnes=True)
    assert "[NOM]" in r.texte and brut not in r.texte and "maçon" in r.texte
    assert mots <= set(r.noms) | {m for m in mots if len(m) < 3}


def test_pas_de_nom_masque_hors_des_cases_personnes():
    assert _m("Président : Camille MARTIN").texte == "Président : Camille MARTIN"


def test_les_intitules_de_poste_ne_sont_pas_pris_pour_des_noms():
    r = _m("Chef CHANTIER\nResponsable QUALITE\nConducteur de Travaux", personnes=True)
    assert "[NOM]" not in r.texte and r.noms == frozenset()


# ── ce qui NE doit PAS être masqué ──────────────────────────────────────────

@pytest.mark.parametrize("texte", [
    "SIRET 123 456 789 00011", "SIRET : 12345678900011", "SIREN 123 456 789", "SIRET 012 345 678 00012",
    "SIRET 01234567800012", "Numéro de TVA FR12 123456789", "TVA intracommunautaire : FR 12 123 456 789",
    "Contrat numéro BAT-2026-00457", "Police n° AB12 3456 7890 1234", "N° de police : 2026 0045 6789",
    "Qualibat n° 12345 - certificat 2026-0456", "Certificat RGE E-E123456", "RCS Reims B 123 456 789",
])
def test_les_numeros_de_l_entreprise_ne_sont_pas_masques(texte):
    for personnes in (False, True):
        r = _m(texte, personnes=personnes)
        assert r.texte == texte and r.comptes == {}, (texte, r.texte)


def test_les_journaux_ne_recoivent_que_des_nombres():
    r = _m("jean@exemple.fr 06 12 34 56 78", personnes=True)
    assert r.comptes == {"EMAIL": 1, "TELEPHONE": 1}
    assert "jean" not in str(r.comptes)


# ── Kbis : l'état civil et le domicile du dirigeant (essai réel du 2/11, décision 9) ────────────────────────────
# Sur un vrai Kbis, la ligne « Date et lieu de naissance Le 12/09/1978 à Riom (63) » et la ligne « Domicile
# personnel … » partaient au modèle en clair : la case Kbis n'est pas une case « personnes » (l'adresse du siège
# doit rester lisible). Valeurs inventées.

KBIS_GERANT = """Adresse du siège 14 rue des Essais Imaginaires 63000 Clermont-Ferrand
Gérant
Nom, prénoms DUMONTEIL Arnaud Pierre
Date et lieu de naissance Le 12/09/1978 à Riom (63)
Nationalité Française
Domicile personnel 8 allée des Volcans Inventés 63200 Riom
Adresse de l'établissement 14 rue des Essais Imaginaires 63000 Clermont-Ferrand"""


def test_kbis_date_et_lieu_de_naissance_du_dirigeant_masques():
    r = _m(KBIS_GERANT)
    assert "12/09/1978" not in r.texte and "Riom (63)" not in r.texte
    assert "[DATE_NAISSANCE]" in r.texte


def test_kbis_domicile_personnel_du_dirigeant_masque_mais_pas_le_siege():
    r = _m(KBIS_GERANT)
    assert "Volcans" not in r.texte and "63200" not in r.texte
    assert "Domicile personnel [ADRESSE]" in r.texte
    assert r.texte.count("14 rue des Essais Imaginaires 63000 Clermont-Ferrand") == 2      # siège et établissement


@pytest.mark.parametrize("ligne", ["Né le 3 mars 1980 à Lyon", "Date de naissance : 03/03/1980",
                                   "Lieu de naissance : Lyon (69)", "Naissance le 03/03/1980",
                                   "Demeurant 3 chemin des Exemples 69000 Lyon"])
def test_autres_formes_d_etat_civil_masquees(ligne):
    r = _m(ligne)
    assert "1980" not in r.texte and "Lyon" not in r.texte and "Exemples" not in r.texte


# ── revue de sécurité du 2/11 : libellé et valeur sur deux lignes (tableaux de PDF), lieu après toutes les formes,
#    « domicilié », « adresse personnelle ». Valeurs inventées.

@pytest.mark.parametrize("texte", [
    "Date et lieu de naissance\nLe 12/09/1978 à Riom (63)",
    "Lieu de naissance :\nRiom (63)",
    "Date de naissance : 12/09/1978 à Riom (63)",
    "Date de naissance\n12/09/1978 à Riom",
    "Naissance le 12/09/1978 à Riom",
])
def test_etat_civil_sur_deux_lignes_ou_avec_lieu_masque(texte):
    r = _m(texte)
    assert "1978" not in r.texte and "Riom" not in r.texte and "[DATE_NAISSANCE]" in r.texte


@pytest.mark.parametrize("texte", [
    "Domicilié à 8 allée des Volcans Inventés 63200 Riom",
    "domiciliée au 8 allée des Volcans Inventés 63200 Riom",
    "Adresse personnelle : 8 allée des Volcans Inventés 63200 Riom",
    "Domicile personnel\n8 allée des Volcans Inventés 63200 Riom",
])
def test_domicile_formes_voisines_et_sur_deux_lignes_masque(texte):
    r = _m(texte)
    assert "Volcans" not in r.texte and "63200" not in r.texte and "[ADRESSE]" in r.texte


def test_domiciliation_de_l_entreprise_non_masquee():
    r = _m("Domiciliation : 14 rue des Essais Imaginaires 63000 Clermont-Ferrand")
    assert "14 rue des Essais Imaginaires" in r.texte
