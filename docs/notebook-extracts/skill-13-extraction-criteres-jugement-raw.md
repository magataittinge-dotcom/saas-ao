# Raw NotebookLM extract — Skill #13 `extraction-criteres-jugement`

**Captured:** 2026-05-31 — N7 (8ff1cdc4). Build-time only.

## Q1 (N7) — Critères de jugement + formules prix DAJ
- Triptyque prix – valeur technique – délais [3]. Valeur technique en sous-critères (barème/points) [4,5] : méthodologie/procédés [5,6] ; moyens humains+matériels [5-7] ; prévention/nuisances/environnement (SOGED) [5,7] ; hygiène/sécurité/accès site occupé [5,8]. Échelle « Très satisfaisant »→« Absence d'information » ou 0-5 [9-11].

**Formules DAJ Bercy (base 10) :**
- Inversement proportionnelle (classique, neutre) : `Note = (prix le plus bas / prix offre) × 10` [12] ; sur 40/50 : `× 40 (ou 50)` [13,14].
- Linéaire : `Note = 10 − 10 × [(prix offre − prix bas) / (prix élevé − prix bas)]` [12].
- Moyenne des offres : `Note = (10 × prix moyen) / (prix moyen + prix offre)` [12].
- Variante AMF : `Note = 200 × prix bas / (prix bas + prix offre)` [15].

## Build notes
- Sonnet. Pondérations + formules verbatim ; ponderations_explicites=false si non données (jamais inventées).
