# Référence des formules — Skill #24 `calculatrice-retenue-garantie`

<!-- Skill DÉTERMINISTE : aucun appel LLM. Ce fichier documente les formules implémentées en Python (run()). Conservé pour la traçabilité et l'audit. -->

## Nature

Cette skill **ne fait pas d'inférence** : elle calcule des montants par des formules fixes. Le système prompt n'est pas envoyé à un modèle ; ce document sert de **référence d'audit** des formules.

## Formules implémentées
<!-- Source: NotebookLM N1 (CCAG / CCP), 31/5/26. Note : N1 contient le CCAG MOE ; certaines formules Travaux signalées comme connaissances générales par NotebookLM, conservées avec mention. -->

### 1) Retenue de garantie (Art. 19 CCAG-Travaux 2021)
`RG = Montant TTC × taux` — taux **≤ 5 %** (plafond). Base **TTC**. Prélevée sur acomptes.

### 2) Pénalités de retard (Art. 19 CCAG-Travaux 2021)
`P = V × R / diviseur` — V = valeur HT des travaux en retard, R = jours calendaires de retard.
- Diviseur : **3000** (CCAG MOE, grounded N1) ; le CCAG Travaux utilise fréquemment **1000** (paramétrable `penalite_diviseur`).
- Base **HT**. Plafond **10 % du montant HT**. Seuil d'exonération : montant < **1 000 €**.

### 3) Intérêts moratoires (retard de paiement — CCP R2192-31)
`I = créance TTC × (taux BCE + 8 points) × (jours retard / 365) + 40 € (frais de recouvrement)`.
- Base **TTC**. Pas de plafond. Le taux dépend du taux directeur **BCE** (à fournir).
- Art. 53.2 CCAG-T pour la réclamation/interruption.

### 4) Cautionnement (substitution à la RG — CCP R2191-36 et s.)
`Caution = Montant TTC × taux RG` — strictement égal à la RG remplacée (**≤ 5 %**).

## Avertissements émis
- Taux RG > 5 % → plafonné.
- Pénalités > 10 % HT → plafonnées.
- Pénalités < 1 000 € → seuil d'exonération possible.

## Sortie
Objet `Output` : `montant_ttc`, liste `postes` (poste, montant, base HT/TTC, détail de calcul), `avertissements`. Tous les montants sont vérifiables à la main.
