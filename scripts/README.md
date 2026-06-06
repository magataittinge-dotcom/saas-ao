# scripts/ — outils de test JETABLES (hors backend)

Scripts ad hoc de comparaison et de test end-to-end du moteur IA. **Non intégrés au backend**, lancés manuellement via le venv (`backend/venv/bin/python scripts/<x>.py`) depuis la racine du repo. Ils chargent `backend/.env` et appellent les services directement (fallback sans serveur).

⚠️ Certains consomment l'API Anthropic (génération mémoire / analyse) — coût réel. Les calculs déterministes et l'inspection de fichiers = 0 API.

## Comparaison analyse DCE (A/B)
- `compare_a_analyse.py` — runner système A (dce_analyzer) sur le DCE Gueux.
- `compare_b_analyse.py`, `compare_b_diag.py`, `compare_b_diag2.py` — runners/diagnostics système B.

## End-to-end mémoire (génération)
- `e2e_memoire_gueux.py` — e2e Bloc 1 (analyse réutilisée → checklist → mémoire → export). Contient les monkeypatch de diagnostic des défauts mémoire (historique).
- `e2e_memoire_gueux_repare.py` — mémoire **réparé** (découpage par partie), full-Opus → sortie `nuit-rapport/memoire-gueux-REPARE`.
- `e2e_memoire_gueux_sonnet.py` — full-Sonnet (override modèle).
- `e2e_memoire_gueux_hybride.py` — hybride Sonnet a/b + Opus partie_c (test écarté).
- `e2e_memoire_gueux_sonnet_renforce.py` — full-Sonnet + prompt densité renforcé.
- `e2e_memoire_gueux_sonnet_f1.py` — full-Sonnet + prompt F1 (few-shot + quota).
- `e2e_memoire_gueux_sonnet_f1v2.py` — full-Sonnet + prompt **F1 v2** (EPI corpus-only) — **version retenue**.

## Métriques
- `_compare_memoire_metrics.py` — métriques objectives d'un mémoire JSON (densité, sous-sections, anti-invention). Usage : `python scripts/_compare_memoire_metrics.py <chemin.json> [label]`.

> Sorties sauvegardées dans `docs/comparaison-AB/` et `docs/comparaison-memoire-AB/`. Voir `docs/comparaison-memoire-AB/RESULTAT.md` pour la synthèse.
