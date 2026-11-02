"""Recette du 2/11 : R27 (pages annoncées à l'export) et R28 (dossiers vides dans le ZIP). Contenu inventé.

R27 — l'écran d'export annonçait 38 pages pour un PDF de 46 (et 35 pour 43 sur le mémoire réel du 2/11) :
l'estimation comptait les mots du JSON entier, à 500 mots par page. Mesuré sur ces deux mémoires réels :
~450 mots de texte par page de corps, plus la page de garde et le sommaire → 2 + arrondi(mots / 450) donne
43 et 46, les vrais nombres.
R28 — le ZIP ne crée plus de dossier vide (« 01_Candidature/ », « 03_Technique/ » sans fichier)."""
import io
import zipfile

from models.memoire import MemoireTechnique
from models.project import Project
from routers.export import pages_estimees


def _mots(n: int) -> str:
    return " ".join(["mot"] * n)


def test_pages_estimees_sur_le_texte_et_non_sur_le_json():
    # 18 314 et 19 809 mots de texte : les deux mémoires réels du 2/11 (43 et 46 pages de PDF)
    assert pages_estimees({"preambule": _mots(314), "partie_a": {"a": _mots(18000)}}) == 43
    assert pages_estimees({"preambule": _mots(809), "partie_b": {"b": _mots(19000)}}) == 46
    # clés internes (« _… ») et noms de clés jamais comptés
    assert pages_estimees({"preambule": _mots(450), "_etat": {"x": _mots(9000)}}) == 3
    assert pages_estimees({}) == 2


def test_zip_sans_dossier_vide(client, db_session, test_org):
    db_session.add(Project(id="proj-r28", organization_id=test_org.id, name="AO fictif R28",
                           selected_lot_name="Lot fictif"))
    db_session.add(MemoireTechnique(id="mem-r28", project_id="proj-r28", version=1, content_json={
        "preambule": "Préambule fictif.", "partie_a": {"implantation": "Siège fictif."},
        "partie_b": {}, "partie_c": {}}))
    db_session.commit()
    resp = client.get("/api/projects/proj-r28/export/zip")
    assert resp.status_code == 200, resp.text
    noms = zipfile.ZipFile(io.BytesIO(resp.content)).namelist()
    dossiers = [n for n in noms if n.endswith("/")]
    for d in dossiers:
        assert any(n.startswith(d) and n != d for n in noms), f"dossier vide dans le ZIP : {d}"
    assert any("/02_Offre/Memoire_technique." in n for n in noms)
    assert not any("01_Candidature" in n or "03_Technique" in n for n in noms)
