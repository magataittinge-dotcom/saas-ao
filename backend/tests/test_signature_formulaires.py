"""
Signature de DC1, DC2, DUME et de l'acte d'engagement (mission V, tranche 2).

Sources (vérifiées le 25/10/2026, notes nuit-25-10/B1 §2 lignes 9-10 et §5) :
  • service-public F32144 et F32106 : « La règlementation n'impose pas que le
    Dume ou les formulaires DC1, DC2 soient signés […]. Cependant, l'acheteur
    public peut exiger dans les documents de la consultation que la
    candidature soit signée. »
  • ATTRI1 (texte du modèle), R17445, F23784 : la signature de l'acte
    d'engagement « n'est plus aujourd'hui requise qu'au stade de
    l'attribution du marché public ».

Règle : pour DC1, DC2, DUME et AE, la confirmation « Je confirme avoir signé »
n'est demandée que si l'extrait du document de la consultation rattaché à la
pièce (source_in_rc) exige une signature. Déclaration sur l'honneur : inchangé.
"""
import json

import pytest

from models.checklist_item import ChecklistItem
from models.project import Project, ProjectDocument


class _Item:
    def __init__(self, doc_type, *, kind="dce_template", status="present", signed=False, extrait=None,
                 group="completer"):
        self.status = status
        self.document_type_required = doc_type
        self.source_kind = kind
        self.signature_confirmed = signed
        self.source_in_rc = extrait
        self.document_group = group


# ─── Score : la case n'est plus exigée par défaut ───────────────────────────

def test_dc1_dc2_dume_comptent_conformes_sans_case_quand_le_rc_ne_demande_rien():
    from services.ai.checklist_matcher import conformity_score

    items = [
        _Item("dc1_template"),
        _Item("dc2_template", extrait="Le candidat peut utiliser les formulaires DC1 et DC2 du ministère."),
        _Item("dume", kind="vault", group="fournir",
              extrait="Le DUME peut remplacer les formulaires de candidature."),
    ]
    assert conformity_score(items) == {"conformes": 3, "total": 3}


def test_acte_d_engagement_se_signe_a_l_attribution():
    from services.ai.checklist_matcher import conformity_score

    items = [_Item("acte_engagement_template",
                   extrait="L'acte d'engagement est remis complété avec l'offre de chaque lot.")]
    assert conformity_score(items) == {"conformes": 1, "total": 1}


def test_signature_exigee_par_le_rc_la_case_reste_demandee():
    from services.ai.checklist_matcher import conformity_score

    extrait = "La lettre de candidature (DC1) devra être datée et signée par une personne habilitée."
    items = [
        _Item("dc1_template", extrait=extrait),
        _Item("dc1_template", extrait=extrait, signed=True),
        _Item("acte_engagement_template", extrait="L'acte d'engagement sera signé électroniquement par le candidat."),
    ]
    assert conformity_score(items) == {"conformes": 1, "total": 3}


def test_declaration_sur_l_honneur_inchangee():
    from services.ai.checklist_matcher import conformity_score

    items = [_Item("declaration_honneur"), _Item("declaration_honneur", signed=True)]
    assert conformity_score(items) == {"conformes": 1, "total": 2}


@pytest.mark.parametrize("extrait", [
    "La lettre de candidature (formulaire DC1) n'a pas à être signée par le candidat.",
    "Le cadre d'acte d'engagement, non signé au stade du dépôt.",
    "Les formulaires DC1 et DC2 sont remis sans signature.",
    "Les candidats ne sont pas tenus de signer leur candidature.",
    "L'acte d'engagement sera signé par l'attributaire.",
    "La signature de l'acte d'engagement n'est requise qu'au moment de l'attribution.",
    "L’attributaire devra signer l’acte d’engagement.",
    "La signature n'est pas exigée au dépôt.",
    "Lettre de candidature comportant le nom et la qualité du signataire.",
    "",
    None,
])
def test_extraits_qui_n_exigent_pas_de_signature(extrait):
    from services.ai.checklist_matcher import extrait_exige_signature

    assert extrait_exige_signature(extrait) is False


@pytest.mark.parametrize("extrait", [
    "La lettre de candidature (DC1) devra être datée et signée par une personne habilitée.",
    "Le DC2 dûment complété et signé.",
    "L'acte d'engagement sera signé électroniquement par le candidat.",
    "Le DUME doit être revêtu de la signature du représentant légal.",
    "Les candidats devront signer le DC1.",
])
def test_extraits_qui_exigent_une_signature(extrait):
    from services.ai.checklist_matcher import extrait_exige_signature

    assert extrait_exige_signature(extrait) is True


# ─── API : la règle vient du serveur (une seule source pour le front) ───────

def _ligne(db, pid, id_, type_, *, kind="dce_template", extrait=None, group="completer", signed=False):
    db.add(ChecklistItem(
        id=id_, project_id=pid, document_type_required=type_, source_kind=kind,
        document_group=group, status="present", source_in_rc=extrait, signature_confirmed=signed,
    ))


def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="AO signature"))
    _ligne(db, pid, "l-dc1", "dc1_template")
    _ligne(db, pid, "l-dc1-signe", "dc1_template",
           extrait="Le DC1 devra être daté et signé par une personne habilitée.")
    _ligne(db, pid, "l-ae", "acte_engagement_template",
           extrait="L'acte d'engagement est remis complété avec l'offre de chaque lot.")
    _ligne(db, pid, "l-dsh", "declaration_honneur")
    _ligne(db, pid, "l-dume", "dume", kind="vault", group="fournir")
    db.commit()


def test_checklist_expose_signature_required(client, db_session, test_org):
    _projet(db_session, test_org.id, "proj-sig")
    lignes = {l["id"]: l for l in client.get("/api/projects/proj-sig/checklist").json()}
    assert {k: v["signature_required"] for k, v in lignes.items()} == {
        "l-dc1": False, "l-dc1-signe": True, "l-ae": False, "l-dsh": True, "l-dume": False,
    }
    # 5 pièces, 2 dont la signature est demandée et non confirmée
    assert client.get("/api/projects/proj-sig/checklist/score").json() == {"conformes": 3, "total": 5}


def test_export_detail_porte_la_regle_de_signature(client, db_session, test_org):
    _projet(db_session, test_org.id, "proj-sig-exp")
    items = {i["id"]: i for i in client.get("/api/projects/proj-sig-exp/export/detail").json()["checklist_items"]}
    assert items["l-dc1-signe"]["signature_required"] is True
    assert items["l-dc1"]["signature_required"] is False
    assert items["l-dc1-signe"]["source_kind"] == "dce_template"
    assert items["l-dume"]["source_kind"] == "vault"
    assert items["l-dc1-signe"]["signature_confirmed"] is False


def test_zip_ne_dit_plus_acte_d_engagement_non_signe(client, db_session, test_org):
    db_session.add(Project(id="proj-sig-zip", organization_id=test_org.id, name="AO signature ZIP"))
    db_session.add(ProjectDocument(
        project_id="proj-sig-zip", type="acte_engagement_template",
        file_url="/uploads/projects/proj-sig-zip/dce/AE.pdf", file_name="AE.pdf",
    ))
    db_session.commit()

    r = client.get("/api/projects/proj-sig-zip/export/zip")
    assert r.status_code == 200, r.text
    avertissements = json.loads(r.headers["x-export-warnings"])
    assert not any("non sign" in a for a in avertissements), avertissements
    assert "Acte d'engagement complété : à joindre" in avertissements
