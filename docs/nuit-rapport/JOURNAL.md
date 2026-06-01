# JOURNAL — Mission Nuit (2026-06-02)

Compteur API : **analyse 0/3 · mémoire 3/3 (CAP ATTEINT)** | exports illimités (0 API)
Coût mémoire estimé ≈ 8 $ (3 runs Opus 4.7).

## Log

- [00:25] Démarrage mission. Création `docs/nuit-rapport/`. Exploration infra.
- [00:25] Constat : `docs/comparaison-AB/A-analyse-output.json` existe déjà (run 00:17). Inspection avant de décider de re-run (économie budget API).
- [Reprise] Inspection analyse réutilisée : **98 exigences OK**, traçabilité (source_document/page/excerpt) présente. Categories : candidature 3, offre 11, planning 12, technique 72. ⚠️ `criteres_jugement`=0 (vide — à signaler). Analyse RÉUTILISÉE → **0 appel API** (compteur analyse reste 0/3).
- [Reprise] Signatures services vérifiées (MemoireGenerator.generate model=claude-opus-4-7, ChecklistMatcher.match, build_memoire_docx) → conformes au script e2e. Lancement BLOC 1 e2e.
- [BLOC1] Checklist OK (3 items candidature, vault vide → manquant). Mémoire : 3 défauts BLOQUANTS découverts en cascade : (1) `temperature` déprécié opus-4-7 → 400 ; (2) `max_tokens=16000` puis 32000 → TRONQUÉ (stop_reason=max_tokens) ; (3) cœur lève ValueError sur partiel. Cœur NON modifié → contournés par monkeypatch dans le script jetable (strip temperature, bump max_tokens, capture brut).
- [BLOC1] Mémoire récupéré via json_repair : ~30 pages, TRÈS spécifique DCE (Gueux ×26, contraintes CCAP réelles), sections Vague 2 toutes présentes (PPSPS/R.4532, SOGED/PMCB, ISO9001/PAQ, DTU 43.x, SPAC), **0 donnée entreprise inventée** (57 placeholders [À COMPLÉTER]). Défaut : partie_c tronquée + artefacts json_repair en fin.
- [BLOC1] Export DOCX OK (68 KB, zip valide, document.xml 308 KB). Verdict end-to-end : **OUI AVEC RÉSERVES MAJEURES** (génération mémoire cassée en prod sans correctif). Rapport : `BLOC1-end-to-end.md`. Compteur mémoire 3/3 → STOP appels mémoire.

- [BLOC2] Audit frontend (0 API, lecture seule). Front = MATURE et entièrement câblé : 6 étapes (upload/lots/analysis/candidature/memoire/export) toutes fonctionnelles, AUCUN stub. Tous les endpoints front ont leur contrepartie backend (contrat cohérent). Sidebar v2 quasi complète. Anomalies : (1) « Mon entreprise » /company absent de la sidebar nav (page existe), (2) étape Mémoire = UI prête mais bloquée par le moteur backend (BLOC1). Rapport : BLOC2-audit-frontend.md.

- [BLOC3] Plan différenciateurs (0 API, 0 modif). 7 skills lues (in/out Pydantic, modèle, source inputs). Confirmé : synorix NON câblé à main.py/routers → isolé. Pattern de branchement : router dédié `synorix_skills.py` en AJOUT (moteur A intact). Ordre reco : déterministes #95 OAB + #24 retenue (0$, 0 risque) → #92 RSE → #89 → #88 → #86 RAO → #70/#71 Score (conditionné par moteur mémoire + critères jugement). Rapport : BLOC3-plan-differenciateurs.md.

- [BLOC4] Non-régression : `pytest synorix/` → **199 passed** (9s) ; `pytest tests/` → **295 passed** (4s). TOTAL **494 verts, 0 échec**. Aucun fichier cœur modifié cette nuit (monkeypatch confiné au script jetable). Note : les tests ne couvrent PAS la génération mémoire réelle → d'où la non-détection des bugs BLOC1. Rapport : BLOC4-tests.md.
