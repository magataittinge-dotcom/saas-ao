"""Le nom d'une pièce, sans note du logiciel (12/11/2026). Le serveur écrivait « Pouvoir (2 exigences du RC regroupées) » dans
`details`, et l'écran l'enlevait par des expressions régulières (fragile : une phrase changée ici, et l'écran se trompait).
Désormais le serveur n'écrit plus la note ; les pièces enregistrées avant la portent encore : elle est retirée là où le nom
sort (schémas de réponse), et une pièce ancienne reste la même pièce qu'une nouvelle à la régénération."""
from types import SimpleNamespace

from schemas.compliance import ChecklistItemResponse, sans_note_regroupement
from schemas.export import ChecklistExportItem
from services.checklist_builder import _cle_ligne, _line_to_item
from services.checklist_typology import ChecklistLine


def test_le_serveur_n_ecrit_plus_la_note(db_session, test_org):
    ligne = ChecklistLine(scope=None, group="fournir", canonical_type="pouvoir", label="Pouvoir / habilitation à signer",
                          text="x", source_excerpt=None, merged_count=3)
    item = _line_to_item(ligne, "p-note", db_session, {}, 0)
    assert item.details == "Pouvoir / habilitation à signer"


def test_une_piece_ancienne_sort_sans_sa_note():
    base = dict(id="c1", project_id="p", document_type_required="pouvoir", status="manquant", source_in_rc=None)
    r = ChecklistItemResponse.model_validate({**base, "details": "Pouvoir / habilitation à signer (2 exigences du RC regroupées)"})
    assert r.details == "Pouvoir / habilitation à signer"
    e = ChecklistExportItem(id="c1", document_type_required="pouvoir", status="manquant",
                            details="Références (1 exigence du RC regroupée)")
    assert e.details == "Références"
    assert ChecklistItemResponse.model_validate({**base, "details": None}).details is None
    assert sans_note_regroupement("Kbis de moins de 3 mois") == "Kbis de moins de 3 mois"


def test_piece_redigee_par_synorix_son_nom_seul(db_session, test_org):
    """L'écran dit déjà « À l'étape Rédiger » : le serveur écrivait « Mémoire technique — rédigé par Synorix à l'étape
    Rédiger » (avant : « — généré par Synorix à l'étape Mémoire », que l'écran retirait par une expression régulière)."""
    ligne = ChecklistLine(scope=None, group="synorix", canonical_type="memoire_technique", label="Mémoire technique",
                          text="x", source_excerpt=None)
    assert _line_to_item(ligne, "p-note", db_session, {}, 0).details == "Mémoire technique"
    for ancien in ("Mémoire technique — généré par Synorix à l'étape Mémoire",
                   "Mémoire technique — rédigé par Synorix à l’étape Rédiger"):
        assert sans_note_regroupement(ancien) == "Mémoire technique"


def test_piece_ancienne_et_nouvelle_sont_la_meme_a_la_regeneration():
    ancienne = SimpleNamespace(document_type_required="autre", lot=None, details="Attestation X (2 exigences du RC regroupées)")
    nouvelle = SimpleNamespace(document_type_required="autre", lot=None, details="Attestation X")
    assert _cle_ligne(ancienne) == _cle_ligne(nouvelle)
