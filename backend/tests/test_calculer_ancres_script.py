"""RESTES-2, point 4 — la commande de déploiement qui calcule les ancres des anciens AO
(backend/scripts/calculer_ancres.py). Simulation par défaut : rien n'est écrit. AO, pièces
et textes inventés."""
import importlib.util
import sys
from datetime import datetime
from pathlib import Path

import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from services import file_storage, pdfium_processus
from tests.pdf_fabrique import pdf_texte

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "calculer_ancres.py"

P1 = "Les garde-corps du belvédère sont scellés chimiquement dans la dalle."
P2 = "Le lasurage des bardages est repris en deux couches croisées."


@pytest.fixture(autouse=True)
def _processus_propres():
    pdfium_processus.arreter()
    yield
    pdfium_processus.arreter()


@pytest.fixture
def script(monkeypatch):
    spec = importlib.util.spec_from_file_location("calculer_ancres", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)   # requis par @dataclass
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def base(db_session, test_org, tmp_path, monkeypatch):
    """Deux anciens AO (sans ancres) et un AO supprimé. AO 1 : un CCTP de deux pages et une
    exigence dont la pièce n'est pas dans le dossier ; AO 2 : un CCAP ; une exigence déjà ancrée."""
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    db = db_session
    for pid, nom, pages in (("p-vieux1", "cctp.pdf", ["Préambule.", P1 + "\n" + P2]),
                            ("p-vieux2", "ccap.pdf", [P2]),
                            ("p-suppr", "cctp.pdf", [P1])):
        dossier = tmp_path / "projects" / pid
        dossier.mkdir(parents=True)
        (dossier / nom).write_bytes(pdf_texte(pages))
        db.add(Project(id=pid, organization_id=test_org.id, name="AO inventé",
                       deleted_at=datetime.utcnow() if pid == "p-suppr" else None))
        db.add(ProjectDocument(id=f"d-{pid}", project_id=pid, type=nom[:4], file_name=nom,
                               file_url=f"/uploads/projects/{pid}/{nom}"))

    def exigence(id_, pid, doc, page, extrait, ancre=None):
        db.add(ComplianceItem(id=id_, project_id=pid, exigence_text="e", source_document=doc,
                              source_page=page, source_excerpt=extrait, ancre=ancre))
    exigence("e1", "p-vieux1", "cctp.pdf", 2, P1)
    exigence("e2", "p-vieux1", "cctp.pdf", 2, P2)
    exigence("e3", "p-vieux1", "Annexe inventée p. 4", 4, "Un passage d'une pièce absente du dossier")
    exigence("e4", "p-vieux1", "cctp.pdf", 2, None)                    # non sourcée : ignorée
    exigence("e5", "p-vieux2", "ccap.pdf", 1, P2)
    exigence("e6", "p-vieux2", "ccap.pdf", 1, P2, ancre={"version": 1, "niveau": "page"})   # déjà ancrée
    exigence("e7", "p-suppr", "cctp.pdf", 1, P1)                       # AO supprimé : ignoré
    db.commit()
    return db


def _ancres(db):
    db.expire_all()
    return {c.id: c.ancre for c in db.query(ComplianceItem).all()}


def test_simulation_par_defaut_compte_et_n_ecrit_rien(script, base):
    lignes: list[str] = []
    bilan = script.examiner(base, sortie=lignes.append)
    assert (bilan.projets, bilan.exigences, bilan.pieces, bilan.sans_piece) == (2, 4, 2, 1)
    assert bilan.ancres == 0 and lignes == []
    ancres = _ancres(base)
    assert [k for k, v in ancres.items() if v is not None] == ["e6"]


def test_ecrire_calcule_les_ancres_manquantes_piece_par_piece(script, base):
    lignes: list[str] = []
    bilan = script.examiner(base, ecrire=True, sortie=lignes.append)
    assert bilan.ancres == 3 and bilan.echecs == 0
    assert bilan.passage == 3
    ancres = _ancres(base)
    assert ancres["e1"]["niveau"] == "passage" and ancres["e1"]["page"] == 2
    assert ancres["e5"]["doc_id"] == "d-p-vieux2"
    assert ancres["e3"] is None and ancres["e4"] is None and ancres["e7"] is None   # repli, non sourcée, supprimé
    assert ancres["e6"] == {"version": 1, "niveau": "page"}                        # jamais recalculée
    assert len(lignes) == 2 and all(l.startswith("  AO p-vieux") for l in lignes)
    # relancer ne refait rien : il ne reste que l'exigence sans pièce lisible
    again = script.examiner(base)
    assert (again.projets, again.exigences, again.pieces, again.sans_piece) == (1, 1, 0, 1)


def test_projet_limite_a_un_seul_ao(script, base):
    bilan = script.examiner(base, projet="p-vieux2", ecrire=True, sortie=lambda _l: None)
    assert (bilan.projets, bilan.ancres) == (1, 1)
    ancres = _ancres(base)
    assert ancres["e1"] is None and ancres["e5"] is not None


def test_main_en_simulation_par_defaut(script, base, monkeypatch, capsys):
    import database
    monkeypatch.setattr(database, "SessionLocal", lambda: base)
    monkeypatch.setattr(base, "close", lambda: None)
    assert script.main([]) == 0
    sortie = capsys.readouterr().out
    assert "simulation : rien n'est calculé ni écrit" in sortie
    assert "exigences sourcées sans ancre : 4" in sortie
    assert [k for k, v in _ancres(base).items() if v is not None] == ["e6"]
