"""
Tests C18 — Synorix Score go/no-go (déterministe, 0 € API, 0 LLM).

Croisement factuel : données extraites du DCE × profil org (Mon entreprise
+ coffre-fort). Chaque composante = statut ok/warning/ko/non_evaluable +
explication + source. Profil incomplet → non_evaluable NEUTRE (exclue du
score, jamais pénalisante à tort) avec action « compléter mon profil ».
Jamais de commentaire prix.
"""
from datetime import date, timedelta

import pytest


class _Req:
    def __init__(self, text, source_document="RC.pdf", source_page=3):
        self.exigence_text = text
        self.source_document = source_document
        self.source_page = source_page


class _VaultDoc:
    def __init__(self, doc_type, status="valid"):
        self.type = doc_type
        self.status = status


class _Cfg:
    def __init__(self, ca=None):
        self.chiffre_affaires = ca


def _cf(remise=None):
    return {
        "date_limite_remise": {"value": {"date": remise, "heure": None} if remise else None, "source": None},
        "penalites": {"value": None, "source": None},
    }


FUTURE_30 = (date.today() + timedelta(days=30)).isoformat()
FUTURE_5 = (date.today() + timedelta(days=5)).isoformat()

CA_REQ = _Req("Chiffre d'affaires annuel minimum exigé : 600 000 € HT sur les trois derniers exercices.")
QUALIBAT_REQ = _Req("Le candidat devra justifier de la qualification QUALIBAT 2112 ou équivalente.")


def _build(reqs=(), cfg=None, vault=(), criteres=None, cf=None, infos=None):
    from services.synorix_score import build_score
    return build_score(
        memoire_config=cfg,
        vault_docs=list(vault),
        compliance_items=list(reqs),
        criteres_jugement=criteres,
        critical_fields=cf or _cf(FUTURE_30),
        infos_marche=infos or {},
    )


def _comp(result, cid):
    return next(c for c in result["composantes"] if c["id"] == cid)


# ─── Composante CA ───────────────────────────────────────────────────────────

def test_ca_sufficient():
    result = _build(reqs=[CA_REQ], cfg=_Cfg([{"annee": "2025", "montant": "1 200 000"}]))
    comp = _comp(result, "ca")
    assert comp["statut"] == "ok"
    assert "600 000" in comp["explication"]
    assert comp["source"]["document"] == "RC.pdf"


def test_ca_insufficient():
    result = _build(reqs=[CA_REQ], cfg=_Cfg([{"annee": "2025", "montant": "300 000"}]))
    assert _comp(result, "ca")["statut"] == "ko"


def test_ca_not_required_by_rc():
    result = _build(reqs=[_Req("Fournir une attestation URSSAF.")], cfg=_Cfg())
    comp = _comp(result, "ca")
    assert comp["statut"] == "ok"
    assert "n'exige pas" in comp["explication"].lower()


def test_ca_required_but_profile_empty_is_neutral():
    """Profil sans CA → non évaluable, JAMAIS pénalisant, action proposée."""
    result = _build(reqs=[CA_REQ], cfg=_Cfg(None))
    comp = _comp(result, "ca")
    assert comp["statut"] == "non_evaluable"
    assert comp["action"] == "completer_profil"


def test_ca_rule_one_and_half_times_montant():
    """« CA ≥ 1,5 fois le montant » sans chiffre explicite → 1,5 × montant estimé."""
    req = _Req("Le chiffre d'affaires devra être au moins égal à 1,5 fois le montant du marché.")
    result = _build(
        reqs=[req], cfg=_Cfg([{"annee": "2025", "montant": "700 000"}]),
        infos={"montant_estime": "500 000 € HT"},
    )
    comp = _comp(result, "ca")
    assert comp["statut"] == "warning"  # 700k < 750k exigé mais ≥ 80 %


# ─── Composante qualifications ───────────────────────────────────────────────

def test_qualification_held():
    result = _build(reqs=[QUALIBAT_REQ], vault=[_VaultDoc("qualibat", "valid")])
    assert _comp(result, "qualifications")["statut"] == "ok"


def test_qualification_missing():
    result = _build(reqs=[QUALIBAT_REQ], vault=[_VaultDoc("urssaf", "valid")])
    comp = _comp(result, "qualifications")
    assert comp["statut"] == "ko"
    assert "qualibat" in comp["explication"].lower()


def test_qualification_expired_is_warning():
    result = _build(reqs=[QUALIBAT_REQ], vault=[_VaultDoc("qualibat", "expired")])
    assert _comp(result, "qualifications")["statut"] == "warning"


def test_qualification_empty_vault_is_neutral():
    """Coffre-fort totalement vide → non évaluable (pas de faux négatif)."""
    result = _build(reqs=[QUALIBAT_REQ], vault=[])
    comp = _comp(result, "qualifications")
    assert comp["statut"] == "non_evaluable"
    assert comp["action"] == "completer_profil"


def test_no_qualification_required():
    result = _build(reqs=[_Req("Fournir un KBIS.")])
    assert _comp(result, "qualifications")["statut"] == "ok"


# ─── Composante pondération prix/technique ───────────────────────────────────

def test_ponderation_technique_favorable():
    criteres = [{"nom": "Prix", "poids": 40}, {"nom": "Valeur technique", "poids": 60}]
    comp = _comp(_build(criteres=criteres), "ponderation")
    assert comp["statut"] == "ok"
    assert "60" in comp["explication"]


def test_ponderation_prix_dominant():
    criteres = [{"nom": "Prix", "poids": 80}, {"nom": "Valeur technique", "poids": 20}]
    assert _comp(_build(criteres=criteres), "ponderation")["statut"] == "ko"


def test_ponderation_absent_neutral():
    assert _comp(_build(criteres=None), "ponderation")["statut"] == "non_evaluable"


# ─── Composante délai restant ────────────────────────────────────────────────

def test_delai_comfortable():
    assert _comp(_build(cf=_cf(FUTURE_30)), "delai")["statut"] == "ok"


def test_delai_short_is_ko():
    assert _comp(_build(cf=_cf(FUTURE_5)), "delai")["statut"] == "ko"


def test_delai_unknown_neutral():
    assert _comp(_build(cf=_cf(None)), "delai")["statut"] == "non_evaluable"


# ─── Composante pénalités ────────────────────────────────────────────────────

def test_heavy_penalties_flagged():
    cf = _cf(FUTURE_30)
    cf["penalites"] = {"value": {"retard": "2 000 € HT/jour", "plafond": None}, "source": None}
    comp = _comp(_build(cf=cf), "penalites")
    assert comp["statut"] == "warning"


def test_capped_moderate_penalties_ok():
    cf = _cf(FUTURE_30)
    cf["penalites"] = {"value": {"retard": "200 € HT/jour", "plafond": "10 % du montant"}, "source": None}
    assert _comp(_build(cf=cf), "penalites")["statut"] == "ok"


# ─── Agrégation + verdict ────────────────────────────────────────────────────

def test_all_green_is_go():
    result = _build(
        reqs=[CA_REQ, QUALIBAT_REQ],
        cfg=_Cfg([{"annee": "2025", "montant": "1 200 000"}]),
        vault=[_VaultDoc("qualibat", "valid")],
        criteres=[{"nom": "Prix", "poids": 40}, {"nom": "Technique", "poids": 60}],
        cf=_cf(FUTURE_30),
    )
    assert result["score"] == 100
    assert result["verdict"] == "go"


def test_non_evaluable_components_excluded_from_score():
    """Un profil vide ne doit pas dégrader le score : composantes exclues."""
    result = _build(
        reqs=[CA_REQ, QUALIBAT_REQ], cfg=_Cfg(None), vault=[],
        criteres=[{"nom": "Prix", "poids": 40}, {"nom": "Technique", "poids": 60}],
        cf=_cf(FUTURE_30),
    )
    # ca + qualifications non évaluables ; ponderation/delai/penalites ok
    assert result["score"] == 100
    assert result["verdict"] == "go"
    assert sum(1 for c in result["composantes"] if c["statut"] == "non_evaluable") == 2


def test_mixed_gives_vigilance_or_nogo():
    result = _build(
        reqs=[CA_REQ, QUALIBAT_REQ],
        cfg=_Cfg([{"annee": "2025", "montant": "300 000"}]),   # ko
        vault=[_VaultDoc("qualibat", "expired")],               # warning
        criteres=[{"nom": "Prix", "poids": 80}, {"nom": "Technique", "poids": 20}],  # ko
        cf=_cf(FUTURE_30),                                      # delai ok
    )
    assert result["verdict"] in ("vigilance", "no_go")
    assert result["score"] < 70


def test_never_comments_price():
    result = _build(
        reqs=[CA_REQ], cfg=_Cfg([{"annee": "2025", "montant": "1 200 000"}]),
        criteres=[{"nom": "Prix", "poids": 80}, {"nom": "Technique", "poids": 20}],
    )
    forbidden = ["votre prix", "chiffrage", "marge", "baissez", "augmentez"]
    for comp in result["composantes"]:
        text = (comp["explication"] or "").lower()
        for word in forbidden:
            assert word not in text


# ─── Endpoint ────────────────────────────────────────────────────────────────

def test_endpoint_synorix_score(client, db_session, test_org):
    from models.project import Project
    from models.compliance_item import ComplianceItem

    p = Project(
        id="proj-c18", organization_id=test_org.id, name="Gueux", selected_lot="lot1",
        criteres_jugement=[{"nom": "Prix", "poids": 40}, {"nom": "Technique", "poids": 60}],
        critical_fields={"lot1": _cf(FUTURE_30)},
    )
    db_session.add(p)
    db_session.add(ComplianceItem(
        project_id="proj-c18", exigence_text=CA_REQ.exigence_text,
        source_document="RC.pdf", source_page=3, category="candidature",
    ))
    db_session.commit()

    resp = client.get("/api/projects/proj-c18/synorix-score")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["verdict"] in ("go", "vigilance", "no_go")
    assert {c["id"] for c in body["composantes"]} == {
        "ca", "qualifications", "ponderation", "delai", "penalites",
    }
