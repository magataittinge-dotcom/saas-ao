"""
Tranche « lots sans libellé » — bug réel constaté sur le DCE Gueux.

Fixture au FORMAT EXACT du RC réel (« 2829 - RDC.pdf », tableau PDF aplati
verticalement : LOT⏎INTITULE⏎01⏎Démolition…) — cité verbatim du corpus.

  1. La regex RC extrait les 13 lots NOMMÉS de ce format vertical.
  2. « MARCHE PASSE PAR LOTS SEPARES » ne crée PAS de lot fantôme « Lot S ».
  3. Rapprochement systématique : un lot venu des fichiers/Excel hérite du
     libellé RC par numéro (le RC est la source de vérité des noms).
  4. Un lot au libellé générique (« Lot 06 » nu) après rapprochement + filet
     n'est JAMAIS affiché (anomalie loggée).
"""
from services.ai.lot_fallback import drop_unlabeled
from services.lot_detector import _detect_lots_from_rc_text, _merge_detections, LotDetection

# Verbatim du RC réel (extraction PDF, tableau aplati)
RC_GUEUX = """Restructuration de l‘école élémentaire de GUEUX
MARCHE DE TRAVAUX
RÈGLEMENT DE LA CONSULTATION
MARCHE PASSE EN PROCEDURE ADAPTEE
MARCHE PASSE PAR LOTS SEPARES

Cette opération de travaux est divisée en 13 lots définis ci-dessous.

LOT
INTITULE
01
Démolition – GO – Charpente bois  - Ossature bois
02
Etanchéité - Couverture
03
Menuiseries extérieures PVC
04
Menuiseries extérieures alu – Serrurerie - Metallerie
05
Revêtement de façade – ITE
06
Plaquisterie – Menuiserie intérieure – Faux-plafonds
07
Chape – Carrelage – Faïence
08
Peinture – Sol souple
09
Electricité
10
Plomberie sanitaires
11
Chauffage – Ventilation
12
Ascenseur
13
Panneaux photovoltaïques
1.2 DECOMPOSITION EN TRANCHES
Il est prévu une décomposition en tranches.
"""


def test_vertical_table_format_extracts_all_13_labels():
    dets = _detect_lots_from_rc_text(RC_GUEUX, "rc")
    by_id = {d.id: d for d in dets}

    assert "lot6" in by_id, sorted(by_id)
    assert "Plaquisterie" in by_id["lot6"].nom
    assert "lot8" in by_id and "Peinture" in by_id["lot8"].nom
    assert "lot12" in by_id and "Ascenseur" in by_id["lot12"].nom
    named = [d for d in dets if d.id.startswith("lot") and "—" in d.nom]
    assert len(named) >= 13


def test_lots_separes_is_not_a_lot():
    dets = _detect_lots_from_rc_text(RC_GUEUX, "rc")
    assert not any(d.id in ("lots", "lot_s") or d.nom.startswith("Lot S")
                   for d in dets), [d.nom for d in dets]


def test_merge_inherits_rc_label_by_number():
    """Lot venu des fichiers/Excel sans nom → hérite du libellé RC."""
    rc = [LotDetection(id="lot6", nom="Lot 06 — Plaquisterie – Menuiserie intérieure",
                       confidence=90, sources=["rc_text"])]
    excel = [LotDetection(id="lot6", nom="Lot 06", confidence=75, sources=["excel"])]
    fname = [LotDetection(id="lot6", nom="Lot 06", confidence=55, sources=["filename"])]

    merged = _merge_detections(excel, rc, fname)
    lot6 = next(d for d in merged if d.id == "lot6")
    assert "Plaquisterie" in lot6.nom
    assert "rc_text" in lot6.sources


def test_rc_label_wins_over_excel_by_source():
    """Conflit réel (lot 11 Gueux) : Excel dit « CHAPE CARRELAGE FAIENCE »,
    le RC dit « Chauffage – Ventilation » → le RC prime PAR SOURCE."""
    excel = [LotDetection(id="lot11", nom="Lot 11 — CHAPE CARRELAGE FAIENCE",
                          confidence=75, sources=["excel"])]
    rc = [LotDetection(id="lot11", nom="Lot 11 — Chauffage – Ventilation",
                       confidence=90, sources=["rc_text"])]
    merged = _merge_detections(excel, rc, [])
    lot11 = next(d for d in merged if d.id == "lot11")
    assert "Chauffage" in lot11.nom, lot11.nom


def test_ghost_lots_dropped_when_rc_list_complete(caplog):
    """RC nomme 13 lots (liste complète) → un lot hors liste venu d'un Excel
    mal étiqueté (lot17 « ASCENSEUR », lot1a titre de classeur) est écarté."""
    from services.ai.lot_fallback import drop_ghosts

    lots = [
        {"id": "lot12", "nom": "Lot 12 — Ascenseur", "sources": ["rc_text", "filename"]},
        {"id": "lot17", "nom": "Lot 17 — ASCENSEUR", "sources": ["excel"]},
        {"id": "lot1a", "nom": "Lot 1a — Réhabilitation du groupe…", "sources": ["excel", "filename"]},
        {"id": "lot14", "nom": "Lot 14 — Ajouté par IA", "sources": ["ia_fallback"]},
    ]
    with caplog.at_level("WARNING"):
        out = drop_ghosts(lots, announced=1)  # liste RC "complète" (1 lot rc_text ≥ 1)
    ids = [l["id"] for l in out]
    assert "lot12" in ids and "lot14" in ids          # rc_text + ia_fallback gardés
    assert "lot17" not in ids and "lot1a" not in ids  # fantômes écartés
    assert sum("fantôme" in r.message for r in caplog.records) == 2


def test_ghosts_kept_when_rc_list_incomplete():
    """Sans liste RC complète, on ne supprime RIEN (pas de sur-filtrage)."""
    from services.ai.lot_fallback import drop_ghosts

    lots = [
        {"id": "lot1", "nom": "Lot 1 — GO", "sources": ["excel"]},
        {"id": "lot2", "nom": "Lot 2 — Peinture", "sources": ["filename"]},
    ]
    assert drop_ghosts(lots, announced=5) == lots     # 0 lot rc_text < 5
    assert drop_ghosts(lots, announced=None) == lots


def test_generic_label_never_displayed(caplog):
    lots = [
        {"id": "lot6", "nom": "Lot 06 — Plaquisterie", "sources": ["rc_text"]},
        {"id": "lot8", "nom": "Lot 08", "sources": ["filename"]},   # générique
        {"id": "lot9", "nom": "", "sources": ["excel"]},            # vide
    ]
    with caplog.at_level("WARNING"):
        out = drop_unlabeled(lots)
    assert [l["id"] for l in out] == ["lot6"]
    assert sum("écarté" in r.message for r in caplog.records) == 2
