# RÉCAP — Mission Nuit (2026-06-02)

Test end-to-end + audits + plans, en autonomie supervisée. **Cœur IA jamais modifié.** Tout sur `refactor-v2`, pushé bloc par bloc.

## Budget API consommé
| Poste | Cap | Utilisé | Coût estimé |
|-------|-----|---------|-------------|
| Analyse DCE | 3 | **0** (réutilisée run 00:17) | 0 $ |
| Génération mémoire | 3 | **3** (cap atteint) | **≈ 8 $** |
| Exports (DOCX/ZIP) | ∞ | plusieurs | 0 $ (déterministe) |
| **TOTAL nuit** | | | **≈ 8 $** |

Les 3 appels mémoire ont servi à diagnostiquer en cascade les 3 défauts bloquants puis à récupérer un mémoire complet pour inspection qualité. Plus aucun appel mémoire possible (cap).

---

## Synthèse par bloc

| Bloc | Sujet | Verdict | Livrable |
|------|-------|---------|----------|
| **1** | Test end-to-end DCE Gueux | 🟠 **OUI avec réserves majeures** | `BLOC1-end-to-end.md` + mémoire `.md`/`.docx`/RAW |
| **2** | Audit frontend | 🟢 Front **mature & câblé**, 0 stub | `BLOC2-audit-frontend.md` |
| **3** | Plan différenciateurs | 🟢 7 skills isolées, ordre de branchement | `BLOC3-plan-differenciateurs.md` |
| **4** | Non-régression | 🟢 **494 tests verts**, 0 échec | `BLOC4-tests.md` |
| **5** | Déterministes service pur | 🟢 OAB+retenue prêts (non câblés), **499 verts** | `BLOC5-determ-service-pur.md` + `services/synorix_calc.py` |

---

## Verdict end-to-end (la question centrale)

> **🟠 Le pipeline tourne TECHNIQUEMENT de bout en bout** (analyse 98 exigences → checklist → mémoire → export DOCX valide), **MAIS la génération de mémoire est CASSÉE en production** par 3 défauts empilés jamais détectés avant cette nuit (premier test réel du maillon mémoire).

**Le fond du mémoire est excellent** (très spécifique au DCE Gueux, sections réglementaires Vague 2 toutes présentes, **0 donnée entreprise inventée**, 57 placeholders propres). **La forme est bloquée** par la troncature. **Réparer le moteur mémoire débloque un parcours utilisateur déjà entièrement construit côté front** → ROI maximal.

---

## 🎯 TOP 3 PRIORITÉS au réveil

### 1. 🔴 RÉPARER LE MOTEUR MÉMOIRE (blocage produit n°1)
Trois défauts dans `services/ai/memoire_generator.py`, **non corrigés cette nuit** (cœur en lecture seule) — diagnostic complet dans BLOC1 :
- **#1** `temperature=0` (l.433) → **HTTP 400** avec `claude-opus-4-7` (param déprécié). *Fix : retirer la ligne.*
- **#2** `max_tokens=16000` (l.432) → mémoire **tronqué** ; même 32000 ne suffit pas (le mémoire veut > 32k tokens out). *Fix architectural : générer **partie par partie** (1 appel Opus/partie, ~16k chacun) puis assembler.*
- **#3** `raise ValueError` sur JSON incomplet (l.507-509) → rien retourné en cas de troncature. *Fix : récupérer le partiel (json_repair) au lieu de lever.*
- Puis **re-tester end-to-end** (budget : 1 génération).

### 2. 🟢 BRANCHER LES DÉTERMINISTES + corriger la sidebar (quick wins, 0 $, 0 risque)
- `services/synorix_calc.py` est **prêt** (BLOC5) : OAB #95 + retenue-garantie #24, testés, isolés. Branchement = 1 router en ajout + UI (~20 min, recette dans BLOC5). Valeur client immédiate, aucun coût LLM.
- Ajouter **« Mon entreprise » (`/company`) à la sidebar** (`Sidebar.tsx`, page déjà fonctionnelle mais absente du menu — fix 1 ligne, cf. BLOC2).

### 3. 🟡 FIABILISER L'EXTRACTION DES CRITÈRES + filet de test mémoire
- `criteres_jugement = 0` dans l'analyse du DCE Gueux (BLOC1) → vérifier l'extraction des critères de jugement côté `dce_analyzer` (bloque aussi #86 RAO-prédictif, et prive le mémoire de pondération).
- Vérifier que **DC1/DC2/DC4** remontent bien comme exigences candidature (seules les attestations d'assurance le font actuellement).
- Ajouter un **test d'intégration mockable** sur `MemoireGenerator.generate` (chemin troncature/paramètres) : les bugs #1/#2/#3 sont passés sous les radars car **aucun test ne couvre la génération mémoire réelle** (BLOC4).

---

## Notes techniques transverses
- **Environnement :** seul `backend/venv/bin/python` (httpx 0.27.0) fonctionne ; le `python3` système (httpx 0.28.1) casse le client Anthropic 0.31 (`proxies`). À fixer pour le déploiement (pin httpx, ou bump anthropic).
- **Skills différenciateurs** (`backend/synorix/skills/`) : 199 tests verts, totalement isolées du moteur A — prêtes à brancher dans l'ordre de BLOC3.
- **Aucun fichier cœur modifié.** Les contournements (temperature/max_tokens/capture) sont confinés au script jetable `scripts/e2e_memoire_gueux.py`.

## Commits de la nuit (branche `refactor-v2`)
`b2d106d` BLOC1 · `41f5190` BLOC2 · `a7460a6` BLOC3 · `b1864e7` BLOC4 · `a45f5b7` BLOC5 — tous pushés.
