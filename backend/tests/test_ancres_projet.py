"""A4 (sujet A) — les ancres sont calculées à la fin de l'analyse, un aller-retour par
pièce, sans jamais casser l'analyse. Textes inventés."""
import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from services import ancres_projet, file_storage, pdfium_processus
from services.pdfium_processus import TravailPdfiumEchoue
from tests.pdf_fabrique import pdf_texte

P1 = "Les menuiseries extérieures seront livrées avec leurs vitrages feuilletés."
P2 = "Le titulaire fournit les fiches techniques de tous les produits mis en œuvre."
P3 = "La réception des travaux est prononcée après levée de toutes les réserves."


@pytest.fixture(autouse=True)
def _processus_propres():
    pdfium_processus.arreter()
    yield
    pdfium_processus.arreter()


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-anc4"
    dossier.mkdir(parents=True)
    (dossier / "cctp.pdf").write_bytes(pdf_texte(["Un.", P1 + "\n" + P2, P3]))
    (dossier / "ccap.pdf").write_bytes(pdf_texte([P3]))
    db_session.add(Project(id="p-anc4", organization_id=test_org.id, name="AO"))
    db_session.add_all([
        ProjectDocument(id="d-cctp", project_id="p-anc4", type="cctp", file_name="cctp.pdf",
                        file_url="/uploads/projects/p-anc4/cctp.pdf"),
        ProjectDocument(id="d-ccap", project_id="p-anc4", type="ccap", file_name="ccap.pdf",
                        file_url="/uploads/projects/p-anc4/ccap.pdf"),
        ProjectDocument(id="d-dpgf", project_id="p-anc4", type="dpgf_template", file_name="dpgf.xlsx",
                        file_url="/uploads/projects/p-anc4/dpgf.xlsx"),
    ])

    def ligne(id_, doc, page, extrait):
        db_session.add(ComplianceItem(id=id_, project_id="p-anc4", exigence_text="e", source_document=doc,
                                      source_page=page, source_excerpt=extrait))
    ligne("i1", "cctp.pdf", 2, P1)
    ligne("i2", "cctp.pdf", 2, P2)
    ligne("i3", "cctp.pdf", 3, P3)
    ligne("i4", "ccap.pdf", 1, P3)
    ligne("i5", "dpgf.xlsx", 1, "Ligne 12 du bordereau")
    ligne("i6", "cctp.pdf", 2, "Un passage qui n'existe nulle part dans la pièce")
    ligne("i7", "cctp.pdf", 2, None)
    db_session.commit()
    return db_session


def _ancres(db):
    db.expire_all()
    return {c.id: c.ancre for c in db.query(ComplianceItem).filter_by(project_id="p-anc4")}


def test_ancres_calculees_dans_un_processus_et_rangees(projet):
    bilan = ancres_projet.calculer_et_stocker(projet, "p-anc4")
    a = _ancres(projet)
    assert a["i1"]["niveau"] == "passage" and a["i1"]["page"] == 2 and a["i1"]["doc_id"] == "d-cctp"
    assert a["i2"]["niveau"] == "passage" and a["i3"]["page"] == 3
    assert a["i4"]["doc_id"] == "d-ccap" and a["i4"]["niveau"] == "passage"
    assert a["i1"]["rects"] and a["i1"]["citation"]["passage"] == P1
    assert bilan["pieces"] == 2 and bilan["passage"] == 4 and bilan["echecs"] == 0


def test_un_seul_aller_retour_par_piece(projet, monkeypatch):
    appels = []
    vrai = pdfium_processus.executer
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(a[0]) or vrai(*a, **k))
    ancres_projet.calculer_et_stocker(projet, "p-anc4")
    assert len(appels) == 2                    # cctp.pdf (4 exigences) + ccap.pdf, pas une par exigence


def test_ni_pdf_ni_extrait_pas_d_ancre(projet):
    ancres_projet.calculer_et_stocker(projet, "p-anc4")
    a = _ancres(projet)
    assert a["i5"] is None                     # tableur : hors périmètre (bloc 5)
    assert a["i7"] is None                     # pas d'extrait : pas de bouton source


def test_passage_introuvable_est_range_aucun_sans_recalcul(projet, monkeypatch):
    ancres_projet.calculer_et_stocker(projet, "p-anc4")
    a = _ancres(projet)
    # page 2 valable : repli « page », sans rectangles
    assert a["i6"]["niveau"] == "page" and a["i6"]["page"] == 2 and a["i6"]["rects"] == []
    appels = []
    vrai = pdfium_processus.executer
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(1) or vrai(*a, **k))
    ancres_projet.calculer_et_stocker(projet, "p-anc4")        # déjà calculées : rien à refaire
    assert appels == []


def test_page_absente_et_passage_introuvable_range_aucun(projet):
    projet.add(ComplianceItem(id="i8", project_id="p-anc4", exigence_text="e", source_document="cctp.pdf",
                              source_page=None, source_excerpt="Phrase absente de toutes les pièces du dossier"))
    projet.commit()
    ancres_projet.calculer_et_stocker(projet, "p-anc4")
    assert _ancres(projet)["i8"]["niveau"] == "aucun"
    assert _ancres(projet)["i8"]["page"] is None


def test_travail_echoue_pas_d_ancre_pas_d_exception(projet, monkeypatch):
    def echoue(*a, **k):
        raise TravailPdfiumEchoue("delai", "trop long")
    monkeypatch.setattr(pdfium_processus, "executer", echoue)
    bilan = ancres_projet.calculer_et_stocker(projet, "p-anc4")
    assert bilan["echecs"] == 2 and bilan["ancres"] == 0
    assert all(v is None for v in _ancres(projet).values())


def test_pdf_illisible_ou_absent_du_disque_pas_d_ancre(projet, tmp_path):
    (tmp_path / "projects" / "p-anc4" / "cctp.pdf").write_bytes(b"ce n'est pas un pdf")
    (tmp_path / "projects" / "p-anc4" / "ccap.pdf").unlink()
    bilan = ancres_projet.calculer_et_stocker(projet, "p-anc4")
    a = _ancres(projet)
    assert bilan["echecs"] == 1                # cctp.pdf illisible ; ccap.pdf sans fichier : ignoré
    assert a["i1"] is None and a["i4"] is None


def test_chemin_hors_uploads_refuse(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path / "uploads")
    (tmp_path / "uploads").mkdir()
    (tmp_path / "secret.pdf").write_bytes(pdf_texte(["x"]))
    piece = ProjectDocument(id="d", project_id="p", type="cctp", file_name="a.pdf", file_url="/uploads/../secret.pdf")
    assert ancres_projet.chemin_pdf(piece) is None


def test_word_converti_utilise_son_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    (tmp_path / "n.pdf").write_bytes(pdf_texte(["x"]))
    piece = ProjectDocument(id="d", project_id="p", type="cctp", file_name="n.docx", file_url="/uploads/n.docx",
                            pdf_preview_url="/uploads/n.pdf")
    assert ancres_projet.chemin_pdf(piece) == (tmp_path / "n.pdf").resolve()


def test_trouver_piece_comme_l_ecran():
    pieces = [ProjectDocument(type="rc", file_name="Règlement de consultation.pdf"),
              ProjectDocument(type="cctp", file_name="CCTP lot 05.pdf"),
              ProjectDocument(type="cctp", file_name="CCTP lot 05 - Annexe.pdf"),
              ProjectDocument(type="dpgf_template", file_name="DPGF.xlsx")]
    t = ancres_projet.trouver_piece
    assert t("CCTP lot 05 - Annexe.pdf p.4", pieces).file_name == "CCTP lot 05 - Annexe.pdf"   # nom le plus long
    assert t("RC p. 3", pieces).type == "rc"
    assert t("CCTP", pieces).file_name == "CCTP lot 05.pdf"
    assert t("DPGF", pieces).file_name == "DPGF.xlsx"
    assert t("Plan masse", pieces) is None and t("", pieces) is None and t(None, pieces) is None


# ─── dans l'analyse ───────────────────────────────────────────────────────────

def _lancer_analyse(client, db_session, test_org, monkeypatch, nom):
    from datetime import date
    from services.ai import checklist_matcher, dce_analyzer
    from tests.test_analysis_status_fix import _join_analysis_threads
    db_session.add(Project(id=nom, organization_id=test_org.id, name="a", deadline=date.today()))
    db_session.add(ProjectDocument(id=f"{nom}-d", project_id=nom, type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="RC sample text. " * 50))
    db_session.commit()
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", lambda self, *a, **k: {
        "requirements": [{"exigence": "Fournir un Kbis", "source_document": "RC", "source_page": 1,
                          "source_excerpt": "Le candidat fournira un extrait Kbis",
                          "category": "candidature", "priority": "obligatoire"}],
        "criteres_jugement": [], "infos_marche": {}})

    async def _match(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _match)
    assert client.post(f"/api/projects/{nom}/analyze").status_code == 200
    _join_analysis_threads()
    db_session.expire_all()
    return db_session.query(Project).filter_by(id=nom).one()


def test_l_analyse_calcule_les_ancres_a_la_fin(client, db_session, test_org, monkeypatch):
    appels = []
    monkeypatch.setattr(ancres_projet, "calculer_et_stocker", lambda db, pid, *a, **k: appels.append(pid) or {})
    projet = _lancer_analyse(client, db_session, test_org, monkeypatch, "p-fin-ok")
    assert projet.status == "analyzed" and appels == ["p-fin-ok"]


def test_un_calcul_d_ancres_qui_leve_ne_casse_pas_l_analyse(client, db_session, test_org, monkeypatch):
    def leve(*a, **k):
        raise RuntimeError("boum")
    monkeypatch.setattr(ancres_projet, "calculer_et_stocker", leve)
    projet = _lancer_analyse(client, db_session, test_org, monkeypatch, "p-fin-ko")
    assert projet.status == "analyzed" and projet.processing_status == "ready"
    assert db_session.query(ComplianceItem).filter_by(project_id="p-fin-ko").count() == 1
