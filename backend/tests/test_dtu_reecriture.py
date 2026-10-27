"""DEC-2 — une seule règle DTU partout où l'IA écrit le mémoire (décision de Mohamed
du 27/10) : la réécriture de paragraphe reçoit la même liste fermée et sa sortie passe
par le même garde-fou que la génération. Client Anthropic simulé : aucun appel réel,
chaînes inventées."""
from types import SimpleNamespace

import pytest

from models.project import Project, ProjectDocument
from services.ai.dtu_autorises import regle_dtu


def _docs():
    return [
        SimpleNamespace(type="cctp", file_name="cctp 5.pdf", related_lots=["5"],
                        extracted_text="Pose selon NF DTU 41.2.", is_user_completed=False),
        SimpleNamespace(type="autre", file_name="annexe 00.pdf", related_lots=["0"],
                        extracted_text="ARTICLE 1\nLOT PEINTURE\nSelon NF DTU 59.1.\n"
                                       "ARTICLE 2\nLOT FAÇADE\nSelon NF DTU 20.1.",
                        is_user_completed=False),
    ]


def _regle():
    return regle_dtu(_docs(), "lot5", "Lot 05 — Façade")


class _FauxClient:
    """Imite anthropic.Anthropic : enregistre la requête, renvoie le texte voulu."""
    dernier = None
    texte = ""

    def __init__(self, *a, **kw):
        self.messages = self

    def create(self, **kwargs):
        type(self).dernier = kwargs
        return SimpleNamespace(content=[SimpleNamespace(text=type(self).texte)])


@pytest.fixture
def faux_anthropic(monkeypatch):
    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", _FauxClient)
    _FauxClient.dernier = None
    return _FauxClient


def test_la_regle_unique_donne_consigne_et_garde_fou():
    regle = _regle()
    assert regle.numeros() == {"20.1", "41.2"}
    assert "NF DTU 20.1" in regle.consigne() and "NF DTU 59.1" not in regle.consigne()
    texte, retires = regle.garde_texte("Selon NF DTU 41.2 et NF DTU 59.1.")
    assert texte == "Selon NF DTU 41.2."
    assert retires == ["59.1"]
    memo = {"partie_a": {"x": "Conforme au NF DTU 59.1."}, "_generation_meta": {}}
    meta = regle.garde_contenu(memo)
    assert meta["retraits"] == 1 and meta["retires"] == ["59.1"]
    assert "59.1" not in memo["partie_a"]["x"]


def test_generateur_et_reecriture_partagent_le_meme_point_d_entree():
    import routers.memoire as routeur
    import services.ai.dtu_autorises as dtu
    import services.ai.memoire_generator as gen
    assert gen.regle_dtu is dtu.regle_dtu
    assert routeur.regle_dtu is dtu.regle_dtu


@pytest.mark.asyncio
async def test_reecriture_retire_le_dtu_non_autorise_et_garde_l_autorise(faux_anthropic):
    from services.ai.passage_rewriter import rewrite_passage
    faux_anthropic.texte = "Le support est traité selon le NF DTU 59.1 puis posé selon le NF DTU 41.2."
    out = await rewrite_passage("Passage d'origine.", "plus_technique", None, _regle())
    assert "59.1" not in out
    assert "NF DTU 41.2" in out
    assert out == "Le support est traité selon les règles de l'art puis posé selon le NF DTU 41.2."


@pytest.mark.asyncio
async def test_reecriture_recoit_la_liste_fermee_sans_temperature(faux_anthropic):
    from services.ai.passage_rewriter import rewrite_passage
    faux_anthropic.texte = "Passage réécrit."
    await rewrite_passage("Passage d'origine.", "reformuler", None, _regle())
    req = faux_anthropic.dernier
    assert req["model"] == "claude-opus-4-7"
    assert "temperature" not in req          # dépréciée pour Opus 4.7 : 400
    contenu = req["messages"][0]["content"]
    assert "LISTE DES DTU AUTORISÉS" in contenu
    assert "NF DTU 41.2" in contenu and "NF DTU 59.1" not in contenu
    assert "Passage d'origine." in contenu


@pytest.mark.asyncio
async def test_reecriture_liste_vide_aucun_dtu_cite(faux_anthropic):
    from services.ai.passage_rewriter import rewrite_passage
    faux_anthropic.texte = "Pose conforme au NF DTU 41.2."
    out = await rewrite_passage("Texte.", "reformuler", None, regle_dtu([], "lot5", "Lot 05 — Façade"))
    assert out == "Pose conforme aux règles de l'art."
    assert "ne cite AUCUN" in faux_anthropic.dernier["messages"][0]["content"]


def test_endpoint_applique_la_regle_du_projet(client, db_session, test_org, faux_anthropic, monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)
    db_session.add(Project(id="proj-dec2", organization_id=test_org.id, name="AO DEC2",
                           selected_lot="lot5", selected_lot_name="Lot 05 — Façade"))
    db_session.flush()
    for d in _docs():
        db_session.add(ProjectDocument(project_id="proj-dec2", type=d.type, file_url="x",
                                       file_name=d.file_name, extracted_text=d.extracted_text,
                                       related_lots=d.related_lots))
    db_session.commit()
    faux_anthropic.texte = "Selon le NF DTU 59.1 et le NF DTU 20.1."
    resp = client.post("/api/projects/proj-dec2/memoire/rewrite-passage",
                       json={"passage": "Texte.", "action": "plus_technique"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["rewritten"] == "Selon les règles de l'art et le NF DTU 20.1."
    assert "NF DTU 20.1" in faux_anthropic.dernier["messages"][0]["content"]
