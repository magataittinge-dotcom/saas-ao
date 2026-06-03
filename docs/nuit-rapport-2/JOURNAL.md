# JOURNAL — Mission Nuit 2 (2026-06-03)

Compteur API : **mémoire 0/1 · analyse 0/1** | déterministes & exports = 0 API (illimités)

## Log
- [BLOC1] Branché les déterministes : router `/api/calculators` (oab + retenue-garantie), schémas validés, délègue à synorix_calc (0 API). Ajout PUR (2 fichiers + import/include main.py). 8 tests d'intégration verts (nominal+limite+rejets+auth). Suite complète : **511 verts**. Cœur IA non touché. Rapport : BLOC1-calculateurs.md.
- [BLOC2] Audit génératifs (0 API, lecture seule). 1 fiche/différenciateur : #92 RSE, #70/#71 Score, #86 RAO, #89 cotraitance, #88 recours, #81-84 Coach. Reco modèle Sonnet par défaut (Opus si justifié). Ordre : #92 → #70/#71 → #89 → #88 → #86 (bloqué par critères_jugement) → Coach (chantier). Rapport : BLOC2-plan-differenciateurs-generatifs.md.
- [BLOC3] Audit front ↔ calculateurs (0 API, lecture seule). Endpoints non project-scoped → page dédiée /outils recommandée (option A) + encart contextuel StepExport (option B). Composants réutilisables : StatusBadge (jauge OAB), SummaryCard/AccordionSection (résultats), AiTip (rappel juridique). Plan minimal sans code, ~0,5j front. Rapport : BLOC3-front-calculateurs.md.
- [BLOC4] Santé repo (0 API). pytest tests/ synorix/ → **511 verts**. Scan secrets : .env gitignoré, 0 secret en dur tracké (hits = placeholders doc). Git : HEAD==origin/refactor-v2, tout pushé, arbre tracké propre. Rapport : BLOC4-sante.md.
- [BLOC5] Pas de 2e DCE exploitable (seul CCTP lot 02 Gueux extrait). NON exécuté, budget mémoire préservé (0/1). Doc : BLOC5-validation-2e-dce.md.
- [FIN] RECAP-NUIT-2.md écrit. Tous blocs (1-5) terminés/pushés. Budget API : mémoire 0/1, analyse 0/1 (0 $ consommé). Cœur IA non touché. STOP propre.
