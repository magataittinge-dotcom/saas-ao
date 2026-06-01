# Corps de métier 4 : Électricité

## Normes de référence principales
- **NF C 15-100** (édition 2024) — Installations électriques à basse tension
- **NF C 14-100** — Installations de branchement (basse tension)
- **NF C 13-100** — Postes de livraison (HTA/BT)
- **Guide UTE C 15-520** — Canalisations — Modes de pose
- **Guide UTE C 15-559** — Luminaires et appareils d'éclairage
- **Guide UTE C 15-600** — Rapport de vérification
- **NF EN 61439** — Ensembles d'appareillage à basse tension (tableaux)
- **Arrêté du 22/10/1969** modifié — Installations électriques dans les ERP
- **Décret 2010-1016** — Obligations du maître d'ouvrage pour la sécurité des travailleurs
- **CONSUEL** — Certificat de conformité pour mise en service

---

## Étape 1 : Études et plans d'exécution

**Durée estimée : 3-10 jours selon taille du projet**

### Documents à produire
- Plans d'implantation électrique (logiciel DAO : AutoCAD, DraftSight, ou Revit)
- Schéma unifilaire du/des tableau(x) de distribution (TGBT, TD)
- Schéma de principe de la distribution
- Plan de cheminement des câbles (chemins de câbles, goulottes)
- Carnet de câbles (repérage de chaque circuit)

### Note de calcul
- Bilan de puissance par circuit et global
- Dimensionnement des protections (disjoncteurs, différentiels)
- Sections de câbles selon :
  - Intensité admissible (NF C 15-100 tableau 52H)
  - Chute de tension : **< 3%** pour éclairage, **< 5%** pour autres usages (entre l'origine et le point le plus éloigné)
  - Courant de court-circuit (pouvoir de coupure des protections)
- Sélectivité des protections (amont → aval)
- Coordination des DDR (Dispositifs Différentiels Résiduels)

### Validation
- Soumission au bureau de contrôle pour visa
- Correction des observations éventuelles
- Plans validés = base de travail pour l'exécution

**Référence normative : NF C 15-100 partie 3, Guide UTE C 15-520**

---

## Étape 2 : Chemins de câbles et distribution

**Durée estimée : 3-7 jours**

### Types de cheminement
| Cheminement | Usage | Norme |
|-------------|-------|-------|
| Chemin de câbles (dalle marine) | Distribution horizontale, faux-plafond | NF EN 61537 |
| Goulotte | Distribution apparente, locaux tertiaires | NF EN 50085 |
| Moulure | Petit cheminement apparent, rénovation | NF EN 50085 |
| Tube IRL (Isolant Rigide Lisse) | Cheminement apparent, locaux humides | NF EN 61386 |
| Tube ICTA (Isolant Cintrable Annelé) | Cheminement encastré dans cloisons/dalles | NF EN 61386 |
| Gaine TPC (Tube de Protection de Câble) | Cheminement enterré | NF EN 61386 |

### Règles de pose
- Percements et traversées de parois :
  - Rebouchage coupe-feu **obligatoire** après passage des câbles (mastic, mousse CF, calfeutrement)
  - Classement du rebouchage = classement de la paroi traversée
- Séparation courants forts / courants faibles :
  - Distance minimum **30cm** dans le même chemin de câbles (ou cloison séparative)
  - OU chemins de câbles séparés
- Remplissage maximum des conduits : **1/3 de la section** du tube (NF C 15-100 §523)
- Fixation des chemins de câbles : **tous les 1.50m** + à chaque changement de direction
- Rayons de courbure : **8× le diamètre extérieur** du câble minimum

### Zones de passage dans les cloisons (NF C 15-100 §528)
- Zone 1 : bande horizontale de 30cm sous le plafond
- Zone 2 : bande horizontale de 30cm au-dessus du sol
- Zone 3 : bande verticale de 20cm de chaque côté des angles
- Zone 4 : bande horizontale autour des ouvrants (15cm)
- Hors zones : cheminement vertical uniquement

**Référence normative : NF C 15-100 §521 à §529**

---

## Étape 3 : Câblage

**Durée estimée : 5-15 jours selon taille**

### Types de câbles courants
| Câble | Usage | Section typique |
|-------|-------|----------------|
| H07V-U / H07V-R | Conducteurs sous conduit | 1.5 à 10 mm² |
| U1000R2V | Câble multiconducteur courant | 1.5 à 35 mm² |
| R2V | Câble multiconducteur armé | 1.5 à 240 mm² |
| SYT1 | Courant faible (téléphone, interphone) | 0.5 à 0.9 mm² |
| Cat 6a / Cat 7 | Réseau informatique (RJ45) | — |
| Câble coaxial | TV, satellite | — |

### Sections minimales par circuit (NF C 15-100 §771)
| Circuit | Section mini | Protection | Nombre max points |
|---------|-------------|------------|-------------------|
| Éclairage | **1.5 mm²** | Disj. 16A | 8 points par circuit |
| Prises 16A | **2.5 mm²** | Disj. 20A | 8 prises par circuit (12 si section 2.5mm²) |
| Prises cuisine | **2.5 mm²** | Disj. 20A | 6 prises max |
| Cuisson (plaque) | **6 mm²** | Disj. 32A | 1 circuit dédié |
| Four | **2.5 mm²** | Disj. 20A | 1 circuit dédié |
| Lave-linge | **2.5 mm²** | Disj. 20A | 1 circuit dédié |
| Lave-vaisselle | **2.5 mm²** | Disj. 20A | 1 circuit dédié |
| Sèche-linge | **2.5 mm²** | Disj. 20A | 1 circuit dédié |
| Chauffe-eau | **2.5 mm²** | Disj. 20A | 1 circuit dédié |
| Chauffage | **1.5 mm²** (≤ 2250W) / **2.5 mm²** (≤ 4500W) | Disj. 10A/20A | Selon puissance |
| VMC | **1.5 mm²** | Disj. 2A | 1 circuit dédié |
| Volets roulants | **1.5 mm²** | Disj. 16A | — |

### Mise en oeuvre
- Repérage de chaque circuit : **étiquetage aux deux extrémités** (tableau + appareil)
- Code couleur **obligatoire** :
  - Bleu : neutre
  - Vert/jaune : terre (PE)
  - Toute autre couleur sauf bleu et vert/jaune : phase
  - Conventionnellement : rouge, marron, ou noir pour les phases
- Serrage des connexions : au couple (tournevis dynamométrique pour les calibres > 32A)
- Test de continuité après tirage de chaque circuit

**Référence normative : NF C 15-100 §521 à §529, §771**

---

## Étape 4 : Appareillage et raccordements

**Durée estimée : 5-10 jours**

### Tableaux de distribution
- TGBT (Tableau Général Basse Tension) : en tête d'installation
- TD (Tableaux Divisionnaires) : par zone ou par étage
- Composants obligatoires :
  - Interrupteur général (coupure d'urgence accessible)
  - Dispositifs Différentiels Résiduels (DDR) :
    - **30mA** sur tous les circuits (obligatoire depuis NF C 15-100 §411)
    - Type **AC** : circuits courants
    - Type **A** obligatoire : lave-linge, plaques de cuisson, bornes de recharge VE
    - Type **F** ou **B** : onduleurs, bornes VE (si variateur de fréquence)
  - Disjoncteurs divisionnaires par circuit
  - Parafoudre **obligatoire** si : bâtiment avec paratonnerre, ou alimentation aérienne, ou zone AQ2 (foudroiement > 25 impacts/km²/an)
  - Réserve de **20%** minimum dans le tableau (extensions futures)

### Hauteurs d'installation
| Appareillage | Hauteur (axe) | Tolérance |
|-------------|---------------|-----------|
| Prises 16A | **5cm** du sol fini (mesure à l'axe) | ± 2cm |
| Prises 32A (cuisson) | **12cm** du sol fini | ± 2cm |
| Prises plan de travail cuisine | **110-120cm** | — |
| Interrupteurs | **90 à 130cm** | Hauteur constante dans un même local |
| Tableau de distribution | **1.00 à 1.80m** (manettes des disjoncteurs) | — |
| DCL (Dispositif de Connexion Luminaire) | Plafond ou selon projet | — |

### Volumes salle de bain (NF C 15-100 §701)
| Volume | Définition | Appareillage autorisé |
|--------|------------|----------------------|
| Volume 0 | Intérieur baignoire/douche | TBTS 12V uniquement (IPX7) |
| Volume 1 | Au-dessus baignoire/douche, h ≤ 2.25m | Chauffe-eau, luminaire IPX4, TBTS 12V |
| Volume 2 | 60cm autour du volume 1 | + prises rasoir, luminaire classe II IPX4 |
| Hors volumes | Au-delà du volume 2 | Tout appareillage avec DDR 30mA |

- **Liaison Équipotentielle Supplémentaire (LES)** obligatoire : relie toutes les masses métalliques (canalisations, huisseries, radiateurs, baignoire)

**Référence normative : NF C 15-100 §559, §701, §771**

---

## Étape 5 : Mise à la terre et liaisons équipotentielles

**Durée estimée : 1-3 jours**

### Prise de terre
- Types :
  - Boucle en fond de fouille : câble cuivre nu 25mm² posé en fond de fouille (le plus fiable)
  - Piquet vertical : cuivre ou acier cuivré, longueur 1.50 à 3m
  - Câblette enterrée : cuivre nu 25mm² en tranchée à 1m de profondeur
- Résistance de terre maximale :
  - ≤ **100 Ω** avec DDR 30mA (seuil de sécurité : 100Ω × 0.03A = 3V < 50V)
  - ≤ **50 Ω** si pas de DDR 30mA sur tous les circuits
  - ≤ **22 Ω** si DDR 300mA en tête uniquement
- Barrette de mesure accessible (coupure possible pour mesure)
- Conducteur principal de terre : cuivre **16mm²** minimum (25mm² si protégé mécaniquement)

### Liaisons équipotentielles
- **LEP** (Liaison Équipotentielle Principale) : relie à la terre toutes les canalisations métalliques entrantes (eau, gaz, chauffage)
  - Section : **6mm²** cuivre minimum
- **LES** (Liaison Équipotentielle Supplémentaire) : dans chaque salle de bain/douche
  - Section : **2.5mm²** cuivre sous conduit, **4mm²** sans conduit
  - Relie : canalisations eau, évacuation métal, corps de la baignoire/bac douche, huisseries métalliques, radiateur
- Conducteur de protection (PE) vert/jaune sur **chaque circuit** sans exception

**Référence normative : NF C 15-100 §542, §544**

---

## Étape 6 : Essais et mise en service

**Durée estimée : 2-5 jours (essais + correction des observations)**

### Essais obligatoires (NF C 15-100 partie 6)
| Essai | Méthode | Critère de conformité |
|-------|---------|----------------------|
| Continuité PE | Ohmmètre (DC) | Continuité vérifiée sur chaque circuit |
| Isolement | Mégohmmètre 500V DC | ≥ **0.5 MΩ** entre conducteurs actifs et terre |
| Résistance de terre | Telluromètre ou pince de terre | ≤ 100Ω (avec DDR 30mA) |
| DDR 30mA | Testeur différentiel | Déclenchement en < 300ms (I∆n), < 40ms (5×I∆n) |
| DDR — test bouton | Appui bouton test | Déclenchement instantané |
| Impédance de boucle | Mesureur de boucle | Zs × Ia ≤ Uo (vérification du déclenchement des protections) |
| Essais fonctionnels | Mise sous tension progressive | Chaque circuit fonctionne selon le plan |

### Vérification visuelle préalable
- Tous les circuits repérés et étiquetés
- Couvercles de boîtes de dérivation en place
- Appareillage complet (pas de fils en attente non protégés)
- Conformité des volumes salle de bain
- Présence du schéma unifilaire dans le tableau

### Obtention du CONSUEL
- Obligatoire pour :
  - Construction neuve
  - Rénovation lourde avec modification du branchement
  - Augmentation de puissance
- Remplir l'Attestation de Conformité (formulaire Cerfa)
- Visite du contrôleur CONSUEL (délai 2-4 semaines)
- Si observations : correction et contre-visite

**Référence normative : NF C 15-100 §6, Guide UTE C 15-600**

---

## Autocontrôles électricité

| Étape | Contrôle | Document |
|-------|----------|----------|
| Plans | Visa bureau de contrôle | PV de visa |
| Chemins de câbles | Section suffisante, fixation, séparation CF/Cf | Fiche autocontrôle |
| Câblage | Sections conformes, repérage, code couleur | Carnet de câbles |
| Tableau | Schéma unifilaire conforme, 20% réserve | Plan du tableau |
| Essais | 6 essais obligatoires | Rapport d'essais |
| Final | CONSUEL (si applicable) | Attestation de conformité |

---

## Erreurs fréquentes électricité

| Erreur | Conséquence | Gravité |
|--------|-------------|---------|
| Section de câble insuffisante | Échauffement → risque incendie | **Critique** |
| Pas de DDR 30mA sur tous circuits | Risque d'électrocution (non-conformité NF C 15-100) | **Critique** |
| Prises sans conducteur de terre | Non-conformité, danger en cas de défaut | **Critique** |
| Tableau sous-dimensionné (pas de réserve) | Impossible d'ajouter des circuits → reprise totale | Grave |
| CF et Cf dans le même conduit | Perturbations électromagnétiques (réseau, TV, audio) | Modéré |
| Pas de parafoudre en zone obligatoire | Dommage équipements lors d'un coup de foudre | Grave |
| DDR type AC au lieu de type A (lave-linge, plaque) | Non-déclenchement sur défaut à composante continue | Grave |
| Traverse coupe-feu non rebouchée | Propagation du feu entre locaux | **Critique** |
| Volumes SDB non respectés | Non-conformité, danger d'électrocution | **Critique** |
| Absence de LES en salle de bain | Risque d'électrocution par potentiel flottant | Grave |
