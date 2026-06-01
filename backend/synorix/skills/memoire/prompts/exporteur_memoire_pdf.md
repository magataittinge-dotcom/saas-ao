# Référence des règles — Skill #63 `exporteur-memoire-pdf`

> ⚠️ `model = "none"` : **aucun appel LLM**. L'export PDF applique des contrôles
> déterministes (Python). Ce fichier documente les contraintes N5, pour audit.

## Contraintes de dépôt PDF sur plateformes (verbatim)
<!-- Source: NotebookLM N5 (Plateformes), 01/06/26 -->

- **Nommage des fichiers** : désignation explicite de la pièce, ex. `Societe_Memoire_technique` (jamais un nom générique).
- **Poids** : limite **conseillée ~30 Mo sur AWS** → compresser le PDF, optimiser la résolution des images.
- **Signature électronique** (souvent facultative au dépôt depuis 2016 ; si exigée par le RC) :
  - **Ne jamais signer uniquement le .zip** (aucune valeur juridique aux fichiers contenus) → signer **individuellement chaque fichier** du ZIP.
  - Certificat conforme **RGS** (au min. RGS\*\*) ou qualifié **eIDAS**.
  - Format **PAdES** recommandé pour un PDF (signature intégrée) ; CAdES/XAdES acceptés mais jetons séparés à inclure dans le pli.
- **⚠️ Hors corpus N5** : aucune exigence de **résolution DPI** ni d'obligation **PDF/A** dans les sources → `[À COMPLÉTER — DPI/PDF-A non spécifiés ; optimisation recommandée par déduction]`.

## Implémentation déterministe
- Normaliser le nom de fichier en `Societe_Memoire_technique` (slug entreprise + pièce).
- Alerter si le poids dépasse la limite plateforme (~30 Mo AWS par défaut).
- Si signature exigée : signer chaque fichier (jamais le seul ZIP), format PAdES par défaut.
