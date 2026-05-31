# Raw NotebookLM extract — Skill #6 `recherche-lots`

**Captured:** 2026-05-31 — N8 (5574a7d1). Build-time only.

## Q1 (N8) — Détection lots + allotissement
- **Détection** : AAPC indique « Marché alloti : N lot(s) » [1]. Structure détaillée dans RC [2], CCTP [3], DPGF (prix lot par lot) [2].
- **Allotissement** : découpage par corps d'état/zone géographique facilite l'accès TPE/PME et la concurrence [1,5]. (Hors corpus, CCP : règle L. 2113-10, exceptions L. 2113-11.)
- **Patterns numérotation** (hors corpus, pratique courante) : numérique (Lot 1 GO, Lot 2 Charpente…) ; lettré/décimal sous-lots (3A/3B géo, 3.1/3.2) ; Tranche Ferme (TF) + Tranche Optionnelle (TO, ex-conditionnelle).
- **Réconciliation RC/DPGF** : ne jamais interpréter seul → **question formelle à l'acheteur** sur le profil [4] ; réponse officielle visible de tous (égalité). Hiérarchie pièces définie au CCAP (CCTP prime souvent DPGF) en exécution.

## Build notes
- Sonnet (multi-docs + réconciliation). Divergences mono-source conservées (traitées par #9).
