# JOURNAL — Mission Nuit 3 (2026-06-04)

Compteur API : **analyse 0/1** | reste = 0 API

## Log
- [start] Bloc 1 — audit progression pipeline (backend + front).
- [BLOC1] Audit progression : backend émet une vraie progression monotone (SSE), mais ProgressDisplay (front) suivait la valeur VERS LE BAS (pas de garde monotone) → bug "descend". Fix front-only appliqué : ProgressDisplay monotone (max, reset propre). "Fige/saute" résiduels = interpolation backend (estimated_s) → plan documenté, non touché (proche cœur). Build tsc+vite vert. Rapport : BLOC1-progression.md.
