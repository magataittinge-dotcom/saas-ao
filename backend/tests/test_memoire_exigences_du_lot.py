"""Le mémoire reçoit TOUTES les exigences du lot choisi (bloc 3, tranche A).

Avant : `compliance_items[:80]` — le générateur ne voyait que les 80 premières
exigences, et le routeur lui passait celles de tous les lots. Données inventées.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from models.compliance_item import ComplianceItem
from models.project import Project
from services.exigences import exigences_pour_memoire
from tests.test_memoire_generator_segments import (
    _build_side_effect, _make_org, _run,
)
from services.ai.memoire_generator import MemoireGenerator


def _exi(i, category="technique", priority="obligatoire", lot=None):
    return SimpleNamespace(
        category=category, priority=priority, lot=lot,
        exigence_text=f"Exigence fictive numéro {i:03d} du chantier",
    )


async def _appels(items):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    import pytest as _p
    mp = _p.MonkeyPatch()
    mp.setattr(gen.client.messages, "stream", side_effect)
    try:
        await gen.generate(
            organization=_make_org(), memoire_config=None, project_name="Projet Test",
            maitre_ouvrage="MOA Test", selected_lot_name="Lot 02 - Étanchéité",
            all_docs=[SimpleNamespace(type="cctp", file_name="cctp.pdf",
                                      extracted_text="Texte CCTP.")],
            compliance_items=items, references=[], variables={},
            criteres_jugement=[], reference_template_text=None, project_id=None,
        )
    finally:
        mp.undo()
    return calls["kwargs"]


@pytest.mark.asyncio
async def test_les_120_exigences_sont_dans_le_contexte():
    items = [_exi(i) for i in range(120)]
    kwargs = await _appels(items)
    dynamique = kwargs[0]["messages"][0]["content"][1]["text"]
    for i in range(120):
        assert f"Exigence fictive numéro {i:03d} du chantier" in dynamique


@pytest.mark.asyncio
async def test_ordre_categorie_puis_ordre_d_origine():
    items = [
        _exi(1, "candidature"), _exi(2, "technique"), _exi(3, "planning"),
        _exi(4, "technique"), _exi(5, "offre"), _exi(6, "technique"),
    ]
    kwargs = await _appels(items)
    dyn = kwargs[0]["messages"][0]["content"][1]["text"]
    pos = [dyn.index(f"numéro {i:03d}") for i in (2, 4, 6, 3, 5, 1)]
    assert pos == sorted(pos)


@pytest.mark.asyncio
async def test_la_liste_reste_dans_la_partie_variable_le_prefixe_cache_est_inchange():
    sans = await _appels([])
    avec = await _appels([_exi(i) for i in range(120)])
    for a, b in zip(sans, avec):
        assert a["system"] == b["system"]
        ca, cb = a["messages"][0]["content"], b["messages"][0]["content"]
        assert ca[0] == cb[0]                      # profil + références (cache)
        assert "numéro 000" in cb[1]["text"]       # liste dans le bloc variable
        assert cb[1]["cache_control"] == {"type": "ephemeral"}
        assert "numéro 000" not in cb[0]["text"] and "numéro 000" not in cb[-1]["text"]


def test_forme_compacte_un_titre_par_categorie():
    from services.ai.memoire_generator import _exigences_compactes
    items = [_exi(i) for i in range(10)] + [_exi(10, "planning")]
    texte = _exigences_compactes(items)
    assert texte.count("[TECHNIQUE]") == 0       # plus de préfixe répété sur chaque ligne
    assert texte.count("TECHNIQUE") == 1 and texte.count("PLANNING") == 1
    assert _exigences_compactes([]) == ""


def test_exigence_multiligne_tient_sur_une_ligne():
    from services.ai.memoire_generator import _exigences_compactes
    it = SimpleNamespace(category="technique", priority="obligatoire",
                         exigence_text="Ligne un\n   ligne deux\n\nligne trois")
    assert "- Ligne un ligne deux ligne trois" in _exigences_compactes([it])


def test_perimetre_du_lot_commun_plus_propre_pas_les_autres(db_session, test_org):
    db = db_session
    db.add(Project(id="p-lot", organization_id=test_org.id, name="AO", selected_lot="lot5"))
    t0 = datetime(2026, 1, 1)
    n = 0
    for lot, nb in (("lot5", 120), ("_commun", 20), ("lot6", 30), (None, 3)):
        for _ in range(nb):
            n += 1
            db.add(ComplianceItem(
                project_id="p-lot", exigence_text=f"E{n:03d} {lot}", category="technique",
                priority="obligatoire", status="non_couvert", lot=lot,
                created_at=t0 + timedelta(seconds=n),
            ))
    db.commit()
    projet = db.query(Project).filter(Project.id == "p-lot").one()
    res = exigences_pour_memoire(db, projet)
    assert len(res) == 120 + 20 + 3
    assert not any(r.lot == "lot6" for r in res)
    # ordre d'origine (création) conservé
    assert [r.created_at for r in res] == sorted(r.created_at for r in res)
