# BLOC 1 — UX progression pipeline (audit + fix front sûr)

## Audit backend — ce qui est RÉELLEMENT émis

**Architecture** (saine) : `pipeline_tracker.py` (état en mémoire, par projet) → `progress_bus.py` (pub/sub) → `routers/progress.py` (SSE `/api/projects/{id}/progress-stream`, events `init`/`progress`/`complete`/`error`/`heartbeat`).

**Le backend émet une vraie progression**, calculée server-side et **monotone par pipeline** (`get_status`) :
- progression = `pct_end` des steps terminés + interpolation du step en cours ;
- l'interpolation utilise un **vrai signal** `internal_progress` (0-1) quand le service en publie un (ex. le stream IA via `update_step_progress`), sinon un **fallback temps écoulé** : `ratio = min(elapsed / estimated_s, 0.95)`.

**4 pipelines SÉPARÉS**, chacun 0→100 indépendamment :
| pipeline | steps (pct_start→pct_end, estimated_s) |
|---|---|
| `upload` | uploading 0-30 (30s) · extracting_zip 30-40 (5s) · extracting_text 40-100 (60s) |
| `lot_detection` | detecting_lots 0-100 (30s) |
| `analysis` | preparation 0-5 · analyzing_pass1 5-50 (50s) · analyzing_pass2 50-95 (50s) · finalizing 95-100 |
| `memoire` | preparing 0-10 · generating 10-85 (120s) · finalizing 85-100 |

→ Granularité réelle : **oui** pour l'IA (signal de chars streamés mappé dans le palier `generating`/`analyzing`), **non** pour upload/extraction/détection (fallback temps écoulé uniquement).

## Audit frontend — comment c'est consommé AUJOURD'HUI

- **`hooks/useProgressStream.ts`** : consomme le SSE réel (fetch + ReadableStream, JWT Clerk), reconnexion backoff ×5 puis fallback polling 2 s sur `/processing-status`. **Fidèle** : map `snap.progress` → `state.progress` (0-100). Consommé par StepUpload, StepLotSelection, StepAnalysis, StepMemoire.
- **`components/common/ProgressDisplay.tsx`** : cercle SVG + **lerp** (`displayProgress` tend vers `targetProgressRef` à 12 %/frame).

### CAUSE RACINE des incohérences (monte/descend/saute/fige)
1. **« Descend » (principal) — `ProgressDisplay` n'était PAS monotone.** Ligne 86 : `targetProgressRef.current = clamp(progress)` suivait la valeur **vers le bas**. Or `progress` peut momentanément baisser : reconnexion SSE rejouant son `init`, signal `internal_progress` arrivant APRÈS une interpolation temps déjà plus haute, jitter, ou la bascule **crawl factice → SSE réel** de l'upload. Le lerp animait alors la barre en arrière. → **C'est le bug visuel « descend ».**
2. **« Fige à ~X% puis saute » — interpolation backend capée à 0,95 du palier.** Si une opération dure plus longtemps que `estimated_s` (ex. analyse réelle 120 s vs `estimated_s=50`), `ratio` atteint 0,95 en ~50 s puis **gèle** près de la fin du palier jusqu'à la complétion, qui **saute** alors au `pct_end`. Classique « monte jusqu'à ~48 % puis fige, puis saute à 50 % ». → **Cause = côté backend** (tuning `estimated_s` / cap d'interpolation).
3. **Upload : mélange crawl factice + SSE.** `StepUpload` calcule `displayPct` à partir d'un `setInterval` (phase HTTP upload, sans signal backend) PUIS du SSE réel (`realPct = 30 + sse.progress/100*65`). La jonction des deux sources peut produire un micro-saut. (Le crawl pendant l'upload HTTP est légitime — pas de signal réel disponible — conformément au principe « slow crawl pour le temps mort ».)

## Fix APPLIQUÉ (front-only, sûr et isolé)

**`ProgressDisplay.tsx` rendu MONOTONE** (un seul composant, utilisé par les 4 flux) :
- `in_progress`/`error` → `target = max(target, progress)` : **la barre ne recule jamais** sur jitter/reconnexion/signal tardif/handover crawl→SSE.
- `complete` → 100 ; `pending` → suit la valeur entrante (reset propre d'un nouveau run).
- garde anti-blocage : si on était à 100 et qu'un nouveau run démarre bas (`<95`), on réinitialise (évite « coincé à 100 »).

→ Corrige le **« descend »** sur **tous** les flux (upload, lots, analyse, mémoire) d'un seul endroit, sans toucher le backend, design inchangé. **Build `tsc && vite build` vert.**

> Pourquoi pas plus ? Les causes #2 (gel d'interpolation) et #3 (mélange upload) touchent le **backend** (tuning `estimated_s`, émission d'events plus granulaires) ou la logique de crawl d'un step — **proche du cœur**. Conformément à la règle nuit, **non modifiés**, documentés ci-dessous en plan.

## Plan pour Mohamed (modifs backend, à valider — NON faites cette nuit)

1. **Anti-« fige puis saute » (priorité)** : remplacer le fallback temps écoulé capé à 0,95 par une courbe asymptotique douce (ex. `1 - e^(-elapsed/τ)`) qui continue à avancer lentement au-delà de `estimated_s` sans jamais figer ni dépasser. OU mieux : émettre un **vrai signal** `internal_progress` aussi pour l'analyse multi-passes (déjà fait pour la génération mémoire) → la barre suit le vrai travail. Fichier : `pipeline_tracker.get_status` (l.232-237) + `dce_analyzer` (émission). ⚠️ cœur IA → supervisé.
2. **Re-calibrer `estimated_s`** sur des mesures réelles (analyse ~250 s observée vs 100 s configuré ; mémoire ~950 s full-Sonnet vs 120 s) pour que l'interpolation ne sature pas trop tôt. Fichier : constantes `ANALYSIS_STEPS`/`MEMOIRE_STEPS`. Faible risque mais touche le tracker.
3. **Upload** : remplacer le crawl `setInterval` de `StepUpload` par un état **indéterminé propre** (spinner + « Transfert en cours… ») tant qu'aucun `%` réel d'upload n'est disponible (XHR `onprogress` donnerait un vrai % de transfert). Front, mais refonte d'un step → à cadrer.

## Verdict
✅ **Fix front sûr appliqué** : barre désormais **monotone** sur tous les flux (plus de « descend »). Les « fige/saute » résiduels relèvent du backend (interpolation/estimations) → **plan fourni**, non exécuté cette nuit (proche cœur). Build vert.
