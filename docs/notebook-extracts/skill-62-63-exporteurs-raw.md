# Raw NotebookLM extracts — Skills #62 `exporteur-memoire-docx` & #63 `exporteur-memoire-pdf`

**Captured:** 2026-06-01. Skills déterministes (`model = "none"`). Reformulé downstream; non chargé au runtime.

## #62 — Mise en page .docx (Notebook N3, 43615791)

- **Mise en gras stratégique (lecture en diagonale)** : convention majeure chez Cariso — mettre en **gras** les mots-clés, engagements forts, bénéfices client (ex. « meilleures conditions », « 3 ouvriers »). L'acheteur scanne la page en 30 secondes.
- **Listes à puces synthétiques** plutôt que longues phrases (ex. « 6 fourgons L3H2 », « 5 000 m² d'échafaudage »).
- **Visuel comme preuve** : photos d'engins avec caractéristiques (ex. « MRT 2540 portée de 25,40 m »), protections collectives, section « Réalisations illustrées » ; pictogrammes et encadrés colorés pour les éléments vitaux.
- **⚠️ Cadre imposé (point de vigilance juridique)** : si le RC impose un **Cadre de Réponse Technique (CRT)** ou **limite le nombre de pages** (ex. 12 ou 40 pages), s'y plier **strictement** ; dépasser la limite ou modifier un tableau imposé = rejet pour irrégularité.

## #63 — Dépôt PDF sur plateformes (Notebook N5 Plateformes, 39ae9088)

- **Nommage des fichiers** : désignation explicite de la pièce, ex. `Societe_Memoire_technique` (pas de nom générique).
- **Poids** : limite **conseillée ~30 Mo sur AWS** → optimiser/compresser le PDF, optimiser la résolution des images.
- **Signature électronique** (souvent facultative au dépôt depuis 2016 ; si exigée par le RC) :
  - **Ne jamais signer uniquement le .zip** (aucune valeur juridique aux fichiers contenus) → signer **individuellement chaque fichier** du ZIP.
  - Certificat conforme **RGS** (au min. RGS\*\*) ou qualifié **eIDAS**.
  - Format **PAdES** recommandé pour un PDF (signature intégrée au document) ; CAdES/XAdES acceptés mais génèrent des jetons séparés à inclure dans le pli.
- **⚠️ Hors corpus N5** : aucune exigence de **résolution DPI** ni d'obligation **PDF/A** dans les sources → `[À COMPLÉTER — DPI/PDF-A non spécifiés par les sources ; optimisation recommandée par déduction]`.
