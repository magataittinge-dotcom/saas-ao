"""A4 — synchronisation BOAMP (API simulée par un MockTransport httpx : aucun appel réseau)."""
import json
from datetime import date, datetime, timedelta

import httpx
import pytest

from services.veille import boamp_sync
from services.veille.boamp_sync import ClientBoamp, ErreurBoamp, convertir, synchroniser

AUJOURDHUI = date(2026, 10, 31)


def _donnees_fns(cpv=("45261210",), url="https://profil.example.test/dce/1"):
    return json.dumps({"FNSimple": {"initial": {
        "communication": {"urlDocConsul": url},
        "lots": {"lot": [{"codeCPV": {"objetPrincipal": {"classPrincipale": c}}} for c in cpv]},
    }}})


def _donnees_eforms(cpv="45331000"):
    return json.dumps({"EFORMS": {"ContractNotice": {"cac:ProcurementProject": {
        "cac:MainCommodityClassification": {"cbc:ItemClassificationCode": {"@listName": "cpv", "#text": cpv}}}}}})


def enreg(idweb="26-900001", **kw):
    base = {
        "idweb": idweb, "objet": "Réfection de la toiture de l&#039;école Exemple",
        "nomacheteur": "COMMUNE D&#039;EXEMPLE", "code_departement": ["44", "49"],
        "dateparution": "2026-10-30", "datelimitereponse": "2026-11-23T17:00:00+00:00",
        "famille": "FNS", "nature": "APPEL_OFFRE", "etat": "INITIAL", "type_procedure": "OUVERT",
        "procedure_libelle": "Procédure Ouverte", "type_marche": ["TRAVAUX"],
        "descripteur_code": ["74", "33"], "descripteur_libelle": ["Couverture", "Bâtiment"],
        "url_avis": f"https://www.boamp.fr/pages/avis/?q=idweb:{idweb}", "annonce_lie": None,
        "donnees": _donnees_fns(),
    }
    base.update(kw)
    return base


def faux_boamp(par_jour, requetes=None, echecs=()):
    """Transport simulé : `par_jour` = {date ISO: [enregistrements]} ; `echecs` = codes à renvoyer d'abord."""
    restants = list(echecs)

    def repondre(requete: httpx.Request) -> httpx.Response:
        if requetes is not None:
            requetes.append(requete)
        if restants:
            code = restants.pop(0)
            return httpx.Response(code, headers={"retry-after": "1"} if code == 429 else {}, json={"error_code": "x"})
        params = requete.url.params
        jour = params["where"].split("dateparution=date'")[1][:10]
        liste = par_jour.get(jour, [])
        debut, taille = int(params["offset"]), int(params["limit"])
        return httpx.Response(200, json={"total_count": len(liste), "results": liste[debut:debut + taille]})
    return httpx.MockTransport(repondre)


def client(par_jour, requetes=None, echecs=(), pauses=None):
    return ClientBoamp(transport=faux_boamp(par_jour, requetes, echecs),
                       attente=(pauses.append if pauses is not None else (lambda s: None)))


@pytest.fixture(autouse=True)
def _table_vide(db_session):
    from models.avis_veille import AvisVeille
    db_session.query(AvisVeille).delete()
    db_session.commit()
    yield


def _lignes(db):
    from models.avis_veille import AvisVeille
    db.expire_all()
    return db.query(AvisVeille).order_by(AvisVeille.id_boamp).all()


def test_synchronisation_rejouee_deux_fois_donne_le_meme_nombre_de_lignes(db_session):
    jours = {"2026-10-30": [enreg("26-900001"), enreg("26-900002", objet="Plomberie du gymnase", descripteur_code=["270"])]}
    premier = synchroniser(db_session, client(jours), aujourdhui=AUJOURDHUI)
    assert (premier.crees, premier.mis_a_jour) == (2, 0)
    second = synchroniser(db_session, client(jours), aujourdhui=AUJOURDHUI)
    assert (second.crees, second.mis_a_jour) == (0, 2)
    assert len(_lignes(db_session)) == 2


def test_les_champs_sont_decodes_et_normalises(db_session):
    jours = {"2026-10-30": [enreg(code_departement=["6", "20A", "977"], type_procedure="PROCEDURE_ADAPTE")]}
    synchroniser(db_session, client(jours), aujourdhui=AUJOURDHUI)
    (ligne,) = _lignes(db_session)
    assert ligne.objet == "Réfection de la toiture de l'école Exemple"      # entités HTML décodées
    assert ligne.acheteur == "COMMUNE D'EXEMPLE"
    assert ligne.departements == ["06", "2A"]                                # « 6 » → 06, « 20A » → 2A, 977 écarté
    assert ligne.procedure == "adaptee" and ligne.procedure_libelle == "Procédure Ouverte"
    assert ligne.date_limite == date(2026, 11, 23) and ligne.date_parution == date(2026, 10, 30)
    assert ligne.codes_cpv == ["45261210"] and ligne.metiers == ["couverture"]
    assert ligne.descripteurs[0] == {"code": "74", "libelle": "Couverture"}
    assert ligne.url_dossier == "https://profil.example.test/dce/1"
    assert ligne.url_avis.endswith("idweb:26-900001")


def test_un_avis_dont_la_date_limite_est_passee_disparait(db_session):
    from models.avis_veille import AvisVeille
    db_session.add(AvisVeille(id_boamp="26-000999", objet="Avis inventé périmé", acheteur="Commune inventée",
                              departements=["75"], date_parution=date(2026, 9, 1), date_limite=AUJOURDHUI - timedelta(days=1),
                              url_avis="https://www.boamp.fr/pages/avis/?q=idweb:26-000999"))
    db_session.add(AvisVeille(id_boamp="26-000998", objet="Avis inventé ouvert aujourd'hui", acheteur="Commune inventée",
                              departements=["75"], date_parution=date(2026, 10, 1), date_limite=AUJOURDHUI,
                              url_avis="https://www.boamp.fr/pages/avis/?q=idweb:26-000998"))
    db_session.commit()
    resultat = synchroniser(db_session, client({}), aujourdhui=AUJOURDHUI)
    assert resultat.supprimes_expires == 1
    assert [l.id_boamp for l in _lignes(db_session)] == ["26-000998"]


def test_une_attribution_est_ignoree(db_session):
    jours = {"2026-10-30": [enreg("26-900010", nature="ATTRIBUTION"), enreg("26-900011", nature="RECTIFICATIF"),
                            enreg("26-900012")]}
    resultat = synchroniser(db_session, client(jours), aujourdhui=AUJOURDHUI)
    assert [l.id_boamp for l in _lignes(db_session)] == ["26-900012"]
    assert resultat.ignores == 2


def test_la_requete_ne_demande_que_les_avis_de_marche_de_travaux_a_date_limite_a_venir(db_session):
    requetes = []
    synchroniser(db_session, client({}, requetes), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    assert len(requetes) == 2                                                # 30 et 31 octobre
    where = requetes[0].url.params["where"]
    assert "nature='APPEL_OFFRE'" in where and "ATTRIBUTION" not in where
    assert "datelimitereponse>=date'2026-10-31'" in where and "type_marche='TRAVAUX'" in where
    assert requetes[0].headers["user-agent"] == "Synorix/veille"
    assert requetes[0].url.params["limit"] == "100"


def test_une_429_est_reprise_en_respectant_retry_after(db_session):
    pauses = []
    jours = {"2026-10-30": [enreg()]}
    resultat = synchroniser(db_session, client(jours, echecs=[429, 503], pauses=pauses),
                            depuis=date(2026, 10, 30), aujourdhui=date(2026, 10, 30))
    assert resultat.crees == 1
    assert pauses == [1.0, 4.0]          # 429 : Retry-After respecté ; 503 sans en-tête : attente croissante (2 s, 4 s)


def test_trois_echecs_levent_une_erreur_claire_sans_ligne_partielle(db_session):
    with pytest.raises(ErreurBoamp):
        synchroniser(db_session, client({}, echecs=[429, 429, 429]), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    assert _lignes(db_session) == []


def test_erreur_http_definitive_n_est_pas_reprise(db_session):
    requetes = []
    with pytest.raises(ErreurBoamp):
        synchroniser(db_session, client({}, requetes, echecs=[400]), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    assert len(requetes) == 1


def test_pagination_au_dela_de_100_avis(db_session):
    jours = {"2026-10-30": [enreg(f"26-9{n:05d}") for n in range(130)]}
    requetes = []
    resultat = synchroniser(db_session, client(jours, requetes), depuis=date(2026, 10, 30), aujourdhui=date(2026, 10, 30))
    assert resultat.crees == 130 and len(_lignes(db_session)) == 130
    assert [r.url.params["offset"] for r in requetes] == ["0", "100"]


def test_premier_passage_remonte_a_45_jours_puis_reprend_au_dernier_passage(db_session):
    requetes = []
    synchroniser(db_session, client({}, requetes), aujourdhui=AUJOURDHUI)
    assert len(requetes) == 46
    assert "dateparution=date'2026-09-16'" in requetes[0].url.params["where"]

    from models.avis_veille import AvisVeille
    db_session.add(AvisVeille(id_boamp="26-000500", objet="o", acheteur="a", departements=["75"],
                              date_parution=date(2026, 10, 28), date_limite=date(2026, 12, 1), url_avis="u",
                              synchronise_at=datetime(2026, 10, 29, 6, 0)))
    db_session.commit()
    requetes.clear()
    synchroniser(db_session, client({}, requetes), aujourdhui=AUJOURDHUI)
    assert "dateparution=date'2026-10-28'" in requetes[0].url.params["where"]      # J-1 de chevauchement
    assert len(requetes) == 4


def test_un_avis_corrige_remplace_la_ligne_de_l_avis_d_origine(db_session):
    synchroniser(db_session, client({"2026-10-29": [enreg("26-900100", datelimitereponse="2026-11-10T12:00:00+00:00")]}),
                 depuis=date(2026, 10, 29), aujourdhui=AUJOURDHUI)
    corrige = enreg("26-900150", etat="RECTIFICATIF", annonce_lie=["26-900100"], dateparution="2026-10-30",
                    datelimitereponse="2026-11-20T12:00:00+00:00")
    synchroniser(db_session, client({"2026-10-30": [corrige]}), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    (ligne,) = _lignes(db_session)
    assert ligne.id_boamp == "26-900150" and ligne.date_limite == date(2026, 11, 20)


def test_rejouer_une_fenetre_avec_avis_d_origine_et_avis_corrige_ne_cree_pas_de_doublon(db_session):
    # L'API garde l'avis d'origine ET l'avis corrigé : une fenêtre qui les relit tous deux ne doit ni
    # recréer l'origine, ni écraser le corrigé par l'origine.
    jours = {
        "2026-10-29": [enreg("26-900100", datelimitereponse="2026-11-10T12:00:00+00:00", objet="Version d'origine")],
        "2026-10-30": [enreg("26-900150", etat="RECTIFICATIF", annonce_lie=["26-900100"], dateparution="2026-10-30",
                             datelimitereponse="2026-11-20T12:00:00+00:00", objet="Version corrigée")],
    }
    for _ in range(3):
        synchroniser(db_session, client(jours), depuis=date(2026, 10, 29), aujourdhui=AUJOURDHUI)
        (ligne,) = _lignes(db_session)
        assert (ligne.id_boamp, ligne.objet, ligne.date_limite) == ("26-900150", "Version corrigée", date(2026, 11, 20))
        assert set(ligne.ids_lies) == {"26-900100", "26-900150"}
    # un second correctif pointant l'avis corrigé (et non l'origine) trouve toujours la même ligne
    jours["2026-10-31"] = [enreg("26-900190", etat="RECTIFICATIF", annonce_lie=["26-900150"], dateparution="2026-10-31",
                                 datelimitereponse="2026-11-25T12:00:00+00:00", objet="Deuxième correctif")]
    synchroniser(db_session, client(jours), depuis=date(2026, 10, 29), aujourdhui=AUJOURDHUI)
    (ligne,) = _lignes(db_session)
    assert (ligne.id_boamp, ligne.date_limite) == ("26-900190", date(2026, 11, 25))


def test_avis_sans_date_limite_ou_sans_departement_valide_ou_hors_travaux_ignores(db_session):
    jours = {"2026-10-30": [
        enreg("26-900201", datelimitereponse=None),
        enreg("26-900202", code_departement=["99"]),
        enreg("26-900203", type_marche=["SERVICES"]),
        enreg("26-900204", datelimitereponse="2026-10-30T10:00:00+00:00"),                 # échue
        enreg("26-900205", type_marche=None, donnees="{}", descripteur_code=[], objet="Fourniture de papier"),
        enreg("26-900206", type_marche=None, donnees=_donnees_fns(("45330000",)), descripteur_code=[]),
    ]}
    synchroniser(db_session, client(jours), aujourdhui=AUJOURDHUI)
    assert [l.id_boamp for l in _lignes(db_session)] == ["26-900206"]          # type absent mais CPV 45 → gardé


def test_cpv_eforms_et_url_dossier_eforms(db_session):
    donnees = json.dumps({"EFORMS": {"ContractNotice": {
        "cac:ProcurementProjectLot": {"cac:TenderingTerms": {"cac:CallForTendersDocumentReference": {"cac:Attachment": {
            "cac:ExternalReference": {"cbc:URI": "https://profil.example.test/consult/9"}}}}},
        "cac:ProcurementProject": {"cac:MainCommodityClassification": {"cbc:ItemClassificationCode": {"@listName": "cpv", "#text": "45331000"}},
                                   "cac:AdditionalCommodityClassification": [{"cbc:ItemClassificationCode": {"@listName": "cpv", "#text": "45310000"}}]}}}})
    champs = convertir(enreg("26-900300", famille="JOUE", donnees=donnees, descripteur_code=[]), AUJOURDHUI)
    assert champs["codes_cpv"] == ["45331000", "45310000"]
    assert champs["url_dossier"] == "https://profil.example.test/consult/9"
    assert champs["metiers"] == ["cvc", "electricite"]


def test_avis_mapa_sans_cpv_ni_dossier(db_session):
    champs = convertir(enreg("26-900301", famille="MAPA", donnees=json.dumps({"MAPA": {"organisme": {"urlProfilAcheteur": "https://x.example"}}}),
                             descripteur_code=["270"], descripteur_libelle=["Plomberie (travaux)"]), AUJOURDHUI)
    assert champs["codes_cpv"] == [] and champs["url_dossier"] is None and champs["metiers"] == ["plomberie"]


def test_simulation_ne_ecrit_rien_mais_compte(db_session):
    from models.avis_veille import AvisVeille
    db_session.add(AvisVeille(id_boamp="26-000777", objet="o", acheteur="a", departements=["75"], date_parution=date(2026, 9, 1),
                              date_limite=AUJOURDHUI - timedelta(days=2), url_avis="u"))
    db_session.commit()
    resultat = synchroniser(db_session, client({"2026-10-30": [enreg()]}), depuis=date(2026, 10, 30),
                            aujourdhui=AUJOURDHUI, simulation=True)
    assert (resultat.crees, resultat.supprimes_expires, resultat.simulation) == (1, 1, True)
    assert [l.id_boamp for l in _lignes(db_session)] == ["26-000777"]


def test_limite_borne_le_nombre_d_avis_retenus(db_session):
    jours = {"2026-10-30": [enreg(f"26-9{n:05d}") for n in range(10)]}
    resultat = synchroniser(db_session, client(jours), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI, limite=3)
    assert resultat.retenus == 3 and len(_lignes(db_session)) == 3


def test_le_cache_des_comptes_est_invalide_apres_une_synchronisation(db_session):
    from services.cache import org_cache
    org_cache.set("veille:comptes:test", {"x": 1}, ttl=900)
    synchroniser(db_session, client({}), depuis=date(2026, 10, 31), aujourdhui=AUJOURDHUI)
    assert org_cache.get("veille:comptes:test") is None


def test_une_ligne_deja_connue_est_mise_a_jour_sans_doublon_si_la_date_limite_change(db_session):
    synchroniser(db_session, client({"2026-10-30": [enreg()]}), depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    synchroniser(db_session, client({"2026-10-30": [enreg(datelimitereponse="2026-12-01T10:00:00+00:00")]}),
                 depuis=date(2026, 10, 30), aujourdhui=AUJOURDHUI)
    (ligne,) = _lignes(db_session)
    assert ligne.date_limite == date(2026, 12, 1)
