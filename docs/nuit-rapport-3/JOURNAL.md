# JOURNAL — Mission Nuit 3 (2026-06-04)

Compteur API : **analyse 0/1** | reste = 0 API

## Log
- [start] Bloc 1 — audit progression pipeline (backend + front).
- [BLOC1] Audit progression : backend émet une vraie progression monotone (SSE), mais ProgressDisplay (front) suivait la valeur VERS LE BAS (pas de garde monotone) → bug "descend". Fix front-only appliqué : ProgressDisplay monotone (max, reset propre). "Fige/saute" résiduels = interpolation backend (estimated_s) → plan documenté, non touché (proche cœur). Build tsc+vite vert. Rapport : BLOC1-progression.md.
- [BLOC2] Audit BDD (lecture seule). 12 tables métier (tenant/projet OK). Référentiels = 100% fichiers ai_skills (9 skills/18 .md/240K) → prompt, NON requêtables ; NotebookLM exploité via prompt seulement. Plan additif priorisé : #4 biblio RSE (quick win, input attendu par #92) → #1 DTU structuré (précision Sonnet) → #2 jurisprudence → #3 barèmes. Nuance : le cache amortit déjà les tokens → gain = précision/réutilisabilité, pas économie tokens. Rapport : BLOC2-audit-bdd.md.
- [BLOC3] Audit prompts pour Sonnet (lecture seule). Prompts déjà solides (JSON strict, 10 few-shot analyse, anti-invention). 5 fragilités + durcissements priorisés : F1 few-shot méthodo "5/5"+quota citations (rapproche Opus, prio 1), F2 guidage extraction critères (prio 2), F3/F4 source_page/excerpt verbatim, F5 verrou clés segment. Note : criteres=0 Gueux = RC absent du test, pas bug prompt. Rien modifié. Rapport : BLOC3-audit-prompts-sonnet.md.
- [BLOC4] Santé : pytest 511 verts, build front (tsc && vite) vert, 0 secret, HEAD==origin. Rapport : BLOC4-sante.md.
- [FIN] RECAP-NUIT-3.md écrit. Blocs 1-4 finis/pushés. Budget API : 0$ (analyse 0/1, mémoire 0/1). Cœur IA non touché. Seul fix code = ProgressDisplay monotone (front). STOP propre.
