# Raw extract — Skill #68 `detection-pieces-manquantes-vs-ao`

**Captured:** 2026-06-01 — pratiques BE.
<!-- Skill technique de matching sémantique : peu d'expertise NotebookLM requise. -->

Matcher « pièce demandée par le RC » ↔ « pièce présente dans le dossier » en évitant les faux positifs :
- Gérer **synonymes / alias** (ex. « attestation fiscale » = « attestation de régularité fiscale » ; DC1 = lettre de candidature).
- Gérer **homonymes** (ne pas confondre deux pièces de libellé proche).
- Objectif : **0 faux négatif** (toute pièce manquante détectée). En cas de doute, classer « à vérifier » plutôt que « présent ».
- Ton positif : sortie « À ajouter » (pas « Manquant »).
