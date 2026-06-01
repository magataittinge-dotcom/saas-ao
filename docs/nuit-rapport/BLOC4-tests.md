# BLOC 4 — Non-régression (pytest, 0 API)

**Interpréteur :** `backend/venv/bin/python` (httpx 0.27.0 — le seul compatible, cf. BLOC1).

## Résultats

| Suite | Commande | Résultat | Temps |
|-------|----------|----------|-------|
| **Skills Synorix** | `pytest synorix/ -q` | ✅ **199 passed** | 9,13 s |
| **Backend (services/routers)** | `pytest tests/ -q` | ✅ **295 passed** | 4,29 s |
| **TOTAL** | — | ✅ **494 passed, 0 failed, 0 error** | ~13 s |

## Détail backend (`tests/`, 295 tests)

Couverture observée (tous verts) : analysis status, audit log, billing (abstraction + provider swap), cache, candidature upload, **checklist_matcher (24)**, **doc_type_detector (145)**, export ZIP guard, locale config, models DCE template, pipeline tracker progress, progress bus + stream endpoint, quick wins, **sécurité cross-org (9)**, soft delete, upload size limit, ZIP filename decoding.

## Détail Synorix (`synorix/`, 199 tests)

Tous les skills passent, dont les différenciateurs du BLOC3 : `test_calculateur_oab_temps_reel`, `test_rao_predictif`, `test_synorix_score_evaluateur`, `test_synorix_score_suggestions`, `test_calculatrice_retenue_garantie` (extraction), `test_cotraitance_groupement`, `test_conseil_recours_eviction`, `test_criteres_rse_2026`.

## Verdict

> **🟢 TOUT VERT — aucune régression.** Les 494 tests passent. Le moteur A (analyse, skills) est stable. **Aucun fichier cœur n'a été modifié cette nuit** : les défauts du moteur mémoire (BLOC1) ont été contournés uniquement dans un script jetable (`scripts/e2e_memoire_gueux.py`) — confirmé sans impact ici.

### Note importante (cohérence avec BLOC1)
La suite de tests passe à 100 % **mais ne couvre PAS la génération de mémoire réelle** (appel Opus). C'est précisément pourquoi les 3 défauts bloquants du moteur mémoire (temperature dépréciée, max_tokens, raise sur partiel) n'ont **jamais été détectés par les tests** — ils ne le sont qu'au premier appel API réel (BLOC1). **Recommandation :** ajouter un test d'intégration (mockable) sur `MemoireGenerator.generate` couvrant le chemin troncature/paramètres, pour qu'une régression future soit attrapée sans appel facturé.
