# Référence des formules — Skill #24 `calculatrice-retenue-garantie`

<!-- Skill DÉTERMINISTE : aucun appel LLM. Ce fichier documente les formules implémentées en Python (run()). Conservé pour la traçabilité et l'audit. -->

## Nature

Cette skill **ne fait pas d'inférence** : elle calcule des montants par des formules fixes. Le système prompt n'est pas envoyé à un modèle ; ce document sert de **référence d'audit** des formules.

## Formules implémentées
<!-- Source: NotebookLM N1, 01/06/26 (corpus enrichi : CCAG-Travaux 2021 intégral). Les formules Travaux sont désormais sourcées verbatim. Les articles du CCP (intérêts moratoires, cautionnement) restent partiellement hors corpus N1 — signalés. -->

### 1) Retenue de garantie (Art. 19.1 CCAG-Travaux 2021)
`RG = Montant TTC × taux` — taux **≤ 5 %** (plafond ; l'État l'a ramené à **2 %** pour ses propres marchés, plan de relance PME). **Libérée un an après la réception**, réserves levées.
- Base : le CCAG-Travaux 2021 **ne précise pas l'assiette** ; c'est le **CCP** qui impose le calcul sur le montant **TTC** des acomptes. *(Le CCP n'est pas intégralement dans N1 — assiette TTC confirmée par doctrine.)*

### 2) Pénalités de retard (Art. 19.2 CCAG-Travaux 2021) — VERBATIM
`P journalière = (montant HT du marché / tranche / bon de commande) × 1/3000` (Art. **19.2.3**).
- Diviseur **3000** confirmé par le **CCAG-Travaux 2021 (Art. 19.2.3)** : « pénalité journalière de **1/3 000 du montant hors taxes** de l'ensemble du marché, de la tranche considérée ou du bon de commande ». *(`penalite_diviseur` paramétrable si le CCAP déroge.)*
- Base **HT**. Plafond **10 % du montant total HT** (Art. **19.2.2**). Seuil d'exonération : total des pénalités ≤ **1 000 €** (Art. **19.2.1**).

### 3) Intérêts moratoires (retard de paiement — CCP R2192-31 / D2192-35)
`I = créance TTC × (taux BCE + 8 points) × (jours retard / 365) + 40 € (frais de recouvrement)`.
- Taux : **taux directeur BCE majoré de 8 points** (CCP **R2192-31**). Indemnité forfaitaire **40 €** (CCP **D2192-35**). Base **TTC**, pas de plafond.
- *(Les articles CCP R2192-31 / D2192-35 ne figurent pas intégralement dans N1 — valeurs confirmées par la réglementation, signalées.)*

### 4) Cautionnement (substitution à la RG — CCP R2191-36 et s.)
`Caution = Montant TTC × taux RG` — strictement égal à la RG remplacée (**≤ 5 %**).

## Avertissements émis
- Taux RG > 5 % → plafonné.
- Pénalités > 10 % HT → plafonnées.
- Pénalités < 1 000 € → seuil d'exonération possible.

## Sortie
Objet `Output` : `montant_ttc`, liste `postes` (poste, montant, base HT/TTC, détail de calcul), `avertissements`. Tous les montants sont vérifiables à la main.
