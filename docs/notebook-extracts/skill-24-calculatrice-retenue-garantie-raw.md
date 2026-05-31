# Raw NotebookLM extract — Skill #24 `calculatrice-retenue-garantie`

**Captured:** 2026-05-31 — N1 (08531eb6). Skill déterministe (aucun LLM en run).

## Q1 (N1) — Formules CCAG/CCP
> N1 contient le CCAG MOE (pas Travaux). Formules Travaux signalées par NotebookLM comme connaissances générales (astérisques), conservées avec mention.

1. **Retenue de garantie** : `Montant TTC × taux` (≤ 5 %), base TTC, prélevée sur acomptes [1]. **Art. 19 CCAG-T 2021** [2].
2. **Pénalités de retard** : `P = V × R / diviseur` ; CCAG MOE = /3000 [3], Travaux souvent /1000. Base HT. Plafond **10 % HT**, seuil exonération **1 000 €** [4]. Art. 19.
3. **Intérêts moratoires** : `créance TTC × (taux BCE + 8 pts) × jours/365 + 40 €`. Dépend du taux BCE [5]. Art. 53.2 CCAG-T [6] ; CCP **R2192-31**.
4. **Cautionnement** (substitution RG) : `Montant TTC × taux RG` (≤ 5 %) [1]. CCP **R2191-36** et s.

## Build notes
- model="none" : calcul Python pur, vérifiable, le client n'est jamais appelé. Plafonds/seuils codés. Diviseur pénalités paramétrable.
- **Divergence registry/NotebookLM** : N1 contient le CCAG MOE, pas le CCAG Travaux 2021 intégral → formules Travaux partiellement hors corpus. Suggestion Mohamed : ajouter le CCAG Travaux 2021 à N1.
