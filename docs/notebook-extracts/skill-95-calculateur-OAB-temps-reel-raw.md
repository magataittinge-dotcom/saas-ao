# Raw NotebookLM extract — Skill #95 `calculateur-OAB-temps-reel`

**Captured:** 2026-06-01 — Notebook N7 `Scoring Evaluation Offres MP BTP` (8ff1cdc4). Reformulé downstream; non chargé au runtime.

## Q1 + Q2 — Méthode de la double moyenne (OAB, L2152-5 CCP) + jurisprudence

**Définition (L2152-5 CCP) :** une OAB est une « offre dont le prix est manifestement sous-évalué et de nature à compromettre la bonne exécution du marché ». Le code n'impose **aucune formule** ; la jurisprudence valide la méthode de la **double moyenne**.

**Méthode de la double moyenne — 4 étapes exactes :**
1. **M1** = moyenne simple de toutes les offres reçues et acceptables.
2. **Exclusion** des offres « anormalement hautes » : exclure toute offre **> 1,2 × M1** (supérieure de 20 % à M1).
3. **M2** = nouvelle moyenne des offres restantes.
4. **Seuil de déclenchement** : suspicion d'OAB si l'offre **< 0,9 × M2** (10 % sous M2). *Variante AMF : 0,85 × M2 (15 % sous M2).*

**Jurisprudence :** **TA Nantes, 19 mai 2025, Société Verchéenne, n° 2506407** — l'acheteur qui rejette une offre au seul motif qu'elle est sous-évaluée, **sans demander préalablement de justification (contradictoire)**, méconnaît les principes d'égalité de traitement et de transparence → annulation.

**Implication produit (#95, Haiku/déterministe) :** calcul pur de M1, M2, seuil OAB en €, marge candidat avant zone OAB, gauge vert/orange/rouge. Toujours rappeler l'obligation de **procédure contradictoire** avant tout rejet (Verchéenne).
