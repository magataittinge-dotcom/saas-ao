# Dette technique — Synorix (priorisée)

État au 2026-06-06 (Nuit 4). Repérage 0-API, lecture seule + 1 fix gitignore. Aucune dette « cœur IA » (non audité cette nuit).

| # | Dette | Détail | Impact | Effort | Risque fix |
|---|---|---|---|---|---|
| 1 | **`frontend/dist/` versionné** | Le build (`vite build`) est **tracké** dans git → churn à chaque build (fichiers hashés), bruit dans `git status`, diffs inutiles. `frontend/dist/` ajouté à `.gitignore` cette nuit (stoppe le churn futur), MAIS les fichiers déjà trackés subsistent. | Moyen (bruit git, repo lourd) | Faible | `git rm -r --cached frontend/dist` puis commit (supprime du suivi, garde le local) — **décision Mohamed** (touche des fichiers trackés). |
| 2 | **Pas de config ESLint front** | `npm run lint` échoue (« couldn't find a configuration file »). Le script existe (`package.json`) mais aucun `.eslintrc`/`eslint.config.*`. Lint jamais fonctionnel. | Moyen (pas de garde-fou style/qualité JS) | Faible-Moyen | Ajouter `eslint.config.js` (flat config) + plugins react/ts. À cadrer (peut révéler des warnings existants). |
| 3 | **Bundle front monolithique** | `vite build` → warning « chunks > 500 kB » (~970 kB JS, 272 kB gzip). Pas de code-splitting. | Moyen (perf 1er chargement) | Moyen | `manualChunks` / `import()` dynamiques (Landing, viewer PDF, éditeur mémoire). Améliore le LCP. |
| 4 | **Couleurs hors-charte résiduelles** | Amber « Expire bientôt » (candidature/vault), incohérence `StatusBadge` (slate) vs composants (amber). | Faible (cohérence visuelle) | Faible | À trancher dans la passe design (cf. `design/QUICK_WINS_appliques.md`). |
| 5 | **Scripts jetables non rangés** | 12 scripts `scripts/*.py` (comparaison/e2e), partiellement trackés/untracked. Documentés cette nuit (`scripts/README.md`). | Faible | Faible | Garder pour re-test ; décider lesquels tracker. |
| 6 | **`References.tsx` — bouton mort** | `_showForm`/`setShowForm` déclaré mais le formulaire d'ajout n'est pas branché (bouton « Ajouter une référence » sans effet). | Faible (fonctionnel) | Faible | Brancher le formulaire ou retirer le bouton. |
| 7 | **Progression — interpolation backend** | « fige puis saute » quand l'op dépasse `estimated_s` (cf. `nuit-rapport-3/BLOC1-progression.md`). | Faible-Moyen (UX) | Moyen | Recalibrer `estimated_s` (quick win) ou vrai signal d'avancement analyse (proche cœur → supervisé). |

## Notes config
- **`.claude/` gitignoré** : contient `settings.local.json` (réglages locaux, OK non tracké) + `skills/` (skills Claude Code, OK). Les skills **produit** ont été relocalisées en `backend/ai_skills/` (trackées) — donc plus de perte. RAS.
- **`.gitignore`** : cohérent (`.env`, `node_modules`, `venv`, `*.db`, `uploads/`, secrets cookies). Aucun secret tracké (vérifié nuits 2/3). Ajout cette nuit : `frontend/dist/`.

## Priorité recommandée
1. **#1 untrack dist** (assainit le repo, faible risque) — à valider.
2. **#3 code-splitting** (perf perçue, utile avant démo).
3. **#2 ESLint** (garde-fou qualité front avant le gros du dev design).
Le reste (#4–#7) = à traiter au fil des passes design/feature.
