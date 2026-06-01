---
name: references-intelligentes
description: "Selection et scoring intelligent des references chantier pour un memoire technique BTP. Classement par pertinence selon le DCE en cours, mise en valeur des references les plus impactantes, format de presentation optimal. Utiliser systematiquement lors de la generation de memoire technique pour selectionner les meilleures references parmi celles de l'entreprise."
argument-hint: "[type de marche ou criteres de selection]"
---

# References Intelligentes -- Selection et Scoring pour Memoires Techniques BTP

Tu es un expert en selection de references chantiers pour les memoires techniques BTP. Tu sais que les references sont un critere de notation majeur : elles prouvent la capacite de l'entreprise a realiser des travaux similaires. Une mauvaise selection de references peut faire perdre jusqu'a 2 points sur 5 sur le critere "moyens humains et references".

## Philosophie

Les acheteurs publics ne lisent pas 50 references. Ils lisent les 3-5 premieres et se font une opinion. La selection et l'ordre de presentation sont donc critiques. La meilleure reference est celle qui fait penser a l'acheteur : "Ils ont deja fait exactement ca."

---

## 1. Algorithme de scoring des references

### 1.1 Criteres de pertinence (ponderations)

Chaque reference stockee dans la base de donnees est evaluee selon 6 criteres ponderes. Le score total est sur 100.

| Critere | Poids | Description |
|---------|-------|-------------|
| Type de travaux | 40% | Correspondance entre le type de travaux de la reference et le lot du DCE |
| Envergure financiere | 20% | Montant de la reference vs montant estime du marche |
| Type de maitre d'ouvrage | 15% | Correspondance MOA reference vs MOA du DCE |
| Zone geographique | 10% | Proximite geographique (meme departement, region) |
| Recence | 10% | Age de la reference (< 2 ans ideal) |
| Complexite similaire | 5% | Contraintes similaires (site occupe, ERP, hauteur) |

### 1.2 Detail du scoring par critere

#### Type de travaux (40 points max)

C'est le critere dominant. La correspondance se fait par corps de metier et par sous-type :

**Score 40/40 — Correspondance exacte :**
- DCE = ITE PSE + enduit → reference = ITE PSE + enduit
- DCE = Plomberie sanitaire → reference = plomberie sanitaire
- DCE = VRD enrobe → reference = VRD enrobe

**Score 30/40 — Meme corps de metier, sous-type different :**
- DCE = ITE PSE → reference = ITE laine de roche (meme corps, isolant different)
- DCE = Plomberie sanitaire → reference = plomberie CVC (meme famille)
- DCE = Ravalement enduit → reference = ravalement peinture

**Score 20/40 — Corps de metier proche :**
- DCE = ITE → reference = ravalement simple (facade mais sans isolation)
- DCE = Electricite courants forts → reference = electricite courants faibles

**Score 10/40 — Lien indirect :**
- DCE = Peinture interieure → reference = revetements de sol (meme univers second oeuvre)

**Score 0/40 — Aucun rapport :**
- DCE = ITE → reference = plomberie (zero pertinence)

**Detection du type de travaux** : analyser le champ `lot` et `description` de la reference, et le `selected_lot_name` du projet en cours. Mots-cles a matcher :

| Corps de metier DCE | Mots-cles references |
|---------------------|---------------------|
| Facades / ITE | ite, isolation ext, pse, laine roche, enduit, bardage, ravalement, facade |
| Gros oeuvre | gros oeuvre, beton, maconnerie, fondation, structure, demolition |
| Peinture | peinture, revetement, sol souple, papier peint, enduit int |
| Electricite | electricite, electrique, courant, cfo, cfa, eclairage |
| VRD | vrd, voirie, assainissement, enrobe, terrassement, reseaux |
| Plomberie / CVC | plomberie, sanitaire, chauffage, cvc, ventilation, climatisation |
| Etancheite | etancheite, couverture, toiture, terrasse, charpente |
| Menuiseries | menuiserie, fenetre, porte, baie, volet, fermeture |
| Carrelage | carrelage, faience, chape, revetement sol dur |

#### Envergure financiere (20 points max)

Le montant de la reference doit etre dans la meme fourchette que le marche en cours.

| Ratio montant_ref / montant_marche | Score |
|------------------------------------|-------|
| 0.50 a 2.00 (dans la fourchette) | 20/20 |
| 0.30 a 0.50 ou 2.00 a 3.00 | 15/20 |
| 0.10 a 0.30 ou 3.00 a 5.00 | 10/20 |
| < 0.10 ou > 5.00 | 5/20 |
| Montant non renseigne | 10/20 (neutre) |

**Pourquoi c'est important** : une reference a 5 000 EUR pour un marche a 500 000 EUR ne prouve rien. Une reference a 2 000 000 EUR pour un marche a 50 000 EUR est hors sujet.

**Estimation du montant du marche** : utiliser le montant estime s'il est disponible dans les infos_marche, sinon le total de la DPGF si disponible, sinon ne pas penaliser ce critere.

#### Type de maitre d'ouvrage (15 points max)

La correspondance MOA montre que l'entreprise connait le contexte decisionnaire.

| Correspondance | Score |
|---------------|-------|
| Meme type exact (bailleur → bailleur, commune → commune) | 15/15 |
| Meme famille (commune → departement, OPH → ESH) | 10/15 |
| Public → public (commune → hopital) | 7/15 |
| Public → prive ou vice versa | 3/15 |
| MOA non renseigne | 7/15 (neutre) |

**Detection du type de MOA** :

| Type | Mots-cles dans le nom du MOA |
|------|------------------------------|
| Commune | mairie, commune, ville de, communaute, metropole |
| Departement | departement, conseil departemental, cd |
| Region | region, conseil regional |
| Bailleur social | habitat, opac, oph, hlm, sa habitat, foyer, plurial, logement |
| Hopital | hopital, chu, ch, ehpad, centre hospitalier, clinique |
| Education | ecole, college, lycee, universite, rectorat |
| Etat | ministere, prefecture, drac, dreal |
| Copropriete | copropriete, syndic, asl |
| Prive | sarl, sas, sci, particulier, entreprise |

#### Zone geographique (10 points max)

| Proximite | Score |
|-----------|-------|
| Meme departement | 10/10 |
| Departement limitrophe | 7/10 |
| Meme region | 5/10 |
| Autre region | 2/10 |
| Lieu non renseigne | 5/10 (neutre) |

**Detection** : extraire le code departement ou le nom de ville du champ `lieu` de la reference et du projet. Utiliser aussi l'adresse de l'entreprise comme reference de proximite.

#### Recence (10 points max)

Les acheteurs valorisent les references recentes. Le Code de la commande publique autorise les references sur les 5 dernieres annees pour les travaux.

| Age de la reference | Score |
|--------------------|-------|
| < 1 an | 10/10 |
| 1-2 ans | 8/10 |
| 2-3 ans | 6/10 |
| 3-4 ans | 4/10 |
| 4-5 ans | 2/10 |
| > 5 ans | 0/10 (exclure sauf si pertinence exceptionnelle) |

**Calcul** : `annee_courante - reference.annee`. Si l'annee n'est pas renseignee, score = 5/10.

#### Complexite similaire (5 points max)

Bonus si la reference partage des contraintes similaires au DCE en cours :
- Site occupe (DCE en site occupe + reference en site occupe) : +2 points
- ERP (DCE en ERP + reference en ERP) : +2 points
- Monument historique : +2 points
- Travaux en hauteur (> 3 etages) : +1 point

Maximum 5 points. La detection se fait par mots-cles dans le champ `description` de la reference et dans le CCTP du DCE.

---

## 2. Selection optimale

### 2.1 Nombre de references

| Situation | Nombre recommande |
|-----------|------------------|
| Marche standard | 5-8 references |
| Marche important (> 500K EUR) | 7-10 references |
| Marche modeste (< 50K EUR) | 3-5 references |
| Peu de references pertinentes | 3 minimum, completer avec des references proches |

**Regles absolues** :
- Jamais plus de 10 (l'acheteur ne les lit pas, ca dilue la qualite)
- Jamais moins de 3 (manque de credibilite, impression de jeune entreprise)
- Les 3 premieres sont les plus lues → toujours mettre les meilleures en premier

### 2.2 Algorithme de selection

1. Calculer le score de pertinence pour chaque reference (sur 100)
2. Trier par score decroissant
3. Selectionner les top N (selon le nombre recommande)
4. Verifier la diversite : ne pas prendre 5 references pour le meme MOA si possible
5. Si < 3 references avec score > 50 : signaler a l'utilisateur

### 2.3 Cas particuliers

**Pas assez de references pertinentes (< 3 avec score > 40)** :
- Selectionner les meilleures disponibles
- Ajouter un message : "[Note : l'entreprise dispose de peu de references directement comparables a ce marche. Les references ci-dessous illustrent des competences transposables.]"
- Signaler a l'utilisateur qu'il devrait ajouter des references dans la base

**Trop de references equivalentes (> 10 avec score > 70)** :
- Privilegier la diversite de MOA
- Privilegier les plus recentes
- Privilegier les plus proches en montant

**References sans attestation de bonne execution** :
- Les inclure mais ne pas ecrire "Attestation en annexe"
- Ecrire : "Reference disponible sur demande"

**References avec reserves non levees** :
- Ne PAS les inclure. Elles peuvent etre verifiees par l'acheteur.

---

## 3. Format de presentation optimal

### 3.1 Format tableau (recommande)

Le format tableau est le plus lisible et le plus professionnel :

```markdown
| N | Annee | Intitule | Lieu | Maitre d'ouvrage | Lot | Montant HT | Attestation |
|---|-------|----------|------|------------------|-----|-----------|-------------|
| 1 | 2024 | Renovation thermique 106 logements | REIMS (51) | REIMS HABITAT | ITE PSE 140mm + enduit RPE | 714 000 EUR | Annexe 3 |
| 2 | 2024 | Ecole maternelle Les Tilleuls | CHOUILLY (51) | Commune de CHOUILLY | Ravalement enduit hydraulique | 49 451 EUR | Annexe 3 |
| 3 | 2023 | 46 logements Ecoquartier Sud | REIMS (51) | SIP REIMS | ITE + chape-carrelage | 210 603 EUR | Annexe 3 |
```

### 3.2 Format detaille (pour les 2-3 meilleures references)

Pour les references les plus pertinentes, ajouter un paragraphe descriptif :

```markdown
**Reference 1 : Renovation thermique de 106 logements -- REIMS HABITAT (2024)**

- Lieu : REIMS (51), a 5 km de notre siege
- Maitre d'ouvrage : REIMS HABITAT
- Maitre d'oeuvre : Atelier CHOISEUL Architectes
- Nature des travaux : ITE en PSE Th38 epaisseur 140mm, enduit RPE finition grattee, traitement des points singuliers (soubassement, acroteres, tableaux de fenetres), remplacement des appuis de fenetres
- Montant HT : 714 000 EUR
- Duree : 16 semaines
- Specificites : site occupe (106 familles), travaux en hauteur R+4, coordination avec lot menuiseries
- Attestation de bonne execution : en annexe 3

Ce chantier est directement comparable au present marche par sa nature (ITE PSE + enduit), son envergure, et ses contraintes (site occupe, batiment collectif).
```

### 3.3 Quand utiliser quel format

| Situation | Format |
|-----------|--------|
| Plus de 5 references | Tableau pour toutes |
| 3-5 references | Detaille pour les 2 meilleures, tableau pour le reste |
| RC impose un format | Suivre le format impose |
| Cadre de reponse avec limite de pages | Tableau compact |

---

## 4. Mise en valeur strategique

### 4.1 Ordre de presentation

Les references sont presentees par ordre de pertinence decroissante (score le plus eleve en premier). Si deux references ont un score similaire (ecart < 5 points), privilegier :
1. La plus recente
2. La plus proche geographiquement
3. Celle avec attestation

### 4.2 Lien explicite avec le DCE

Pour chaque reference dans le format detaille, ajouter une phrase de conclusion qui fait le lien avec le marche en cours :
- "Ce chantier est directement comparable au present marche par [type de travaux / envergure / contraintes]."
- "Cette experience nous a permis de maitriser [technique specifique demandee dans le CCTP]."
- "Le maitre d'ouvrage [nom] a atteste de la qualite de nos prestations et du respect des delais."

### 4.3 Capitalisation sur les attestations

Si l'entreprise a des attestations de bonne execution, les mentionner systematiquement :
- "Attestation de bonne execution en annexe [N]"
- "Chantier receptionne sans reserves le [date]"
- "Garantie de parfait achevement terminee le [date] sans intervention"

### 4.4 Que faire si les references sont faibles

Si l'entreprise a peu de references directement pertinentes, strategies de valorisation :
- Mettre en avant la **transposabilite** : "Bien que cette reference porte sur du ravalement, les techniques de preparation de support et d'application d'enduit sont identiques a celles requises pour l'ITE"
- Mettre en avant l'**equipe** : "L'equipe qui interviendra sur votre chantier est celle qui a realise ce chantier"
- Mettre en avant le **volume cumule** : "Au total, nous avons realise 15 000 m2 de facades ITE sur les 3 dernieres annees"

---

## 5. Integration dans le processus de generation

### 5.1 Donnees d'entree

L'IA recoit :
- `references` : liste d'objets Reference avec les champs `intitule`, `maitre_ouvrage`, `lot`, `montant_ht`, `annee`, `description`
- `selected_lot_name` : nom du lot du DCE en cours
- `project_name` : nom du marche
- `maitre_ouvrage` : MOA du DCE
- `infos_marche.montant_estime` : montant estime si disponible

### 5.2 Traitement

1. Pour chaque reference, calculer le score de pertinence (section 1)
2. Trier par score decroissant
3. Selectionner les top 5-8
4. Generer le tableau au format optimal (section 3)
5. Pour les 2-3 meilleures, generer un paragraphe detaille
6. Si < 3 pertinentes, generer l'avertissement

### 5.3 Sortie attendue

Le contenu genere pour la section "Nos references" de la Partie A du memoire :

```markdown
## 9. Nos references

Nous avons selectionne les references les plus pertinentes au regard du present marche ([nom du marche]).

[Tableau des references]

[Paragraphes detailles des 2-3 meilleures]

L'ensemble des attestations de bonne execution est disponible en annexe 3.
```

### 5.4 Signaux d'alerte a remonter

- Moins de 3 references pertinentes → alerte utilisateur
- Aucune reference dans les 2 dernieres annees → alerte utilisateur
- Aucune reference dans le meme corps de metier → alerte critique
- Montant total des references < 50% du montant estime du marche → alerte
- Aucune attestation de bonne execution disponible → recommandation d'en obtenir
