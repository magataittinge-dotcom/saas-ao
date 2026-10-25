"""T3 (plan H §2.6) — resolve_pages cherche la page avec une sonde en « flux
alphanumérique » : NFKD, sans accents, minuscules, lettres et chiffres seulement.

Les écarts de blancs et de ponctuation entre lecteurs PDF ne font plus perdre
la page d'un extrait : « 1 - l’état » contre « 1- l’état », mots collés,
trait d'union de fin de ligne.
La sonde normalisée garde la priorité : plus précise, elle départage deux
passages presque identiques ; le flux ne sert que si elle ne trouve rien.

Les pages sont confiées au cache de l'ancrage (retenir_pages), comme au dépôt :
aucun lecteur PDF n'intervient ici. Chaînes inventées.
"""
import services.ai.excerpt_anchor as ea


def _piece(tmp_path, pages, nom="ccap.pdf"):
    """Un fichier réel (l'empreinte du cache en a besoin) dont les pages lues
    sont déjà dans le cache, comme après l'extraction du dépôt."""
    chemin = tmp_path / nom
    chemin.write_bytes(b"%PDF-1.4 pages fournies par le cache")
    ea.retenir_pages(str(chemin), pages)
    return {nom: str(chemin)}


def _exigence(extrait, page, nom="ccap.pdf"):
    return [{"source_document": nom, "source_page": page, "source_excerpt": extrait}]


def test_flux_alphanumerique():
    assert ea._flux("1 - L’Acte d’Engagement (AE)") == "1lactedengagementae"
    # accents, ligature « ﬁ », tiret long et blancs multiples
    assert ea._flux("Spécifications  techniques — ﬁches n° 3") == "specificationstechniquesfichesn3"
    assert ea._flux(" \n\t—…«»’") == ""


def test_extrait_1_tiret_trouve_sur_une_page_1tiret(tmp_path):
    """§4.4 n° 6 : l'extrait « 1 - l’état d’avancement » se trouve sur une page
    qui contient « 1- l’état d’avancement »."""
    chemins = _piece(tmp_path, [
        "Cahier des clauses administratives particulières\nSommaire\n",
        "ARTICLE 7 – DOCUMENTS DE SUIVI\n1- l’état d’avancement (EA) et ses planches ;\n",
    ])
    reqs = _exigence("1 - l’état d’avancement", page=1)
    assert ea.resolve_pages(reqs, chemins) == 1
    assert reqs[0]["source_page"] == 2


def test_mots_colles_et_trait_d_union_de_fin_de_ligne(tmp_path):
    chemins = _piece(tmp_path, [
        "Page de garde\n",
        "",   # page vide : comptée, le numéro reste exact
        "Les supports reçoivent deux couchesde peinture de finition satinée.\n",
        "Le coffret est livré avec son socle ; celui-\nci est scellé au sol.\n",
    ])
    reqs = (_exigence("Les supports reçoivent deux couches de peinture de finition satinée", page=1)
            + _exigence("celui-ci est scellé au sol", page=1))
    assert ea.resolve_pages(reqs, chemins) == 2
    assert [r["source_page"] for r in reqs] == [3, 4]


def test_la_sonde_normalisee_garde_la_priorite(tmp_path):
    """Deux passages de même flux : la page qui porte le texte exact gagne, même
    si l'autre vient avant (cas réel du CCTP lot 05 de Gueux, « ; » contre « - »)."""
    chemins = _piece(tmp_path, [
        "Sommaire\n",
        "Fourniture et pose des fixations du garde-corps - réglage en usine des platines.\n",
        "Annexe\n",
        "Fourniture et pose des fixations du garde-corps ; réglage sur site des platines.\n",
    ])
    reqs = _exigence("Fourniture et pose des fixations du garde-corps ; réglage", page=1)
    assert ea.resolve_pages(reqs, chemins) == 1
    assert reqs[0]["source_page"] == 4


def test_casse_accents_et_ligatures_toujours_reconnus(tmp_path):
    chemins = _piece(tmp_path, ["Sommaire\n", "LES SPÉCIFICATIONS TECHNIQUES DU LOT 02\n"])
    reqs = _exigence("Les spéciﬁcations techniques du lot 02", page=None)
    ea.resolve_pages(reqs, chemins)
    assert reqs[0]["source_page"] == 2


def test_la_page_indiquee_est_gardee_quand_elle_contient_l_extrait(tmp_path):
    """Texte répété sur deux pages, trouvé seulement en flux : la page donnée
    par l'IA le contient, on n'y touche pas."""
    texte = "1- l’état d’avancement (EA) et ses planches ;\n"
    chemins = _piece(tmp_path, ["Sommaire\n", texte, "Annexe\n", texte])
    reqs = _exigence("1 - l’état d’avancement (EA) et ses planches", page=4)
    assert ea.resolve_pages(reqs, chemins) == 0
    assert reqs[0]["source_page"] == 4


def test_longueur_minimale_de_la_sonde(tmp_path):
    """12 lettres et chiffres au moins : « ARTICLE 12 – … » (9) ne désigne pas
    une page ; « Escalier béton » (13) est cherché, alors que l'ancienne sonde
    (14 caractères normalisés, moins de 15) gardait une page non vérifiée."""
    chemins = _piece(tmp_path, ["Page de garde\n", "ARTICLE 12 – Délais\n", "02 Gros œuvre – Escalier béton\n"])
    reqs = _exigence("ARTICLE 12 – …", page=1) + _exigence("Escalier béton", page=1)
    assert ea.resolve_pages(reqs, chemins) == 1
    assert [r["source_page"] for r in reqs] == [1, 3]


def test_extrait_absent_page_inchangee(tmp_path):
    chemins = _piece(tmp_path, ["Sommaire\n", "Le marché est passé à prix global et forfaitaire.\n"])
    reqs = _exigence("Les variantes sont autorisées pour le lot 05", page=2)
    assert ea.resolve_pages(reqs, chemins) == 0
    assert reqs[0]["source_page"] == 2
