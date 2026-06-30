# `synorix/` — Système "B" (corpus de backport, PAS du code de prod)

⚠️ **Ce dossier n'est PAS le moteur de production.** L'application réelle tourne sur
`backend/services/ai/` (moteur "A") + `backend/ai_skills/` (skills markdown chargés par
`services/skill_loader.py`).

## Statut
- **~94 skills Python + ~91 tests** = corpus de référence issu du travail NotebookLM,
  destiné au backport B → A (cf. `docs/backport-mapping.md`).
- **NON câblé dans l'app**, à **une seule exception** : 2 calculateurs déterministes,
  importés par `backend/services/synorix_calc.py` (lui-même utilisé par `routers/calculators.py`) :
  - `synorix/skills/extraction/calculatrice_retenue_garantie.py`
  - `synorix/skills/verification/calculateur_oab_temps_reel.py`
- **Les tests de ce dossier ne sont PAS exécutés** : `pytest.ini` a `testpaths = tests`.
  Les 326 tests verts du projet viennent tous de `backend/tests/`.

## À retenir
Avant de modifier ou de t'appuyer sur un fichier d'ici : vérifie qu'il est réellement
importé par l'app. Dans le doute, c'est de la **référence**, pas du code vivant.
