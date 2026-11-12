"""Second test de bout en bout (rapport E2E-2, bug 2) : un lot déjà analysé doit pouvoir être rouvert sans être relu.

Le front a besoin de savoir quels lots sont déjà analysés : la réponse du projet porte `lots_analyses`, lu sur les champs
critiques posés PAR LOT à la fin de chaque lecture (`routers/analysis.py`, C5). Données inventées.
"""
from datetime import datetime
from types import SimpleNamespace

from schemas.project import ProjectResponse


def _projet(critical_fields):
    return SimpleNamespace(
        id="p-e2e2", organization_id="o-e2e2", name="AO inventé", status="analyzed", deadline=None, maitre_ouvrage=None,
        current_step=6, completed_steps={"2": True}, criteres_jugement=None, infos_marche=None,
        lots_detectes=[{"id": "lot01", "nom": "Lot 01"}, {"id": "lot02", "nom": "Lot 02"}],
        selected_lot="lot01", selected_lot_name="Lot 01", processing_status="ready", processing_progress=0,
        processing_detail=None, created_at=datetime(2026, 11, 1), updated_at=datetime(2026, 11, 1), depose_at=None,
        critical_fields=critical_fields,
    )


def test_les_lots_deja_analyses_sont_dans_la_reponse_du_projet():
    r = ProjectResponse.model_validate(_projet({"lot02": {}, "lot01": {}})).model_dump()
    assert r["lots_analyses"] == ["lot01", "lot02"]
    assert "critical_fields" not in r, "les champs critiques eux-mêmes ne sont toujours pas renvoyés"


def test_dossier_sans_lots_ou_jamais_lu_aucun_lot_analyse():
    assert ProjectResponse.model_validate(_projet(None)).model_dump()["lots_analyses"] == []
    assert ProjectResponse.model_validate(_projet({"_all": {}})).model_dump()["lots_analyses"] == [], \
        "le dossier entier (« _all ») n'est pas un lot à rouvrir"
