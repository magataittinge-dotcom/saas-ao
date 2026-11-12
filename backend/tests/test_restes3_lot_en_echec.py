"""RESTES-3 (PARCOURS-2, décision) — un lot en échec dans une analyse à plusieurs lots ne compte pas « Analysé ».

`lots_analyses` (écran Lots : « Ouvrir ce lot », aucune unité) se lit sur les champs critiques rangés PAR LOT à la fin
de l'analyse : seuls les lots réellement livrés y sont rangés ; le lot en échec (unité rendue) reste à analyser.
Analyse simulée (aucun appel), textes inventés."""
from datetime import date

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from schemas.project import ProjectResponse

PID = "p-r3-echec"
EXIGENCE = {"exigence": "Fournir un planning prévisionnel (exigence inventée).", "category": "technique",
            "priority": "obligatoire"}


class _AnalyseurSimule:
    """Passe 1 et lot 1 livrés ; la lecture du lot 2 tombe en panne."""

    def _run_pass_chunked(self, texte, systeme, etiquette, *a, **kw):
        if etiquette == "passe2-lot2":
            raise RuntimeError("panne simulée sur le lot 2")
        if etiquette == "passe1-admin":
            return {"requirements": [dict(EXIGENCE)], "criteres_jugement": [], "infos_marche": {}}
        return {"requirements": [dict(EXIGENCE, exigence=f"Exigence inventée ({etiquette}).")]}


def _spec(lot_id):
    return {"lot_id": lot_id, "lot_label": f"Lot {lot_id[-1]}", "lot_header": "", "pass2_commun": "",
            "pass2_text": f"CCTP inventé du {lot_id}. " * 5}


def test_un_lot_en_echec_n_est_pas_range_comme_analyse(db_session, test_org, monkeypatch):
    from routers import analysis
    from services.ai import checklist_matcher

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    monkeypatch.setattr(analysis, "DCEAnalyzer", _AnalyseurSimule)
    db_session.add(Project(id=PID, organization_id=test_org.id, name="AO inventé", deadline=date(2027, 3, 1),
                           status="en_cours", selected_lot="lot1",
                           lots_detectes=[{"id": "lot1", "nom": "Lot 1"}, {"id": "lot2", "nom": "Lot 2"}]))
    db_session.add(ProjectDocument(project_id=PID, type="rc", file_url="x", file_name="rc-invente.pdf",
                                   extracted_text="Règlement inventé pour le test. " * 20))
    db_session.commit()

    analysis._run_analysis_job_corps(PID, test_org.id, "Règlement inventé. " * 5, [_spec("lot1"), _spec("lot2")],
                                     1, 1, [], {})

    db_session.expire_all()
    projet = db_session.get(Project, PID)
    assert projet.status == "analyzed", projet.status
    lots_livres = {c.lot for c in db_session.query(ComplianceItem).filter(ComplianceItem.project_id == PID)}
    assert "lot1" in lots_livres and "lot2" not in lots_livres
    assert ProjectResponse.model_validate(projet).model_dump()["lots_analyses"] == ["lot1"]
