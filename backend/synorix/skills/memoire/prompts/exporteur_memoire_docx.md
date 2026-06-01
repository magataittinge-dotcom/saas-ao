# Référence des règles — Skill #62 `exporteur-memoire-docx`

> ⚠️ `model = "none"` : **aucun appel LLM**. L'export applique une charte
> déterministe (Python). Ce fichier documente les conventions N3, pour audit.

## Charte de mise en page .docx (verbatim)
<!-- Source: NotebookLM N3, 01/06/26 -->

- **Mise en gras stratégique** (lecture en diagonale) : convention majeure Cariso — mots-clés, engagements forts, bénéfices client en **gras** (l'acheteur scanne en 30 s).
- **Listes à puces synthétiques** plutôt que longues phrases (ex. « 6 fourgons L3H2 »).
- **Visuel comme preuve** : photos d'engins avec caractéristiques, protections collectives, section « Réalisations illustrées » ; pictogrammes et encadrés colorés pour les éléments vitaux.
- **⚠️ Cadre imposé (vigilance juridique)** : si le RC impose un **Cadre de Réponse Technique (CRT)** ou **limite le nombre de pages** (ex. 12 ou 40), s'y plier **strictement** — dépasser la limite ou modifier un tableau imposé = **rejet pour irrégularité**.

## Implémentation déterministe
- Charte Synorix : police, taille, marges, en-tête/pied de page, sommaire, numérotation.
- **Vérification de la limite de pages** du RC → alerte bloquante si dépassée.
- Le rendu .docx doit être **identique à la prévisualisation**.
