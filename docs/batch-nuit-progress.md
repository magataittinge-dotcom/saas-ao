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

### PHASE 2 — lots (4 skills) ✅ TERMINÉE — 10 tests verts
- [OK] #6 recherche-lots (Sonnet, N8) — double source RC+DPGF, tranches/sous-lots, allotissement L.2113-10
- [OK] #7 detection-corps-de-metier-lot (Haiku, N4) — enum 10 corps + autre, mots-clés par corps
- [OK] #8 extraction-description-lot (Sonnet, N4) — structure CCTP fasc. CCTG, prestations principales/accessoires
- [OK] #9 detection-incoherences-lots (Sonnet, N6) — matériel/cosmétique, juris. CE NAYMA n°492938 + TA Nantes n°2506999

### PHASE 3 — extraction (16 skills) ✅ TERMINÉE — 36 tests verts
- [OK] #10 exigences-administratives (Sonnet, N2) · #11 pieces-offre (Sonnet, N2) · #12 exigences-techniques (Sonnet, N4) · #13 criteres-jugement (Sonnet, N7, 3 formules DAJ)
- [OK] #14 visite-obligatoire-analyse (Sonnet, présentation/reuse #5) · #15 cautionnement-garanties (Sonnet, N1, Art.19) · #16 pieges-dce (Sonnet, N6) · #17 incoherences-dce (Sonnet, N6, CE NAYMA)
- [OK] #18 liaison-coffre-fort (Haiku, N2 reuse #10) · #19 enrichissement-source-document (Haiku, technique PDF) · #20 surlignage-exigence-complete (Sonnet, technique PDF) · #21 documents-a-completer (Sonnet, N2 reuse #1)
- [OK] #22 validation-completude-document (Haiku, N2) · #23 synthese-executive-dce (Sonnet, agrégation) · #24 calculatrice-retenue-garantie (model="none", déterministe, N1) · #35 validation-piece-coffre-fort (Haiku, N2 reuse #10)

### PHASE 4 — memoire (28 skills) — à démarrer
- #36-#63 (génération mémoire technique ; Opus 4.7 pour les rédacteurs long-form, Sonnet/Haiku pour récup/scoring). Notebook principal N3 (mémoires gagnants) + N4 (méthodologie).

---

## Compteurs
- OK : 27 (Phase 0 = 2, Phase 1 = 5, Phase 2 = 4, Phase 3 = 16)
- Incomplètes : 0
- Restantes (cible) : memoire(28) + verification(8) + export(4) + sidebar(6) + chatbot(5) = 51

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- #34 étanchéité : ajout NF DTU 43.11 + 20.12 (non listés au registry).
- #2 date-limite : N2 (pièces admin) ne couvre PAS la date-limite ; grounding réel via N1. Suggestion : re-router #2 → N1 ou enrichir N2 avec RC réels.
- #24 calculatrice : N1 contient le CCAG **MOE**, pas le CCAG **Travaux 2021** intégral → formules pénalités/intérêts partiellement hors corpus (signalées). Suggestion : ajouter le CCAG Travaux 2021 à N1.
- Divers (#1, #3, #11) : sigles DPGF/BPU/DQE + formats fichiers + marqueurs de version signalés par N2 comme « pratique courante » hors corpus strict — universels, conservés avec marqueur.

## REPRENDRE À
PHASE 4 / memoire / #36 recuperation-profil-entreprise
