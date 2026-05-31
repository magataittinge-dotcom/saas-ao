# Batch Nuit — Progression (run autonome)

**Démarré :** 2026-05-31
**Pattern de référence :** `expert_ite` (#26) — 3 fichiers + raw extract + __init__ + pytest
**Notebooks :** N1=08531eb6 N2=7a661d76 N3=43615791 N4=777badb4 N5=39ae9088 N6=1108bddc N7=8ff1cdc4 N8=5574a7d1
**Auth NotebookLM :** OK (Pro, limites 4×)

---

## Journal

### PHASE 0 — Recaptures prioritaires ✅ TERMINÉE
- [OK] #34 expert-etancheite : 5/5 questions capturées (N4 Q1/Q2/Q3/Q5 + N3 Q4). Squelette → contenu réel. version 1→2. Tests verts.
- [OK] #33 expert-menuiserie : Q4 (N3) recapturée directe. Phrases-types N4-dérivées remplacées. version 1→2. Tests verts.
- Divergence loggée : #34 → registry liste 43.1/43.3/43.4/43.5 ; N4 ajoute **NF DTU 43.11** (global TT) + **NF DTU 20.12** (support GO). Suivi NotebookLM. → arbitrage Mohamed.
- Commit Phase 0 : à faire.

### PHASE 1 — upload (5 skills) ✅ TERMINÉE — 15 tests verts
- [OK] #1 recherche-types-documents (Haiku, N2) — taxonomie 15+ types DCE
- [OK] #2 detection-date-limite (Sonnet, N2+N1) — RC fait foi, horodatage serveur, divergence jamais tranchée
- [OK] #3 detection-doublons-versions (Haiku/technique, N2) — SHA-256 exact + marqueurs version
- [OK] #4 detection-plateforme-depot (Haiku, N5) — allowlist 5 plateformes, URL jamais brute
- [OK] #5 detection-visite-obligatoire (Sonnet, N6+N1) — juris. TA Rennes 25/10/2010 Ekdo Redon

### PHASE 2 — lots (4 skills) — à démarrer
- #6 recherche-lots (Sonnet, N?) · #7 detection-corps-de-metier-lot (Haiku) · #8 extraction-description-lot (Sonnet) · #9 detection-incoherences-lots (Sonnet, N6)

---

## Compteurs
- OK : 7 (Phase 0 = 2, Phase 1 = 5)
- Incomplètes : 0
- Restantes (cible) : lots(4) + extraction(16) + memoire(28) + verification(8) + export(4) + sidebar(6) + chatbot(5) = 71

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- #34 étanchéité : ajout NF DTU 43.11 + 20.12 (non listés au registry).
- #2 date-limite : N2 (pièces admin) ne couvre PAS la date-limite ; grounding réel via N1. Suggestion : re-router #2 → N1 ou enrichir N2 avec RC réels.

## REPRENDRE À
PHASE 2 / lots / #6 recherche-lots
