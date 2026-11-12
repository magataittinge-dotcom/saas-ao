"""Q-04 / S-18 — le cloisonnement entre organisations, verrouillé par un test qui balaie TOUTES les routes.

Le test parcourt les routes réelles de l'appli (`app.routes`, routeurs inclus compris) et retient chacune de celles
qui portent un identifiant dans leur chemin. Pour chacune, l'organisation B (connectée) vise un objet de
l'organisation A :
- variante « objet de A » : tous les identifiants du chemin sont ceux de A ;
- variante « AO de B, objet de A » : pour les routes qui ont un AO et un sous-objet, l'AO est celui de B et le
  sous-objet celui de A (le sous-objet doit être cherché DANS l'AO, pas seulement par son identifiant).

Attendu : 404 ou 403. Jamais 2xx, jamais 500, jamais 422 (un 422 voudrait dire que le corps du test est faux : le
contrôle d'appartenance n'aurait pas été atteint). Et la base de A est identique avant et après l'appel.

Une route nouvelle à identifiant est balayée d'office. Si son chemin porte un paramètre inconnu du test, le test
échoue en le nommant : ajoute sa valeur dans `_valeur_parametre`, ou inscris la route dans `EXCEPTIONS` avec sa
raison. Une exception qui ne correspond plus à aucune route fait aussi échouer le test (liste toujours exacte).
"""
from __future__ import annotations

import enum
import typing
from datetime import date, datetime

import pytest
from fastapi import Request, UploadFile
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import BaseModel

from database import Base, SessionLocal, engine, get_db
from main import app
from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.notification import Notification
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.qualification import Qualification
from models.reference import Reference
from models.team_member import TeamMember
from models.user import User
from routers.auth import get_auth_user, get_auth_user_short


# ── Routes à identifiant qui ne visent pas un objet d'une autre organisation (raison écrite une à une) ───────────
_RUBRIQUE = "l'identifiant est un nom de rubrique fixe ; la route sert toujours l'entreprise de l'appelant"
EXCEPTIONS: dict[tuple[str, str], str] = {
    ("GET", "/api/entreprise/fiches/{rubrique}"): _RUBRIQUE,
    ("PUT", "/api/entreprise/fiches/{rubrique}"): _RUBRIQUE,
    ("POST", "/api/entreprise/fiches/{rubrique}/logo"): _RUBRIQUE,
    ("DELETE", "/api/entreprise/fiches/{rubrique}/logo"): _RUBRIQUE,
    ("POST", "/api/entreprise/fiches/{rubrique}/generer"): _RUBRIQUE,
    ("POST", "/api/entreprise/fiches/{rubrique}/apercu"): _RUBRIQUE,
    ("POST", "/api/entreprise/depots/{case_id}"): "l'identifiant est une case fixe de Mon entreprise ; "
                                                   "le dépôt va toujours à l'entreprise de l'appelant",
    ("POST", "/api/veille/avis/{avis_id}/creer-ao"): "un avis de veille est public (BOAMP), commun à toutes les "
                                                      "entreprises ; l'AO créé appartient à l'appelant",
    ("GET", "/api/files/view/{file_path:path}"): "sans jeton : URL signée (HMAC lié au chemin, à l'organisation et "
                                                  "à l'expiration), testée dans test_signed_urls / test_file_serve",
}

# Tables que B peut écrire pour SON compte sans toucher à A (journal d'audit, compteurs, dépenses d'IA).
_TABLES_DE_B = {"audit_logs", "couts_ia", "quota_consumptions", "quota_consumption"}


def _routes_reelles():
    def _parcourir(routes, prefixe=""):
        for r in routes:
            if type(r).__name__ == "_IncludedRouter":
                yield from _parcourir(r.original_router.routes, prefixe + r.include_context.prefix)
            elif isinstance(r, APIRoute):
                yield prefixe + r.path, r
            elif hasattr(r, "routes") and hasattr(r, "path"):
                yield from _parcourir(r.routes, prefixe + r.path)

    out = []
    for chemin, route in _parcourir(app.routes):
        if "{" not in chemin:
            continue
        for methode in sorted(route.methods - {"HEAD", "OPTIONS"}):
            out.append((methode, chemin, route))
    return out


ROUTES = _routes_reelles()
_SOUS_OBJET = ("doc_id", "item_id", "lot_id", "part", "cle")


def _cas():
    cas = []
    for methode, chemin, route in ROUTES:
        if (methode, chemin) in EXCEPTIONS:
            continue
        cas.append(pytest.param(methode, chemin, "objet_de_A", id=f"{methode} {chemin} [A]"))
        if "{project_id}" in chemin and any("{" + p + "}" in chemin for p in ("doc_id", "item_id")):
            cas.append(pytest.param(methode, chemin, "ao_de_B", id=f"{methode} {chemin} [AO de B]"))
    return cas


# ── Données : A possède tout, B a un AO à lui (vide) ────────────────────────────────────────────────────────────
@pytest.fixture
def monde(db_session, tmp_path, monkeypatch):
    import routers.candidature as candidature
    import routers.export as export
    import routers.projects as projects
    import services.file_storage as file_storage
    for mod in (export, projects, candidature, file_storage):
        monkeypatch.setattr(mod, "UPLOADS_ROOT", tmp_path)
    (tmp_path / "projets").mkdir()
    (tmp_path / "projets" / "rc-a.pdf").write_bytes(b"%PDF-1.4\n% piece de A\n%%EOF\n")
    (tmp_path / "coffre").mkdir()
    (tmp_path / "coffre" / "kbis-a.pdf").write_bytes(b"%PDF-1.4\n% coffre de A\n%%EOF\n")

    db_session.add_all([Organization(id="org-A", name="A Façades"), Organization(id="org-B", name="B Maçonnerie")])
    db_session.flush()
    user_a = User(id="user-A", email="a@a.fr", name="Alice", organization_id="org-A")
    user_b = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B")
    db_session.add_all([user_a, user_b])
    db_session.flush()
    lots = [{"id": "lot-1", "numero": "1", "nom": "Lot 1 Gros œuvre"}]
    db_session.add_all([
        Project(id="proj-A", organization_id="org-A", name="AO de A", lots_detectes=lots, current_step=3),
        Project(id="proj-B", organization_id="org-B", name="AO de B", lots_detectes=lots, current_step=3),
    ])
    db_session.flush()
    db_session.add_all([
        ProjectDocument(id="pdoc-A", project_id="proj-A", type="rc", file_url="/uploads/projets/rc-a.pdf",
                        file_name="rc-a.pdf"),
        Document(id="vdoc-A", organization_id="org-A", type="kbis", file_url="/uploads/coffre/kbis-a.pdf",
                 file_name="kbis-a.pdf"),
        Reference(id="ref-A", organization_id="org-A", intitule="Référence de A"),
        Qualification(id="qual-A", organization_id="org-A", famille="qualification", intitule="Qualif de A"),
        TeamMember(id="team-A", organization_id="org-A", name="Chef de A", role="Chef de chantier"),
        Notification(id="notif-A", organization_id="org-A", type="analyse", titre="Pour A"),
        ComplianceItem(id="exig-A", project_id="proj-A", exigence_text="Exigence de A"),
        MemoireTechnique(id="mem-A", project_id="proj-A",
                         content_json={"preambule": "Préambule de A", "partie_a": {"implantation": "Texte de A"},
                                       "partie_b": {}, "partie_c": {}}),
    ])
    db_session.flush()
    db_session.add(ChecklistItem(id="chk-A", project_id="proj-A", document_type_required="Kbis de A",
                                 source_exigence_id="exig-A"))
    db_session.commit()
    return user_a, user_b


def _valeur_parametre(nom: str, chemin: str, variante: str) -> str:
    if nom == "project_id":
        return "proj-B" if variante == "ao_de_B" else "proj-A"
    if nom == "doc_id":
        return "pdoc-A" if chemin.startswith("/api/projects/") else "vdoc-A"
    if nom == "item_id":
        return "chk-A" if "/checklist/" in chemin else "exig-A"
    valeurs = {
        "member_id": "team-A", "ref_id": "ref-A", "qualification_id": "qual-A", "notification_id": "notif-A",
        "exigence_id": "exig-A", "lot_id": "lot-1", "step": "3", "part": "partie_a", "cle": "implantation",
        "rubrique": "identite", "empreinte": "a" * 64, "numero": "1",
    }
    if nom not in valeurs:
        pytest.fail(f"Paramètre de chemin inconnu du balayage : « {nom} » ({chemin}). Donne-lui une valeur d'un "
                    f"objet de A dans _valeur_parametre, ou inscris la route dans EXCEPTIONS avec sa raison.")
    return valeurs[nom]


def _chemin_rempli(chemin: str, variante: str) -> str:
    import re
    return re.sub(r"\{([a-z_]+)(:[a-z]+)?\}", lambda m: _valeur_parametre(m.group(1), chemin, variante), chemin)


# ── Corps minimal VALIDE (sinon 422 avant le contrôle d'appartenance) ───────────────────────────────────────────
_CORPS: dict[tuple[str, str], dict] = {
    ("PATCH", "/api/projects/{project_id}/compliance/{item_id}"): {"confirmee": True},
    ("POST", "/api/projects/{project_id}/compliance/confirmer-groupe"): {"groupe": "candidature"},
    ("PUT", "/api/projects/{project_id}/checklist/{item_id}/link"): {"document_id": "vdoc-A"},
    ("PATCH", "/api/projects/{project_id}/checklist/{item_id}"): {"status": "non_applicable"},
    ("POST", "/api/projects/{project_id}/checklist/{item_id}/non-concerne"): {"non_concerne": True},
    ("PUT", "/api/projects/{project_id}/memoire/sections/{part}/{cle}/etat"): {"etat": "a_refaire"},
    ("POST", "/api/projects/{project_id}/memoire/rewrite-passage"): {"passage": "Un passage de A.",
                                                                     "action": "reformuler"},
    ("PATCH", "/api/projects/{project_id}/lots/{lot_id}/rename"): {"user_label": "Lot renommé par B"},
    ("POST", "/api/projects/{project_id}/lots/select"): {"lot_id": "lot-1", "lot_name": "Lot 1"},
    ("PUT", "/api/projects/{project_id}/plan-memoire"): {"parties": [{"cle": "p1", "titre": "Partie de B"}]},
    ("POST", "/api/projects/{project_id}/plan-memoire/valider"): {"parties": [{"cle": "p1", "titre": "Partie de B"}]},
    ("PATCH", "/api/projects/{project_id}/memoire"): {"content_json": {
        "preambule": "Préambule de B", "partie_a": {}, "partie_b": {}, "partie_c": {}}},
    ("PATCH", "/api/projects/{project_id}"): {"name": "Renommé par B"},
    ("PATCH", "/api/references/{ref_id}"): {"intitule": "Renommée par B"},
    ("PATCH", "/api/qualifications/{qualification_id}"): {"intitule": "Renommée par B"},
    ("PATCH", "/api/users/team/{member_id}"): {"name": "Renommé par B"},
    # REVUE-2 P2-4 — fonctions C1 et C2 : sans ces corps, une fois allumées, elles répondaient 422 avant le contrôle.
    ("POST", "/api/projects/{project_id}/memoire/proposer-paragraphe"): {"sous_critere": "Méthodologie d'exécution"},
    ("POST", "/api/projects/{project_id}/memoire/reecrire-trois"): {"passage": "Un passage de A.",
                                                                    "action": "reformuler"},
}


def _type_simple(annotation):
    origine = typing.get_origin(annotation)
    if origine in (typing.Union, getattr(__import__("types"), "UnionType", None)):
        args = [a for a in typing.get_args(annotation) if a is not type(None)]
        return _type_simple(args[0]) if args else None
    return annotation


def _exemple(annotation):
    annotation = _type_simple(annotation)
    origine = typing.get_origin(annotation)
    if origine is typing.Literal:
        return typing.get_args(annotation)[0]
    if origine in (list, set, tuple):
        return []
    if origine is dict:
        return {}
    if isinstance(annotation, type):
        if issubclass(annotation, BaseModel):
            return _corps_generique(annotation)
        if issubclass(annotation, enum.Enum):
            return list(annotation)[0].value
        if issubclass(annotation, bool):
            return True
        if issubclass(annotation, int):
            return 1
        if issubclass(annotation, float):
            return 1.0
        if issubclass(annotation, datetime):
            return "2026-11-12T10:00:00"
        if issubclass(annotation, date):
            return "2026-11-12"
    return "x"


def _corps_generique(modele) -> dict:
    return {nom: _exemple(champ.annotation) for nom, champ in modele.model_fields.items() if champ.is_required()}


def _requete(route: APIRoute, methode: str, chemin: str) -> dict:
    if (methode, chemin) in _CORPS:
        return {"json": _CORPS[(methode, chemin)]}
    champ = route.body_field
    if champ is None:
        return {}
    modele = _type_simple(champ.field_info.annotation)
    if isinstance(modele, type) and issubclass(modele, BaseModel):
        fichiers, donnees = {}, {}
        for nom, f in modele.model_fields.items():
            ann = _type_simple(f.annotation)
            if ann is UploadFile or typing.get_origin(ann) is list and UploadFile in typing.get_args(ann):
                fichiers[nom] = ("piece.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")
            elif f.is_required():
                donnees[nom] = str(_exemple(f.annotation))
        if fichiers:
            return {"files": fichiers, "data": donnees}
        return {"json": _corps_generique(modele)}
    return {"json": None}


def _photo_de_la_base() -> dict:
    """Toutes les lignes de toutes les tables (sauf celles que B écrit pour son propre compte)."""
    s = SessionLocal()
    try:
        photo = {}
        for table in Base.metadata.sorted_tables:
            if table.name in _TABLES_DE_B:
                continue
            photo[table.name] = sorted(repr(tuple(r)) for r in s.execute(table.select()).fetchall())
        return photo
    finally:
        s.close()


def _client_de(user: User) -> TestClient:
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _auth(request: Request):
        request.state.rl_key = f"org:{user.organization_id}"
        return user

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = _auth
    app.dependency_overrides[get_auth_user_short] = _auth
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("methode,chemin,variante", _cas())
def test_l_organisation_b_n_atteint_aucun_objet_de_a(monde, methode, chemin, variante):
    _balayer(monde, methode, chemin, variante)


def _balayer(monde, methode, chemin, variante):
    _, user_b = monde
    route = next(r for m, c, r in ROUTES if m == methode and c == chemin)
    avant = _photo_de_la_base()
    try:
        client = _client_de(user_b)
        url = _chemin_rempli(chemin, variante)
        if chemin.endswith("/progress-stream"):
            reponse = client.get(url, headers={"Accept": "text/event-stream"})
        else:
            reponse = client.request(methode, url, **_requete(route, methode, chemin))
    finally:
        app.dependency_overrides.clear()
    assert reponse.status_code in (403, 404), (
        f"{methode} {url} depuis l'organisation B → {reponse.status_code} (attendu 404 ou 403) : "
        f"{reponse.text[:300]}"
    )
    apres = _photo_de_la_base()
    modifiees = [t for t in avant if avant[t] != apres[t]]
    assert not modifiees, f"{methode} {url} refusé mais a écrit dans : {modifiees}"


# ── REVUE-2 P2-4 — seconde passe, fonctions C ALLUMÉES ───────────────────────────────────────────────────────────
# Éteintes (le défaut), leurs routes répondent 404 par l'interrupteur : le contrôle d'appartenance n'est jamais atteint.
# Ici, l'interrupteur laisse passer et le modèle est remplacé par une fonction qui lève (0 €, aucun appel) : le 404 ou
# le 403 prouve que l'appartenance est vérifiée avant l'appel.
_INTERRUPTEURS_C = ("RELECTURE_PROPOSER", "REECRIRE_TROIS", "FICHE_PROPOSEE", "STYLE_ENTREPRISE")


def _derriere_un_interrupteur(chemin_methode) -> bool:
    methode, chemin = chemin_methode
    route = next(r for m, c, r in ROUTES if m == methode and c == chemin)
    return any(getattr(d.dependency, "__module__", "") == "services.fonctions_ia"
               and getattr(d.dependency, "__name__", "").startswith("exiger_") for d in route.dependencies)


def _cas_allumees():
    return [c for c in _cas() if _derriere_un_interrupteur(c.values[:2])]


@pytest.fixture
def fonctions_c_allumees(monkeypatch):
    for variable in _INTERRUPTEURS_C:
        monkeypatch.setenv(variable, "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    def _interdit(*a, **k):
        raise AssertionError("appel du modèle atteint depuis une autre organisation")
    from services.ai import fonctions_c
    for nom in ("proposer_paragraphe", "reecrire_trois", "proposer_fiches", "lire_style"):
        monkeypatch.setattr(fonctions_c, nom, _interdit)


@pytest.mark.parametrize("methode,chemin,variante", _cas_allumees())
def test_fonctions_c_allumees_l_organisation_b_n_atteint_aucun_objet_de_a(monde, fonctions_c_allumees, methode, chemin,
                                                                          variante):
    _balayer(monde, methode, chemin, variante)


def test_la_passe_allumee_couvre_c1_c2_et_c3():
    chemins = {c.values[1] for c in _cas_allumees()}
    assert chemins == {"/api/projects/{project_id}/memoire/proposer-paragraphe",
                       "/api/projects/{project_id}/memoire/reecrire-trois",
                       "/api/projects/{project_id}/plan-memoire/proposer-voulu"}


def test_chaque_exception_correspond_a_une_route_reelle():
    reelles = {(m, c) for m, c, _ in ROUTES}
    perimees = [cle for cle in EXCEPTIONS if cle not in reelles]
    assert not perimees, f"Exceptions qui ne correspondent plus à aucune route : {perimees}"
    assert all(len(raison) > 20 for raison in EXCEPTIONS.values()), "chaque exception porte sa raison"


def test_le_balayage_voit_bien_toutes_les_routes_a_identifiant():
    """Garde-fou : si FastAPI change sa façon de ranger les routes incluses, le balayage ne doit pas devenir vide."""
    chemins = {c for _, c, _ in ROUTES}
    assert len(ROUTES) >= 80
    for attendu in ("/api/projects/{project_id}", "/api/projects/{project_id}/documents/{doc_id}/download",
                    "/api/sources/{exigence_id}", "/api/notifications/{notification_id}/read"):
        assert attendu in chemins


# ── Q-03 — téléchargement et aperçu d'une pièce du dossier : chemin nominal (l'organisation A sur sa propre pièce) ─
def test_a_telecharge_sa_piece(monde):
    user_a, _ = monde
    try:
        reponse = _client_de(user_a).get("/api/projects/proj-A/documents/pdoc-A/download")
    finally:
        app.dependency_overrides.clear()
    assert reponse.status_code == 200
    assert reponse.content.startswith(b"%PDF-1.4\n% piece de A")
    assert reponse.headers["content-type"] == "application/pdf"
    assert "attachment" in reponse.headers["content-disposition"]
    assert "rc-a.pdf" in reponse.headers["content-disposition"]


def test_a_voit_l_apercu_de_sa_piece_et_l_aperçu_pdf_passe_en_premier(monde, db_session, tmp_path):
    user_a, _ = monde
    (tmp_path / "projets" / "rc-a-apercu.pdf").write_bytes(b"%PDF-1.4\n% apercu de A\n%%EOF\n")
    piece = db_session.get(ProjectDocument, "pdoc-A")
    try:
        client = _client_de(user_a)
        sans_apercu = client.get("/api/projects/proj-A/documents/pdoc-A/preview")
        piece.pdf_preview_url = "/uploads/projets/rc-a-apercu.pdf"
        db_session.commit()
        avec_apercu = client.get("/api/projects/proj-A/documents/pdoc-A/preview")
    finally:
        app.dependency_overrides.clear()
    assert sans_apercu.status_code == 200
    assert sans_apercu.content.startswith(b"%PDF-1.4\n% piece de A")
    assert sans_apercu.headers["content-disposition"].startswith("inline;")
    assert avec_apercu.status_code == 200
    assert avec_apercu.content.startswith(b"%PDF-1.4\n% apercu de A")


def test_piece_dont_le_fichier_a_disparu_404_propre(monde, tmp_path):
    user_a, _ = monde
    (tmp_path / "projets" / "rc-a.pdf").unlink()
    try:
        client = _client_de(user_a)
        telechargement = client.get("/api/projects/proj-A/documents/pdoc-A/download")
        apercu = client.get("/api/projects/proj-A/documents/pdoc-A/preview")
    finally:
        app.dependency_overrides.clear()
    assert telechargement.status_code == 404 and apercu.status_code == 404


# ── Les routes de section du mémoire lisaient le mémoire de l'AO AVANT de vérifier qu'il appartenait à l'appelant ──
# (_section_connue(part, cle, _contenu_du_projet(...)) puis _get_project_or_404) : la réponse d'un AO d'autrui différait
# selon que son plan contenait ou non une partie ajoutée (« Partie du mémoire inconnue » contre « introuvable »).
@pytest.mark.parametrize("methode,suffixe", [("PUT", "etat"), ("GET", "refaire/estimation"), ("POST", "refaire")])
def test_section_d_un_ao_d_autrui_meme_reponse_qu_un_ao_inexistant(monde, db_session, methode, suffixe):
    _, user_b = monde
    memoire = db_session.get(MemoireTechnique, "mem-A")
    memoire.content_json = {**memoire.content_json, "partie_a": {"implantation": "x", "ajout_1": "Partie ajoutée"},
                            "_plan": {"parties": [{"partie": "partie_a", "sous_cle": "ajout_1"}]}}
    db_session.commit()
    corps = {"json": {"etat": "a_refaire"}} if suffixe == "etat" else {}
    try:
        client = _client_de(user_b)
        chez_a = client.request(methode, f"/api/projects/proj-A/memoire/sections/partie_a/ajout_1/{suffixe}", **corps)
        nulle_part = client.request(methode, f"/api/projects/inexistant/memoire/sections/partie_a/ajout_1/{suffixe}",
                                    **corps)
    finally:
        app.dependency_overrides.clear()
    assert chez_a.status_code == nulle_part.status_code == 404
    assert chez_a.json() == nulle_part.json()
