"""
Tests C5 — bandeau critique : extraction structurée avec sources.

Chaque champ = {"value": ..., "source": {document, page, excerpt} | None}.
Valeur prioritaire : données déjà extraites par l'analyse (infos_marche,
criteres_jugement) ; sinon extraction regex ciblée sur le RC/CCAP.
Champ absent du DCE → value null EXPLICITE, jamais inventé.
"""
from datetime import date

import pytest

from models.project import Project, ProjectDocument


# Fixture réaliste type Gueux (extraits RC + CCAP)
RC_TEXT = """
REGLEMENT DE LA CONSULTATION
Commune de Gueux — Restructuration du groupe scolaire

Article 2.3 — Visite de site
La visite du site est obligatoire. Elle aura lieu le 12/09/2026 à 10h00.
Une attestation de visite sera remise.

Article 4.1 — Remise des offres
Les offres devront parvenir avant le 30/09/2026 à 12h00.

Article 4.4 — Questions des candidats
Les demandes de renseignements complémentaires devront être adressées
au plus tard le 20/09/2026 via le profil acheteur.

Article 5 — Jugement des offres
Prix : 40 % — Valeur technique : 60 %
"""

CCAP_TEXT = """
CCAP — Article 4.3 Pénalités de retard
En cas de retard, il sera appliqué une pénalité de 500 € HT par jour
calendaire de retard, plafonnée à 10 % du montant du marché.

Article 3.2 — Délai d'exécution
Le délai d'exécution des travaux est de 14 mois, période de préparation comprise.
"""

INFOS_MARCHE = {
    "date_limite_reponse": "2026-09-30",
    "duree_marche": "14 mois",
    "penalites_retard": "500 € HT/jour",
    "visite_site": {"obligatoire": True, "details": "Visite le 12/09/2026 à 10h00"},
    "type_procedure": "MAPA",
}

CRITERES = [
    {"nom": "Prix", "poids": 40, "sous_criteres": []},
    {"nom": "Valeur technique", "poids": 60, "sous_criteres": [{"nom": "Mémoire", "poids": 40}]},
]


class _Doc:
    def __init__(self, file_name, doc_type, text):
        self.file_name = file_name
        self.type = doc_type
        self.extracted_text = text


DOCS = [
    _Doc("RC_Gueux.pdf", "rc", RC_TEXT),
    _Doc("CCAP_Gueux.pdf", "ccap", CCAP_TEXT),
]


@pytest.fixture
def fields():
    from services.critical_fields import build_critical_fields
    return build_critical_fields(INFOS_MARCHE, CRITERES, DOCS)


# ─── Deadline de remise (avec heure) ─────────────────────────────────────────

def test_deadline_with_time_and_source(fields):
    f = fields["date_limite_remise"]
    assert f["value"]["date"] == "2026-09-30"
    assert f["value"]["heure"] == "12h00"
    assert f["source"]["document"] == "RC_Gueux.pdf"
    assert "30/09/2026" in f["source"]["excerpt"]


# ─── Date limite des questions (regex ciblée — absente de l'analyse) ─────────

def test_questions_deadline_extracted_from_rc(fields):
    f = fields["date_limite_questions"]
    assert f["value"] == "2026-09-20"
    assert f["source"]["document"] == "RC_Gueux.pdf"


# ─── Visite de site ──────────────────────────────────────────────────────────

def test_visite_obligatoire_with_date(fields):
    f = fields["visite_site"]
    assert f["value"]["statut"] == "obligatoire"
    assert f["value"]["date"] == "2026-09-12"


def test_visite_non_mentionnee_when_absent():
    from services.critical_fields import build_critical_fields

    out = build_critical_fields({"date_limite_reponse": None}, [], [
        _Doc("RC.pdf", "rc", "Article 1 — Objet du marché : travaux de couverture."),
    ])
    assert out["visite_site"]["value"]["statut"] == "non_mentionnee"
    assert out["visite_site"]["value"]["date"] is None


# ─── Critères de notation ────────────────────────────────────────────────────

def test_criteres_passthrough_with_weights(fields):
    f = fields["criteres"]
    assert f["value"] == CRITERES
    assert f["value"][0]["poids"] == 40


# ─── Pénalités : montant/jour + plafond ──────────────────────────────────────

def test_penalites_amount_and_plafond(fields):
    f = fields["penalites"]
    assert f["value"]["retard"] == "500 € HT/jour"
    assert "10" in f["value"]["plafond"]          # « plafonnée à 10 % »
    assert f["source"]["document"] == "CCAP_Gueux.pdf"


# ─── Délai d'exécution ───────────────────────────────────────────────────────

def test_delai_execution(fields):
    assert fields["delai_execution"]["value"] == "14 mois"


# ─── Null explicite — jamais inventé ─────────────────────────────────────────

def test_absent_fields_are_explicit_null():
    from services.critical_fields import build_critical_fields

    out = build_critical_fields({}, [], [_Doc("RC.pdf", "rc", "Objet : peinture.")])
    assert out["date_limite_remise"]["value"] is None
    assert out["date_limite_questions"]["value"] is None
    assert out["penalites"]["value"] is None
    assert out["delai_execution"]["value"] is None
    assert out["criteres"]["value"] is None
    # Une source ne peut pas exister sans valeur.
    assert out["date_limite_remise"]["source"] is None


# ─── Parsing dates FR (unit) ─────────────────────────────────────────────────

def test_french_date_parsing():
    from services.critical_fields import parse_french_date

    assert parse_french_date("30/09/2026") == date(2026, 9, 30)
    assert parse_french_date("2026-09-30") == date(2026, 9, 30)
    assert parse_french_date("15 avril 2026") == date(2026, 4, 15)
    assert parse_french_date("1er février 2027") == date(2027, 2, 1)
    assert parse_french_date("n'importe quoi") is None


# ─── Endpoint : calcul paresseux + persistance PAR LOT ───────────────────────

def _setup_project(db, org_id, pid="proj-c5", lot="lot2"):
    p = Project(
        id=pid, organization_id=org_id, name="Gueux",
        selected_lot=lot, infos_marche=INFOS_MARCHE, criteres_jugement=CRITERES,
    )
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="RC_Gueux.pdf", extracted_text=RC_TEXT,
    ))
    db.add(ProjectDocument(
        project_id=pid, type="ccap", file_url=f"/uploads/projects/{pid}/ccap.pdf",
        file_name="CCAP_Gueux.pdf", extracted_text=CCAP_TEXT,
    ))
    db.commit()
    return p


def test_endpoint_returns_fields_and_persists_per_lot(client, db_session, test_org):
    project = _setup_project(db_session, test_org.id)

    resp = client.get(f"/api/projects/{project.id}/critical-fields")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["lot"] == "lot2"
    assert body["fields"]["date_limite_remise"]["value"]["date"] == "2026-09-30"

    # Persisté sous la clé du lot — une autre analyse de lot n'écrasera pas.
    db_session.expire_all()
    refreshed = db_session.query(Project).filter(Project.id == project.id).first()
    assert "lot2" in refreshed.critical_fields
    assert refreshed.critical_fields["lot2"]["criteres"]["value"] == CRITERES


def test_endpoint_cross_org_404(client, db_session, test_org):
    from models.organization import Organization

    db_session.add(Organization(id="org-c5-other", name="Autre"))
    db_session.flush()
    _setup_project(db_session, "org-c5-other", pid="proj-c5-other")

    resp = client.get("/api/projects/proj-c5-other/critical-fields")
    assert resp.status_code == 404
