"""Script de réétiquetage des pièces déjà en base (backend/scripts/reetiqueter_pieces.py).

Les règles du bloc 2 (type avant le nom, mots entiers, lot 00 commun) ne valent
qu'aux nouveaux dépôts. Le script compte d'abord ce qui changerait, et n'écrit
que sur demande.
"""
import importlib.util
import sys
from datetime import datetime
from pathlib import Path

import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "reetiqueter_pieces.py"


@pytest.fixture
def script(monkeypatch):
    spec = importlib.util.spec_from_file_location("reetiqueter_pieces", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)   # requis par @dataclass
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def base(db_session, test_org):
    db = db_session
    db.add(Project(id="p-actif", organization_id=test_org.id, name="AO"))
    db.add(Project(id="p-supprime", organization_id=test_org.id, name="AO supprimé",
                   deleted_at=datetime.utcnow()))

    def piece(pid, doc_id, nom, type_, lots, texte="x" * 100, entreprise=False):
        db.add(ProjectDocument(id=doc_id, project_id=pid, file_url=f"/uploads/{doc_id}",
                               file_name=nom, type=type_, related_lots=lots,
                               extracted_text=texte, is_user_completed=entreprise))

    piece("p-actif", "d-plomberie", "Ecole_lot 10 Plomberie Sanitaires_DCE.pdf", "cctp", ["info"],
          texte="y" * 1000)
    piece("p-actif", "d-generalites", "Ecole_lot 00 Généralités_DCE.pdf", "cctp", ["0"])
    piece("p-actif", "d-notice", "Notice de sécurité.pdf", "autre", ["all"], texte="z" * 300)
    piece("p-actif", "d-stable", "CCTP lot 05.pdf", "cctp", ["5"])
    piece("p-actif", "d-entreprise", "DPGF_lot 10 Plomberie.xlsx", "dpgf_template", ["info"],
          entreprise=True)
    piece("p-supprime", "d-ailleurs", "Ecole_lot 10 Plomberie.pdf", "cctp", ["info"])
    db.add(ComplianceItem(project_id="p-actif", exigence_text="Exigence"))
    db.commit()
    return db


def _etiquette(db, doc_id):
    db.expire_all()
    return db.get(ProjectDocument, doc_id).related_lots


def test_comptage_par_defaut_sans_rien_ecrire(script, base):
    lignes = []
    bilan = script.examiner(base, detail=True, sortie=lignes.append)

    assert bilan.examinees == 4          # ni pièce de l'entreprise, ni projet supprimé
    assert bilan.inchangees == 1
    assert bilan.changees == 3
    assert (bilan.rendues, bilan.caracteres_rendus) == (1, 1000)   # le CCTP Plomberie
    assert (bilan.retirees, bilan.caracteres_retires) == (1, 300)  # la notice de sécurité
    assert bilan.autres == 1                                       # lot 00 → commun
    assert bilan.projets_analyses == {"p-actif"}
    assert bilan.ecrites == 0
    assert _etiquette(base, "d-plomberie") == ["info"]             # rien n'est écrit
    assert len(lignes) == 3 and any("Plomberie" in l and "['10']" in l for l in lignes)


def test_ecrire_met_a_jour_les_etiquettes(script, base):
    bilan = script.examiner(base, ecrire=True)
    assert bilan.ecrites == 3
    assert _etiquette(base, "d-plomberie") == ["10"]
    assert _etiquette(base, "d-generalites") == ["all"]
    assert _etiquette(base, "d-notice") == ["info"]
    assert _etiquette(base, "d-entreprise") == ["info"]     # hors périmètre, intacte
    assert _etiquette(base, "d-ailleurs") == ["info"]       # projet supprimé, intact


def test_ligne_de_commande_en_comptage_seul(script, base, capsys):
    assert script.main([]) == 0
    sortie = capsys.readouterr().out
    assert "rien n'est écrit" in sortie and "étiquette modifiée : 3" in sortie
    assert _etiquette(base, "d-plomberie") == ["info"]
    with pytest.raises(SystemExit):
        script.main(["--dry-run", "--ecrire"])
