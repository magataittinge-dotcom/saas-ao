"""
Tests C19 — traduction trésorerie du CCAP (déterministe, 0 € API).

Le service LIT le contrat et le traduit en clair (langage patron).
RÈGLE ABSOLUE : jamais de commentaire sur le prix de l'utilisateur, jamais
de conseil de chiffrage — uniquement les faits du CCAP.
Champ absent du DCE → ligne omise (pas de « non trouvé »).
"""
import pytest


CCAP_TEXT = """
CCAP — Commune de Gueux

Article 3.1 — Avance
Une avance de 5 % est accordée au titulaire lorsque le montant du marché
est supérieur à 50 000 € HT.

Article 3.4 — Délai de paiement
Le délai global de paiement est de 30 jours.

Article 3.5 — Retenue de garantie
Une retenue de garantie de 5 % est appliquée. Elle peut être remplacée
par une garantie à première demande.

Article 4.3 — Pénalités de retard
Pénalité de 500 € HT par jour calendaire de retard, plafonnée à 10 %
du montant du marché.

Article 3.6 — Révision des prix
Les prix sont révisables par application de la formule P = P0 (0,15 + 0,85 BT01/BT01o).
"""

INFOS_MARCHE = {
    "conditions_paiement": {"delai_jours": 30, "avance_pct": 5, "acomptes": "mensuels"},
    "retenue_garantie_pct": 5,
    "caution_remplacante": True,
    "penalites_retard": "500 € HT/jour",
}


class _Doc:
    def __init__(self, file_name, doc_type, text):
        self.file_name = file_name
        self.type = doc_type
        self.extracted_text = text


DOCS = [_Doc("CCAP_Gueux.pdf", "ccap", CCAP_TEXT)]


@pytest.fixture
def lignes():
    from services.tresorerie import build_tresorerie
    return build_tresorerie(INFOS_MARCHE, DOCS)


def _by_id(lignes, lid):
    matches = [l for l in lignes if l["id"] == lid]
    return matches[0] if matches else None


# ─── Valeurs correctes sur le CCAP Gueux ─────────────────────────────────────

def test_avance(lignes):
    ligne = _by_id(lignes, "avance")
    assert ligne is not None
    assert "5 %" in ligne["valeur"]
    assert ligne["source"] is not None
    assert ligne["source"]["document"] == "CCAP_Gueux.pdf"


def test_delai_paiement(lignes):
    ligne = _by_id(lignes, "delai_paiement")
    assert ligne is not None
    assert "30 jours" in ligne["valeur"]


def test_retenue_garantie_with_caution(lignes):
    ligne = _by_id(lignes, "retenue_garantie")
    assert ligne is not None
    assert "5 %" in ligne["valeur"]
    assert "caution" in ligne["explication"].lower() or "garantie" in ligne["explication"].lower()


def test_penalites(lignes):
    ligne = _by_id(lignes, "penalites")
    assert ligne is not None
    assert "500" in ligne["valeur"]
    assert "10 %" in ligne["valeur"] or "10%" in ligne["valeur"]


def test_revision_prix_detected_with_formula(lignes):
    ligne = _by_id(lignes, "revision_prix")
    assert ligne is not None
    assert "révisable" in ligne["valeur"].lower()
    assert "BT01" in (ligne["formule"] or "")


def test_prix_fermes_detected():
    from services.tresorerie import build_tresorerie

    docs = [_Doc("CCAP.pdf", "ccap", "Article 3.6 — Les prix sont fermes et non révisables.")]
    lignes = build_tresorerie({}, docs)
    ligne = _by_id(lignes, "revision_prix")
    assert ligne is not None
    assert "ferme" in ligne["valeur"].lower()


# ─── Champs absents → lignes omises ──────────────────────────────────────────

def test_absent_fields_are_omitted():
    from services.tresorerie import build_tresorerie

    lignes = build_tresorerie({}, [_Doc("CCAP.pdf", "ccap", "Article 1 : objet des travaux.")])
    ids = {l["id"] for l in lignes}
    assert "avance" not in ids
    assert "delai_paiement" not in ids
    assert "retenue_garantie" not in ids
    assert "penalites" not in ids
    # révision : rien détecté → omise aussi (pas de supposition)
    assert "revision_prix" not in ids


# ─── Jamais de conseil de prix ───────────────────────────────────────────────

def test_never_gives_pricing_advice(lignes):
    """On traduit le contrat — on ne conseille JAMAIS le chiffrage."""
    forbidden = ["conseil", "devriez", "nous recommandons", "chiffrage", "votre prix", "marge"]
    for ligne in lignes:
        text = " ".join(str(v) for v in ligne.values() if isinstance(v, str)).lower()
        for word in forbidden:
            assert word not in text, f"conseil de prix interdit dans {ligne['id']}: {word!r}"


# ─── Endpoint ────────────────────────────────────────────────────────────────

def test_endpoint_tresorerie(client, db_session, test_org):
    from models.project import Project, ProjectDocument

    p = Project(
        id="proj-c19", organization_id=test_org.id, name="Gueux",
        selected_lot="lot1", infos_marche=INFOS_MARCHE,
    )
    db_session.add(p)
    db_session.add(ProjectDocument(
        project_id="proj-c19", type="ccap", file_url="/uploads/projects/proj-c19/ccap.pdf",
        file_name="CCAP_Gueux.pdf", extracted_text=CCAP_TEXT,
    ))
    db_session.commit()

    resp = client.get("/api/projects/proj-c19/tresorerie")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["lot"] == "lot1"
    ids = {l["id"] for l in body["lignes"]}
    assert {"avance", "delai_paiement", "retenue_garantie", "penalites", "revision_prix"} <= ids
