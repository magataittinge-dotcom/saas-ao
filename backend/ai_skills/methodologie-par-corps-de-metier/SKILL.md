---
name: methodologie-par-corps-de-metier
description: "Méthodologies détaillées d'exécution par corps de métier BTP France. Étapes précises dans l'ordre chronologique, normes DTU par étape, points singuliers critiques, autocontrôles, matériaux certifiés, erreurs fréquentes causant sinistres. Utilisé par le générateur de mémoire technique pour produire une section C (méthodologie) de niveau 5/5 aux yeux des acheteurs publics. Utilise ce skill dès qu'un mémoire technique est généré, dès qu'un lot BTP est identifié, ou dès que l'utilisateur demande une méthodologie d'exécution pour un corps de métier du bâtiment."
---

# Méthodologies d'exécution BTP — Guide par corps de métier

Ce skill contient les méthodologies complètes d'exécution pour les 8 principaux corps de métier du BTP en France. Chaque méthodologie est structurée pour produire une section C (Méthodologie mise en oeuvre) de mémoire technique de niveau expert, conforme aux attentes des acheteurs publics.

## Corps de métier disponibles

| # | Corps de métier | Fichier référence | Mots-clés de détection |
|---|----------------|-------------------|----------------------|
| 1 | Façades / ITE / Ravalement | `references/01-facades-ite-ravalement.md` | ITE, ETICS, façade, ravalement, enduit, bardage, isolation extérieure |
| 2 | Gros oeuvre / Maçonnerie / Béton armé | `references/02-gros-oeuvre-maconnerie.md` | gros oeuvre, béton, maçonnerie, fondation, voile, dalle, plancher |
| 3 | Peinture / Revêtements intérieurs | `references/03-peinture-revetements.md` | peinture, revêtement mural, papier peint, sol souple, carrelage intérieur |
| 4 | Électricité | `references/04-electricite.md` | électricité, courant fort, courant faible, tableau, câblage, NF C 15-100 |
| 5 | VRD (Voirie et Réseaux Divers) | `references/05-vrd.md` | VRD, voirie, assainissement, réseau, enrobé, tranchée |
| 6 | Plomberie / CVC | `references/06-plomberie-cvc.md` | plomberie, chauffage, ventilation, climatisation, sanitaire, CVC |
| 7 | Étanchéité / Couverture | `references/07-etancheite-couverture.md` | étanchéité, toiture, couverture, terrasse, membrane, zinguerie |
| 8 | Menuiseries extérieures | `references/08-menuiseries-exterieures.md` | menuiserie, fenêtre, porte, volet, vitrage, aluminium, PVC |

Les données transversales (autocontrôles génériques, conditions météo, planning type) sont dans `references/00-transversal.md`.

## Comment utiliser ce skill

### Lors de la génération d'un mémoire technique

1. **Identifier le corps de métier** à partir du nom du lot (ex: "Lot 05 — Revêtement de Façade + ITE" → fichier `01-facades-ite-ravalement.md`)
2. **Charger la référence correspondante** via Read tool
3. **Adapter au CCTP spécifique** du marché :
   - Remplacer les matériaux génériques par ceux prescrits au CCTP
   - Ajouter les contraintes spécifiques du chantier (site occupé, zone sismique, monument historique...)
   - Ajuster les épaisseurs, sections, puissances selon les plans d'exécution
   - Citer les normes DTU mentionnées dans le CCTP en plus de celles de la référence
4. **Rédiger la méthodologie** en suivant l'ordre chronologique strict des étapes
5. **Charger les données transversales** (`00-transversal.md`) pour les autocontrôles et conditions météo

### Structure attendue de la section C

Pour obtenir 5/5 en méthodologie aux yeux des acheteurs publics, la section doit contenir :

- **Ordre chronologique** : chaque étape numérotée dans l'ordre réel d'exécution sur chantier
- **Normes DTU** : référence normative citée à chaque étape (pas seulement en fin de document)
- **Points singuliers** : traitement détaillé des points critiques (c'est ce qui différencie un 3/5 d'un 5/5)
- **Autocontrôles** : valeurs chiffrées (tolérances, seuils, fréquences de contrôle)
- **Matériaux** : noms commerciaux ou génériques avec certifications requises (ACERMI, CSTB, NF, CE)
- **Conditions d'application** : températures, hygrométrie, délais de séchage
- **Erreurs à éviter** : formulées positivement ("nous veillons à..." plutôt que "il ne faut pas...")
- **Planning** : durées estimées par étape, enchaînement des tâches

### Adaptation multi-lots

Si le projet comporte plusieurs lots attribués à la même entreprise, charger les références correspondantes et articuler les méthodologies entre elles (interfaces entre lots, phasage, co-activité).

### Ton et style

- Rédiger à la première personne du pluriel ("Nous procédons à...", "Notre équipe réalise...")
- Ton professionnel et confiant, démontrant la maîtrise technique
- Valoriser les bonnes pratiques comme des choix délibérés de l'entreprise
- Chaque affirmation technique doit pouvoir être vérifiée (norme, avis technique, fiche produit)
