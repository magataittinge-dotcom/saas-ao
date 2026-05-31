# Raw NotebookLM extract — Skill #3 `detection-doublons-versions`

**Captured:** 2026-05-31 — N2 (7a661d76). Skill technique (grounding léger).

## Q1 (N2) — Marqueurs de nouvelle version
- Grounded N2 : « **acte spécial modificatif** » (mise à jour DC4 sous-traitance) [1] ; « **mis à jour** » / « **version actualisée** » (formulaires DC1, DC2) [2].
- Hors corpus (pratique courante, signalé par N2) :
  - Marqueurs textuels : « Annule et remplace » (canonique, rouge/gras page de garde) ; « Document modificatif » / « Avis rectificatif n°X » ; cartouche de révision (date, auteur, nature, indice A/B/C).
  - Patterns nommage : `_IndA`/`_IndiceB`, `_V2`/`_v3`, `MODIF_`, `_Modificatif1`, `_AnnuleEtRemplace`, `_MAJ_20260520`.
  - Note : l'acheteur publie souvent une `Note_aux_candidats_Modif_1.pdf` ou un message plateforme listant les fichiers annulés/remplacés.

## Build notes
- Doublons exacts = SHA-256 identique (déterministe, 100 %). Versions = marqueurs textuels (LLM Haiku).
- Skill technique : code + prompt depuis spec registry + marqueurs N2.
