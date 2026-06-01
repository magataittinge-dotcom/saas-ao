# Référence des règles — Skill #85 `simulateur-prix-DAJ`

> ⚠️ `model = "none"` : **aucun appel LLM**. Calcul déterministe des 3 formules
> DAJ (la formule applicable est celle du RC, fournie en entrée). Conforme à la
> règle de mission « formules DAJ → none si calcul pur ». Divergence assumée vs
> registry (Haiku) — loggée pour arbitrage Mohamed.

## Formules DAJ Bercy (base 10)
<!-- Source: NotebookLM N7, 01/06/26 (réutilise capture #13) -->

- **Inversement proportionnelle** (classique, neutre) : `Note = (prix_bas / prix_offre) × 10` (sur 40/50 : `× 40 (ou 50)`).
- **Linéaire** : `Note = 10 − 10 × [(prix_offre − prix_bas) / (prix_haut − prix_bas)]`.
- **Moyenne des offres** : `Note = (10 × prix_moyen) / (prix_moyen + prix_offre)`.
- **Variante AMF** : `Note = 200 × prix_bas / (prix_bas + prix_offre)` (base 100).

## Sortie déterministe
Note du candidat selon **chaque** formule (sur la base demandée), identification de la **formule la plus favorable** au candidat, et écart vs la meilleure note. La formule réellement applicable est celle indiquée au RC (entrée `formule_rc`).
