# RÉCAP — Mission Nuit 3 (2026-06-04)

UX progression pipeline (fix sûr) + audits BDD/prompts. **Cœur IA jamais touché.** Tout sur `refactor-v2`, commit + push par bloc.

## Budget API consommé : 0 $ (0 appel IA)
Analyse 0/1, mémoire 0/1. Mission 100 % 0-API comme prévu.

## Synthèse par bloc

| Bloc | Sujet | Verdict | Livrable |
|---|---|---|---|
| **1** | UX progression pipeline | ✅ **fix front appliqué** (barre monotone) + plan backend | `BLOC1-progression.md` · fix `ProgressDisplay.tsx` |
| **2** | Audit BDD | ✅ état + plan enrichissement additif priorisé | `BLOC2-audit-bdd.md` |
| **3** | Audit prompts Sonnet | ✅ 5 fragilités + durcissements priorisés | `BLOC3-audit-prompts-sonnet.md` |
| **4** | Non-régression | ✅ 511 verts, build vert, 0 secret | `BLOC4-sante.md` |

## Ce qui est FIXÉ cette nuit (front-only, sûr)
**Barre de progression désormais MONOTONE** (`ProgressDisplay.tsx`) sur les 4 flux (upload/lots/analyse/mémoire) : ne recule plus jamais sur jitter SSE, reconnexion `init`, signal `internal_progress` tardif, ou handover crawl→SSE de l'upload. **Cause racine** : le composant suivait la valeur backend vers le bas (pas de garde monotone). Build `tsc && vite build` vert. Commit `16f48a7`.

## Ce qui est PLANIFIÉ (à valider/superviser — non fait, proche cœur)
- **Progression — « fige puis saute »** : interpolation backend capée à 0,95 du palier quand l'op dépasse `estimated_s` (analyse ~250 s vs 100 s configuré ; mémoire ~950 s vs 120 s). Plan : courbe asymptotique douce OU vrai `internal_progress` pour l'analyse + recalibrer `estimated_s`. (`pipeline_tracker.py` / `dce_analyzer`.)
- **BDD** : référentiels 100 % en fichiers → prompt. Plan additif priorisé : biblio RSE (#92) → DTU structuré (précision Sonnet) → jurisprudence → barèmes calculateurs. Migrations **additives** seulement.
- **Prompts Sonnet** : F1 few-shot méthodologie « 5/5 » + quota citations (efface l'écart densité vs Opus), F2 guidage extraction critères. À appliquer en supervisé avec re-test A/B + scan anti-invention.

## 🎯 TOP 3 PRIORITÉS au réveil
1. **🟢 Valider le fix progression en live** (lancer front+back, dérouler upload→…→mémoire) puis décider du plan backend « fige/saute » (recalibrer `estimated_s` = quick win faible risque).
2. **🟡 Durcir le prompt mémoire Sonnet (F1)** : few-shot méthodologie dense + quota citations → rapproche d'Opus, en re-testant densité + anti-invention sur Gueux (1 génération).
3. **🟡 Enrichir la BDD (quick win #4)** : table `phrases_rse_bibliotheque` (input déjà attendu par la skill #92) → débloque le branchement RSE sans hardcode.

## Notes
- Cœur IA (`services/ai/*`, `prompts.py`, `ai_skills`) **non modifié**. Seul `ProgressDisplay.tsx` (front) touché.
- Repo sain : 511 tests verts, build front vert, 0 secret, `HEAD == origin/refactor-v2`.
- Rappel : criteres_jugement=0 observé sur Gueux = **RC absent du test A/B**, pas un bug prompt (en prod le RC alimente la passe 1).
