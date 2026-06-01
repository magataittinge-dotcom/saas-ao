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

### Group 2 — Rédacteurs long-form (#40-#44) ✅ — 10 tests verts
- [OK] #40 redacteur-preambule (**Opus**, N3) — structure 4 mouvements (effet miroir, visite site, solution chiffrée, transition), anti-plaqué corporate.
- [OK] #41 redacteur-presentation-entreprise (**Opus**, N3) — PARTIE A, sous-sections = rubriques canoniques, anti-autobiographie, zéro invention.
- [OK] #42 redacteur-equipe-dediee (Sonnet, N3) — CV synthétiques factuels, engagement FERME (CE 21/03/2018 anti-affectation conditionnelle).
- [OK] #43 redacteur-references-chantiers (Sonnet, N3) — tableau 7 colonnes (format Cariso/SERI), photos avant/après, volumétrie 3-5.
- [OK] #44 redacteur-presentation-prestation (**Opus**, N3) — PARTIE B, reformulation (anti copier-coller CCTP), tableau Contraintes=Solutions, aléas.

---

## Compteurs
- OK : 9 (Group 1 = 4, Group 2 = 5)
- Incomplètes : 0
- Restantes : 19 (#45-#63)

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- (aucune nouvelle) — #39 confirmé en catégorie `sidebar` conformément au registry (et non `memoire`).
- Note #41 : N3 (mémoires gagnants) recommande 2-3 pages pour la présentation entreprise ; le registry vise 5-7 pages. Prompt = densité utile prioritaire sur le remplissage. À arbitrer.

## Modèles utilisés (suivi coût)
- Haiku : #36, #38
- Sonnet : #37, #39, #42, #43
- Opus : #40, #41, #44

## REPRENDRE À
Group 3 / memoire / #45 redacteur-methodologie (Opus)
