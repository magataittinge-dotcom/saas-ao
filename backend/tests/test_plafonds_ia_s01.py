"""S-01 (audit de sécurité, P0) — « Importer un mémoire » et « Reformuler » ont un plafond par organisation et par jour.

Sur le modèle de « Refaire » : compteur de lignes d'audit sur 24 heures glissantes, vérifié ET inscrit avant l'appel au
modèle (un appel qui échoue compte quand même), 429 avec un message sans mot technique. Le coût de l'import est inscrit
dans `couts_ia`. Modèles simulés : aucun appel réel."""
import io
from datetime import datetime, timedelta

import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA

DOCX = b"PK\x03\x04" + b"\x00" * 2000
MSG = "Plafond du jour atteint pour cette action. Il se remet à zéro demain."


@pytest.fixture
def faux_import(monkeypatch):
    import routers.memoire_config as mc
    etat = {"n": 0, "echec": False}

    class FauxImporteur:
        def __init__(self):
            self.usage = None

        async def extract(self, text):
            etat["n"] += 1
            self.usage = {"input_tokens": 20_000, "output_tokens": 3_000}
            if etat["echec"]:
                raise ValueError("réponse illisible")
            return {"presentation": "x"}

    class FauxProcesseur:
        def extract(self, content, filename):
            return ("Mémoire technique inventé pour le test. " * 20, None)

    monkeypatch.setattr(mc, "MemoireImporter", FauxImporteur)
    monkeypatch.setattr(mc, "DocumentProcessor", FauxProcesseur)
    return etat


@pytest.fixture
def faux_haiku(monkeypatch):
    import services.ai.profile_structurer as ps
    etat = {"n": 0}

    def faux(text):
        etat["n"] += 1
        return {"materiel": "3 camions benne"}, {"input_tokens": 2600, "output_tokens": 1500}
    monkeypatch.setattr(ps, "_call_haiku", faux)
    return etat


def _importer(client):
    return client.post("/api/memoire-config/import", files={"file": (
        "m.docx", io.BytesIO(DOCX), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})


def _reformuler(client):
    return client.post("/api/memoire-config/structure-text", json={"text": "On a 3 camions benne. " * 20})


def test_le_sixieme_import_du_jour_est_refuse_sans_appel(client, faux_import):
    codes = [_importer(client).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]
    assert faux_import["n"] == 5
    r = _importer(client)
    assert r.status_code == 429 and r.json()["detail"] == MSG


def test_un_import_en_echec_compte_quand_meme(client, faux_import, db_session, test_org):
    faux_import["echec"] = True
    codes = [_importer(client).status_code for _ in range(6)]
    assert codes[:5] == [500] * 5 and codes[5] == 429
    assert faux_import["n"] == 5
    assert db_session.query(AuditLog).filter(AuditLog.action == "memoire_config.import").count() == 5


def test_le_cout_de_l_import_est_inscrit(client, faux_import, db_session, test_org):
    assert _importer(client).status_code == 200
    ligne = db_session.query(CoutIA).filter(CoutIA.usage == "import_memoire").one()
    assert ligne.organization_id == test_org.id and ligne.modele == "claude-sonnet-4-6"
    assert ligne.jetons_entree == 20_000 and ligne.jetons_sortie == 3_000
    assert ligne.cout_usd == pytest.approx((20_000 * 3 + 3_000 * 15) / 1_000_000)


def test_le_cout_d_un_import_en_echec_est_inscrit_aussi(client, faux_import, db_session):
    faux_import["echec"] = True
    assert _importer(client).status_code == 500
    assert db_session.query(CoutIA).filter(CoutIA.usage == "import_memoire").count() == 1


def test_la_31e_reformulation_du_jour_est_refusee(client, faux_haiku):
    codes = [_reformuler(client).status_code for _ in range(31)]
    assert codes == [200] * 30 + [429]
    assert faux_haiku["n"] == 30
    assert _reformuler(client).json()["detail"] == MSG


def test_plafonds_reglables_et_fenetre_de_24_heures(client, faux_haiku, db_session, test_org, monkeypatch):
    monkeypatch.setenv("REFORMULER_MAX_PAR_JOUR", "2")
    # Deux reformulations d'avant-hier ne comptent plus.
    for _ in range(2):
        db_session.add(AuditLog(organization_id=test_org.id, action="memoire_config.reformuler",
                                created_at=datetime.utcnow() - timedelta(hours=25)))
    db_session.commit()
    assert [_reformuler(client).status_code for _ in range(3)] == [200, 200, 429]
    assert faux_haiku["n"] == 2


def test_plafond_a_zero_coupe_le_plafond(client, faux_import, monkeypatch):
    monkeypatch.setenv("IMPORT_MEMOIRE_MAX_PAR_JOUR", "0")
    assert all(_importer(client).status_code == 200 for _ in range(7))


def test_les_plafonds_sont_par_organisation(client, faux_haiku, db_session, monkeypatch):
    monkeypatch.setenv("REFORMULER_MAX_PAR_JOUR", "1")
    db_session.add(AuditLog(organization_id="une-autre-org", action="memoire_config.reformuler",
                            created_at=datetime.utcnow()))
    db_session.commit()
    assert _reformuler(client).status_code == 200


def test_une_limite_par_minute_est_posee():
    from routers import memoire_config as mc
    from services.rate_limit import limiter
    noms = {f"{mc.__name__}.{f.__name__}" for f in (mc.import_memoire, mc.structure_text)}
    assert noms <= set(limiter._route_limits)
