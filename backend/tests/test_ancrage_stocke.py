"""Bloc 2, tranche 4 — niveau et score de l'ancrage stockés, extrait d'origine de l'IA gardé.

Avant : l'extrait de l'IA était écrasé par le passage ancré, et ni le niveau
atteint ni le score n'étaient gardés. La qualité de l'ancrage ne pouvait pas se
mesurer en production (G2 l'a jugée à la main sur 40 exigences).

Désormais, par exigence : source_excerpt_ia (extrait d'origine de l'IA),
ancrage_niveau (exact, normalise, segment, recupere ; aucun = pas de source)
et ancrage_score. Chaînes inventées.
"""
from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from services.ai.excerpt_anchor import anchor_requirements

CCTP = ("ARTICLE 1 – ENDUIT\nL’enduit sera appliqué en deux passes sur un support sain et sec.\n"
        "ARTICLE 2 – ISOLATION\nLes panneaux isolants en laine de roche sont fixés par chevilles métalliques.\n")


def _req(extrait):
    return {"exigence": "x", "source_document": "CCTP", "source_page": None, "source_excerpt": extrait}


def test_niveau_score_et_extrait_d_origine():
    reqs = [_req("L’enduit sera appliqué en deux passes sur un support sain et sec."),
            _req("L'enduit sera appliqué en deux passes sur un support sain et sec."),
            _req("panneaux isolants en laine de roche fixés par chevilles"),
            _req("Les menuiseries seront livrées avec leurs fiches techniques.")]
    origines = [r["source_excerpt"] for r in reqs]
    anchor_requirements(reqs, {"CCTP lot 05.pdf": CCTP})
    assert [r["ancrage_niveau"] for r in reqs] == ["exact", "normalise", "recupere", "aucun"]
    assert [r["source_excerpt_ia"] for r in reqs] == origines
    assert reqs[0]["ancrage_score"] == 1.0 and reqs[1]["ancrage_score"] == 1.0
    assert 0.55 <= reqs[2]["ancrage_score"] <= 1.0
    assert reqs[3]["ancrage_score"] is None and reqs[3]["source_excerpt"] is None


def test_un_second_ancrage_garde_l_extrait_d_origine():
    reqs = [_req("L'enduit sera appliqué en deux passes sur un support sain et sec.")]
    anchor_requirements(reqs, {"CCTP lot 05.pdf": CCTP})
    anchor_requirements(reqs, {"CCTP lot 05.pdf": CCTP})
    assert reqs[0]["source_excerpt_ia"] == "L'enduit sera appliqué en deux passes sur un support sain et sec."


def test_les_trois_colonnes_sont_enregistrees(db_session, test_org):
    from routers.analysis import _anchor_requirements_safe, _persist_scope
    db_session.add(Project(id="proj-ancrage-stocke", organization_id=test_org.id, name="X"))
    db_session.add(ProjectDocument(project_id="proj-ancrage-stocke", type="cctp", file_url="x",
                                   file_name="cctp lot 05.pdf", related_lots=["5"], extracted_text=CCTP * 2))
    db_session.commit()
    reqs = [_req("panneaux isolants en laine de roche fixés par chevilles"),
            _req("Les menuiseries seront livrées avec leurs fiches techniques.")]
    _anchor_requirements_safe(db_session, "proj-ancrage-stocke", reqs, "lot5")
    _persist_scope(db_session, "proj-ancrage-stocke", reqs, "lot5")
    rows = db_session.query(ComplianceItem).filter_by(project_id="proj-ancrage-stocke").all()
    par_ia = {r.source_excerpt_ia: r for r in rows}
    ancree = par_ia["panneaux isolants en laine de roche fixés par chevilles"]
    assert ancree.ancrage_niveau == "recupere" and ancree.ancrage_score >= 0.55
    assert "laine de roche" in ancree.source_excerpt
    sans = par_ia["Les menuiseries seront livrées avec leurs fiches techniques."]
    assert sans.ancrage_niveau == "aucun" and sans.ancrage_score is None and sans.source_excerpt is None


def test_migration_0024_a_la_suite_des_existantes():
    from pathlib import Path
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    script = ScriptDirectory.from_config(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini")))
    assert script.get_revision("0024").down_revision == "0023"
    assert script.get_revision("0025").down_revision == "0024"    # sujet A : colonne `ancre`
