# Index de la documentation Synorix

Carte de tous les rapports et référentiels du repo. Branche de travail : `refactor-v2`.

## 📐 Design (`docs/design/`) — préparé pour la passe design
- **[DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md)** — référentiel d'identité (palette 4-rôles, DM Sans, tokens `ds-*`, classes, composants, conventions). À donner à Claude Design / Figma MCP.
- **[AUDIT_UI.md](design/AUDIT_UI.md)** — état visuel écran par écran + priorités de refonte.
- **[QUICK_WINS_appliques.md](design/QUICK_WINS_appliques.md)** — corrections cohérence appliquées + décisions laissées au design.
- **[PLAN_DESIGN.md](design/PLAN_DESIGN.md)** — plan d'action du chantier design (ordre, outils, captures).

## 🌙 Rapports de nuit (autonomie supervisée)
- **[nuit-rapport/](nuit-rapport/)** (Nuit 1) — test end-to-end DCE Gueux, audit frontend, plan différenciateurs, tests, déterministes service pur. → `RECAP-NUIT.md`.
- **[nuit-rapport-2/](nuit-rapport-2/)** (Nuit 2) — branchement calculateurs déterministes (OAB/retenue), plan génératifs, plan front, santé. → `RECAP-NUIT-2.md`.
- **[nuit-rapport-3/](nuit-rapport-3/)** (Nuit 3) — fix progression pipeline (monotone), audit BDD, audit prompts Sonnet, santé. → `RECAP-NUIT-3.md`.
- **[nuit-rapport-4/](nuit-rapport-4/)** (Nuit 4) — design system, audit UI, quick wins, organisation repo, plan design, santé. → `RECAP-NUIT-4.md`.

## 🔬 Comparaisons mémoire (`docs/comparaison-memoire-AB/`)
- **[RESULTAT.md](comparaison-memoire-AB/RESULTAT.md)** — Opus vs Sonnet vs hybride vs full-Sonnet renforcé (densité, coût, anti-invention).
- Artefacts : `memoire-gueux-SONNET-F1v2.{md,json}` (**version retenue** : full-Sonnet + prompt F1 v2), + SONNET / RENFORCE / HYBRIDE / F1 (historique des tests).
- Référence Opus : `../nuit-rapport/memoire-gueux-REPARE.{md,json}`.

## 🏗️ Référentiels produit / architecture (`docs/`)
- **[PRD_SYNORIX_V2.md](PRD_SYNORIX_V2.md)** — product requirements v2.
- **[ARCHITECTURE_V2.md](ARCHITECTURE_V2.md)** — architecture cible.
- **[SKILLS_REGISTRY_V2.md](SKILLS_REGISTRY_V2.md)** / **[SKILL_TEMPLATE_V2.md](SKILL_TEMPLATE_V2.md)** — registre + template des skills.
- **[NOTEBOOKS_REGISTRY.md](NOTEBOOKS_REGISTRY.md)** — registre NotebookLM (N1…N8, sources métier).
- **[SETUP.md](SETUP.md)** — mise en route.
- **[DETTE_TECHNIQUE.md](DETTE_TECHNIQUE.md)** — dette technique priorisée.

## 📦 Backport / enrichissement (`docs/`)
- `backport-mapping.md`, `notebook-enrichment-plan.md`, `notebook-enrichment-log.md`, `batch-nuit-progress.md`, `phase4-progress.md`, `phase5-8-progress.md` — historique de backport des skills B → moteur A et enrichissement NotebookLM.
- **[notebook-extracts/](notebook-extracts/)** — extraits bruts NotebookLM par skill.

## 🧪 Données de test (`docs/comparaison-AB/`)
Entrées DCE Gueux (`_input_CCAP.txt`, `_input_CCTP_lot02_etancheite.txt`) + sorties d'analyse A/B. Fixtures de re-test (non trackées).

## 🛠️ Scripts de test (`scripts/`)
Voir **[../scripts/README.md](../scripts/README.md)** — scripts jetables de comparaison/e2e (mémoire, analyse). Non intégrés au backend.
