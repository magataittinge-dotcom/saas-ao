# Référence des règles — Skill #95 `calculateur-OAB-temps-reel`

> ⚠️ `model = "none"` : **aucun appel LLM**. Calcul déterministe (Python),
> conformément à la nature « calculs déterministes » du registry (#95) et à la
> règle de mission « calculateurs / OAB / formules → none si calcul pur ».
> Divergence assumée vs registry (Haiku) — loggée pour arbitrage Mohamed.

## Méthode de la double moyenne (OAB, L2152-5 CCP)
<!-- Source: NotebookLM N7, 01/06/26 -->

Une OAB = « offre dont le prix est manifestement sous-évalué et de nature à compromettre la bonne exécution du marché » (**L2152-5 CCP**). Aucune formule imposée ; la jurisprudence valide la **double moyenne** :

1. **M1** = moyenne simple de toutes les offres acceptables.
2. **Exclusion** des offres > **1,2 × M1** (anormalement hautes).
3. **M2** = moyenne des offres restantes.
4. **Seuil OAB** : offre **< 0,9 × M2** (variante AMF : 0,85 × M2).

## Jurisprudence (verbatim)
<!-- Source: NotebookLM N7, 01/06/26 -->

**TA Nantes, 19 mai 2025, Société Verchéenne, n° 2506407** : rejeter une offre au seul motif qu'elle est sous-évaluée **sans procédure contradictoire** méconnaît l'égalité de traitement et la transparence → annulation. Le calculateur rappelle **toujours** cette obligation de contradictoire avant tout rejet.

## Sortie déterministe
M1, M2, seuil OAB (€), marge du candidat avant la zone OAB, gauge `vert|orange|rouge`, rappel contradictoire.
