"""
Signature lue dans le RC, avec sa source (bloc 9, tranche 4).

La checklist garde, pour chaque ligne, d'où l'extrait du RC a été lu : le document,
la page, l'exigence d'origine (le panneau « Voir dans le DCE » s'y ancre) et
l'article qui porte le passage. La confirmation de signature n'est demandée que si
l'extrait l'exige (checklist_matcher.signature_requise) ; l'écran peut alors citer
l'article. Sources des règles : DC1/DC2/DUME non signés sauf exigence du RC
(service-public F32144, F32106) ; AE signé à l'attribution (R17445). RC inventé.
"""
from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument

PID = "proj-sig-source"

RC_TEXTE = """RÈGLEMENT DE LA CONSULTATION

Article 5.2 : Présentation des candidatures
Les candidats remettent le formulaire DC1 et le formulaire DC2.
Ces formulaires doivent être signés par une personne habilitée à engager l'entreprise.

Article 6 – Jugement des offres
Les offres sont jugées selon les critères pondérés.
"""
EXTRAIT_SIGNE = "Ces formulaires doivent être signés par une personne habilitée à engager l'entreprise."


def _seed(db, org_id):
    db.add(Project(id=PID, organization_id=org_id, name="AO source signature"))
    db.add(ProjectDocument(id="pd-rc", project_id=PID, type="rc", file_name="RC.pdf",
                           file_url="/uploads/x/rc.pdf", extracted_text=RC_TEXTE))
    db.add(ComplianceItem(id="ex-dc1", project_id=PID, exigence_text="Remettre le formulaire DC1 complété",
                          source_document="RC.pdf", source_page=7, source_excerpt=EXTRAIT_SIGNE,
                          category="candidature", priority="obligatoire", status="non_couvert", lot="_commun"))
    db.add(ComplianceItem(id="ex-dc2", project_id=PID, exigence_text="Remettre le formulaire DC2 complété",
                          source_document="RC.pdf", source_page=8,
                          source_excerpt="Les candidats remettent le formulaire DC1 et le formulaire DC2.",
                          category="candidature", priority="obligatoire", status="non_couvert", lot="_commun"))
    db.commit()


def _lignes(client):
    assert client.post(f"/api/projects/{PID}/checklist/regenerate").status_code == 200
    return {l["document_type_required"]: l for l in client.get(f"/api/projects/{PID}/checklist").json()}


def test_la_ligne_garde_document_page_exigence_et_article(client, db_session, test_org):
    _seed(db_session, test_org.id)
    l = _lignes(client)["dc1_template"]
    assert l["source_document"] == "RC.pdf" and l["source_page"] == 7
    assert l["source_exigence_id"] == "ex-dc1"
    assert l["source_article"] == "Article 5.2 — Présentation des candidatures"


def test_signature_demandee_quand_l_extrait_l_exige_et_la_source_est_citee(client, db_session, test_org):
    _seed(db_session, test_org.id)
    l = _lignes(client)
    assert l["dc1_template"]["signature_required"] is True
    assert l["dc1_template"]["source_article"].startswith("Article 5.2")
    # le DC2 : extrait sans exigence de signature → aucune case, pas de signature inventée
    assert l["dc2_template"]["signature_required"] is False


def test_extrait_introuvable_dans_le_document_aucun_article_invente(client, db_session, test_org):
    _seed(db_session, test_org.id)
    db_session.get(ProjectDocument, "pd-rc").extracted_text = "Un texte sans rapport avec la consultation."
    db_session.commit()
    l = _lignes(client)["dc1_template"]
    assert l["source_article"] is None
    assert l["source_document"] == "RC.pdf" and l["source_page"] == 7


def test_document_cite_introuvable_dans_le_dossier_aucune_source_inventee(client, db_session, test_org):
    _seed(db_session, test_org.id)
    db_session.get(ComplianceItem, "ex-dc1").source_document = "Pièce inconnue.pdf"
    db_session.commit()
    l = _lignes(client)["dc1_template"]
    assert l["source_article"] is None and l["source_document"] == "Pièce inconnue.pdf"


def test_migration_0027_ajoute_et_retire_les_colonnes_sans_doublon():
    import importlib.util
    from pathlib import Path

    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    chemin = Path(__file__).resolve().parent.parent / "alembic/versions/0027_checklist_source_rc.py"
    spec = importlib.util.spec_from_file_location("m0027", chemin)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert m.down_revision == "0026"

    moteur = sa.create_engine("sqlite://")
    with moteur.begin() as c:
        c.execute(sa.text("CREATE TABLE compliance_items (id VARCHAR PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE checklist_items (id VARCHAR PRIMARY KEY)"))

    def lancer(f):
        with moteur.begin() as c, Operations.context(MigrationContext.configure(c, opts={"render_as_batch": True})):
            f()

    cols = lambda: {c["name"] for c in sa.inspect(moteur).get_columns("checklist_items")}
    voulues = {"source_document", "source_page", "source_article", "source_exigence_id"}
    lancer(m.upgrade)
    lancer(m.upgrade)
    assert voulues <= cols()
    lancer(m.downgrade)
    assert not (voulues & cols())
