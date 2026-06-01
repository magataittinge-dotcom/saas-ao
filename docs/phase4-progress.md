# Phase 4 — memoire (28 skills #36-#63) — Progression

**Démarré :** 2026-06-01 (contexte neuf dédié)
**Pattern de référence :** `expert_ite` (#26) — 3 fichiers + raw extract + __init__ + pytest
**Notebooks principaux :** N3 (Mémoires gagnants, 43615791) + N4 (DTU, 777badb4) + N7 (Scoring, 8ff1cdc4)
**Auth NotebookLM :** OK (Pro, token_fetch true)

---

## Journal

### Group 1 — Récupération données (#36-#39) ✅ — 8 tests verts
- [OK] #36 recuperation-profil-entreprise (Haiku, N3) — 7 rubriques canoniques + ordre, marqueur `[À COMPLÉTER PAR L'ENTREPRISE]`, zéro invention. memoire.
- [OK] #37 selection-references-pertinentes (Sonnet, N3) — volumétrie **3-5 strict**, 5 critères "miroir", scoring 0-100, classement décroissant. memoire.
- [OK] #38 recuperation-bibliotheque-memoire (Haiku, N3) — double axe section/métier, granularité paragraphe-thématique, exclusion métier incompatible. memoire.
- [OK] #39 extraction-memoire-importe (Sonnet, N3) — **catégorie sidebar** (registry), parsing sans TDM, tag section+métier, 5+ sections, extraits verbatim. → placé dans `skills/sidebar/`.

---

## Compteurs
- OK : 4 (Group 1)
- Incomplètes : 0
- Restantes : 24 (#40-#63)

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- (aucune pour Group 1) — #39 confirmé en catégorie `sidebar` conformément au registry (et non `memoire`).

## Modèles utilisés (suivi coût)
- Haiku : #36, #38
- Sonnet : #37, #39
- Opus : (à venir, rédacteurs long-form Group 2+)

## REPRENDRE À
Group 2 / memoire / #40 redacteur-preambule (Opus)
