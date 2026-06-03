# RÉCAP — Mission Nuit 2 (2026-06-03)

Brancher les déterministes + auditer/planifier le reste. **Cœur IA jamais touché.** Tout sur `refactor-v2`, commit + push après chaque bloc.

## Budget API consommé : 0 $ (tout en 0-API)
- Mémoire **0/1**, analyse **0/1** — aucun appel IA cette nuit (Bloc 5 non exécuté faute de 2e DCE).
- Calculateurs déterministes + exports = 0 API.

## Synthèse par bloc

| Bloc | Sujet | Verdict | Livrable |
|------|-------|---------|----------|
| **1** | Brancher déterministes (OAB + retenue) | ✅ **branchés, testés, sécurisés** | router `/api/calculators` + 8 tests · `BLOC1-calculateurs.md` |
| **2** | Plan différenciateurs génératifs | ✅ 6 fiches + ordre | `BLOC2-plan-differenciateurs-generatifs.md` |
| **3** | Plan front ↔ calculateurs | ✅ page `/outils` + composants réutilisables | `BLOC3-front-calculateurs.md` |
| **4** | Non-régression + santé repo | ✅ 511 verts, 0 secret, git propre | `BLOC4-sante.md` |
| **5** | Validation 2e DCE | ⏭️ **pas de 2e cas dispo** (budget préservé) | `BLOC5-validation-2e-dce.md` |

## Ce qui est BRANCHÉ et TESTÉ cette nuit (production-ready)
- **2 endpoints déterministes** `POST /api/calculators/oab` et `/retenue-garantie` (math pure L2152-5 / CCAG-Travaux Art.19, 0 API, 0 coût récurrent).
- Authentifiés, validation Pydantic stricte (422 sur entrée invalide), délèguent à `synorix_calc` (logique testée nuit 1).
- **Ajout PUR** : 2 fichiers + 1 import/include `main.py`. Aucun router existant ni cœur IA modifié.
- **8 tests d'intégration** (nominal/limite/rejets/auth) ; suite globale **511 verts**.
- Commits : `6b89735` (Bloc 1) · `465fdb7` (Bloc 2) · `eb44305` (Bloc 3) · `636c7be` (Bloc 4). Tous pushés.

## 🎯 TOP 3 PRIORITÉS au réveil

### 1. 🟢 Brancher l'UI des calculateurs (valeur immédiate, ~0,5 j front, 0 API)
Backend prêt. Créer la page `/outils` + item sidebar (2 cartes OAB / retenue), réutiliser `StatusBadge` (jauge vert/orange/rouge), `SummaryCard` (postes), `AiTip` (rappel juridique). Détail : `BLOC3-front-calculateurs.md`. → Premier différenciateur visible par l'utilisateur.

### 2. 🟡 Brancher le 1er génératif : #92 RSE-2026 (Sonnet, inputs prêts)
Meilleur ratio valeur/risque (CCTP + profil déjà dispo, philosophie [À COMPLÉTER] alignée, ~0,10 $/appel). Puis **#70/#71 Synorix Score** en testant **Sonnet d'abord** (la skill est déclarée Opus mais la notation structurée devrait tenir à 1/5 du coût). Via un router `synorix_generatif.py` en AJOUT. Détail : `BLOC2-plan-differenciateurs-generatifs.md`.

### 3. 🟡 Fiabiliser l'extraction des critères de jugement + valider mémoire sur 2e DCE
`criteres_jugement = 0` sur Gueux (nuit 1) bloque **#86 RAO-prédictif** et prive le mémoire/Score de pondération. À corriger côté `dce_analyzer` (hors périmètre nuit, à faire en supervisé). Et quand un **2e DCE réel** sera dispo, valider le full-Sonnet renforcé hors lot étanchéité (`BLOC5`).

## Notes
- Cœur IA (`dce_analyzer`, `memoire_generator`, `prompts`, `ai_skills`) **non touché** cette nuit.
- Repo sain : `.env` gitignoré, 0 secret commité, `HEAD == origin/refactor-v2`.
- Le mémoire est en full-Sonnet renforcé depuis aujourd'hui (~1 $, −85 % vs Opus) — mapping modèle réajustable par segment si besoin.
