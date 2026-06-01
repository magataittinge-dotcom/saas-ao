# Raw NotebookLM extracts — Skills #76-#80 (sidebar)

**Captured:** 2026-06-01. Reformulé downstream; non chargé au runtime.

## #76 — Structure profil entreprise (N2 DC1/DC2, 7a661d76)
- **Identité** : raison sociale, forme juridique, SIRET, dirigeant, coordonnées, implantation (cf. #36).
- **Capacités économiques/financières** : CA global et CA "travaux" des **3 dernières années**.
- **Capacités techniques/professionnelles** :
  - **Effectifs** + moyens matériels ; validation régularité par attestation URSSAF, LNSE (salariés étrangers : titre + dates).
  - **Références de travaux similaires (3 dernières années)** — preuve par attestations de bonne exécution / certificats de capacité du MOA.
  - **Qualifications** (Qualibat, RGE, Qualifelec) — n° + date de validité ; ⚠️ Qualibat 8632/8633 non reconnues RGE après période transitoire **30/09/2026** (bascule CERTIBAT).
  - **Assurances** : RC Pro + **décennale** (L241-1 Code des assurances) valable à l'ouverture du chantier ; activités déclarées doivent couvrir strictement les travaux (assurance "peinture" ≠ ITE).

## #77 — Format références chantiers (N3, réutilise #37/#43)
<!-- Réutilise les captures #37 (critères miroir) et #43 (tableau). -->
Champs obligatoires : Année, Intitulé, Adresse, MOA, MOE, Lot, Montant HT, nature des travaux, contraintes surmontées, respect des délais, contact MOA. Optionnels : photos avant/après annotées, attestations de bonne exécution. Métadonnée : **score de pertinence** (corps de métier, montant, MOA, récence) pour réutilisation (#37). Volumétrie d'usage : 3-5 par AO.

## #78 — Taxonomie bibliothèque mémoire (N3, réutilise #38)
<!-- Réutilise la capture #38. -->
Double axe : **section** (préambule, présentation, méthodologie, sécurité, environnement, qualité, planning, références) × **corps de métier** (Gros Œuvre, Couverture/Étanchéité, Façade/ITE, Menuiserie, Électricité, Peinture/Plâtrerie…). Granularité = **paragraphe thématique** (réutilisable). Métadonnées : section, corps_de_metier, tags, source (mémoire importé), réutilisable (bool).

## #79 — Catégories coffre-fort (N2, >38 catégories)
N2 fournit > 38 catégories réparties en familles. Extraits :
- **Candidature** : DC1 (lettre de candidature), DC2 (déclaration du candidat), DC4 (sous-traitance), DUME.
- **Identité/légal** : **Kbis (≤ 3 mois)**, statuts, RIB (compte actif), pouvoir/délégation de signature.
- **Régularité fiscale et sociale** : attestation fiscale, attestation sociale URSSAF, attestation de régularité ; déclaration sur l'honneur (non-condamnation, non-interdiction de soumissionner) ; liste nominative des salariés étrangers (LNSE).
- **Assurances** : RC Pro, **décennale (L241-1)**.
- **Qualifications** : Qualibat, RGE, Qualifelec, ISO 9001/14001.
- **Post-attribution (NOTI/EXE)** : licence de transport, **NOTI6** (cessibilité de créance), **NOTI7** (garantie à première demande, alt. **NOTI8** caution), **EXE1/EXE1-T** (ordre de service, alt. EXE2 bon de commande), **EXE10/EXE11** (avenants).
- Chaque catégorie : alias, durée de validité indicative, document type d'origine, alternatives admises. Valeur inconnue → `[À COMPLÉTER — info manquante notebook N2]`.

## #80 — Insights historique AO (pratiques BE / commercial)
<!-- Skill analytique : indicateurs dérivés des pratiques BE, pas d'expertise NotebookLM verbatim. -->
Indicateurs utiles, présentés de façon premium (pas "dashboard froid") : taux de réussite global et par corps de métier, corps de métier les plus gagnants, MOA récurrents, montant moyen gagné/perdu, sous-critères régulièrement faibles (axes à renforcer), saisonnalité. Insights **actionnables** (« vous gagnez 2× plus sur les marchés scolaires < 1 M€ → cibler ce segment »).
