# PRD — SaaS de Réponse aux Appels d'Offres BTP

## Document de Référence Produit (Product Requirements Document)

**Version :** 1.0
**Date :** 14 mars 2026
**Auteur :** PRD co-construit avec le fondateur
**Statut :** MVP — Version initiale

---

## 1. VISION & CONTEXTE

### 1.1 Problème

Les entreprises du BTP (façade, carrelage, ITE, peinture, gros œuvre, etc.) répondent régulièrement aux appels d'offres publics et privés. Aujourd'hui, tout est fait **manuellement** :

- Lecture du Règlement de Consultation (RC) à la main
- Surlignage manuel des exigences dans le RC
- Recherche des documents administratifs dans des dossiers éparpillés
- Vérification manuelle de la validité des documents (URSSAF < 6 mois, KBIS < 3 mois…)
- Rédaction du mémoire technique (~20 pages) sur Word, souvent copié-collé d'un ancien mémoire puis adapté
- Remplissage de la DPGF sur Excel
- Risque constant d'oubli d'un document ou d'une exigence

**Source terrain :** Adil, responsable AO chez Car Iso Facade (8M€ CA, Reims) puis chez Sionneau (40M€ CA, Reims), confirme que tout est fait manuellement avec Word et Excel. Un AO prend en moyenne 2 à 3 jours de travail.

### 1.2 Solution

Un SaaS premium qui automatise la réponse aux appels d'offres BTP grâce à l'IA (Claude API) :

1. **Analyse automatique du DCE** — L'IA lit le RC, CCTP et identifie toutes les exigences
2. **Compliance Matrix** — Tableau interactif des exigences avec statut (couvert/non couvert/partiellement couvert) et lien vers la source dans le document
3. **Checklist intelligente** — Vérification automatique des documents de candidature avec alertes d'expiration
4. **Génération du mémoire technique** — Mémoire de ~20 pages généré par l'IA, adapté au projet, basé sur le profil de l'entreprise
5. **Export Word (.docx)** — Export professionnel avec mise en page soignée
6. **Base de connaissances entreprise** — Coffre-fort documentaire qui s'enrichit au fil du temps

### 1.3 Cible

- **Cœur de cible :** Entreprises BTP de 5 à 200 salariés (CA de 2M€ à 50M€+)
- **Utilisateurs principaux :** Responsables AO, conducteurs de travaux, dirigeants, assistantes administratives
- **Zone géographique :** France métropolitaine (marchés publics et privés)
- **Corps de métier initiaux :** Façade, ITE, carrelage, peinture, enduit, ravalement, bardage

### 1.4 Business Model

| Plan | Prix/mois | Utilisateurs | Cible |
|------|-----------|--------------|-------|
| **Pro** | 249€ HT | 1-2 utilisateurs | PME BTP (CA < 10M€) |
| **Business** | 399€ HT | 5+ utilisateurs | ETI BTP (CA > 10M€) |

**Coût API estimé par AO :** 2 à 5€
**Marge brute estimée :** 65-90%

*Note : Le pricing sera affiné après les premiers retours utilisateurs. Un système de parrainage sera ajouté post-lancement.*

---

## 2. ARCHITECTURE TECHNIQUE

### 2.1 Stack technique

```
FRONTEND          BACKEND             IA                  INFRA
─────────         ───────             ──                  ─────
React 18+         FastAPI (Python)    Claude API          Vercel (front)
TypeScript        SQLAlchemy          - Sonnet 4.6        Railway/Render (back)
Tailwind CSS      PostgreSQL            (tâches simples)  AWS S3 (fichiers)
shadcn/ui         Redis (cache)       - Opus 4.6          Stripe (paiement)
                  Celery (tâches)       (tâches complexes)
                  S3 (stockage docs)
```

### 2.2 Répartition des modèles IA

| Tâche | Modèle | Justification |
|-------|--------|---------------|
| Extraction texte / parsing DCE | Sonnet 4.6 | Tâche simple, rapide, moins coûteux |
| Checklist candidature | Sonnet 4.6 | Matching de documents, pas de rédaction |
| Compliance Matrix | Sonnet 4.6 | Extraction structurée d'exigences |
| Génération mémoire technique | Opus 4.6 | Rédaction longue et qualitative, ~20 pages |
| Suggestions d'amélioration | Opus 4.6 | Analyse fine et recommandations |
| Alertes d'expiration | Code Python | Pas besoin d'IA, simple calcul de dates |

### 2.3 Structure de la base de données (modèles principaux)

```
Organization (entreprise cliente)
├── id, name, siret, address, logo
├── presentation, historique, activites
├── organigramme, moyens_informatiques
├── vehicules, materiel
├── fournisseurs
├── created_at
│
├── Users (multi-utilisateurs)
│   ├── id, email, password_hash, role (admin/member)
│   └── name, phone
│
├── Documents (coffre-fort documentaire)
│   ├── id, type (urssaf/kbis/qualibat/decennale/etc.)
│   ├── file_url, file_name
│   ├── issued_date, expiry_date
│   ├── status (valid/expiring_soon/expired)
│   └── uploaded_at
│
├── TeamMembers (équipe de l'entreprise)
│   ├── id, name, role, specialite
│   ├── experience_years, certifications
│   └── cv_url
│
├── References (chantiers passés)
│   ├── id, intitule, adresse
│   ├── maitre_ouvrage, maitre_oeuvre
│   ├── lot, montant_ht
│   ├── annee, statut (gagné/perdu/en_cours)
│   └── is_reference (utilisable dans mémoires)
│
├── MemoireTemplates (templates de mémoires par métier)
│   ├── id, name, corps_metier
│   ├── content_json, is_default
│   └── created_from_project_id (si "Utiliser comme référence")
│
└── Projects (appels d'offres)
    ├── id, name, status (brouillon/en_cours/soumis/gagné/perdu)
    ├── deadline, maitre_ouvrage
    │
    ├── ProjectDocuments (fichiers du DCE uploadés)
    │   ├── id, type (rc/cctp/dpgf/acte_engagement/plan/autre)
    │   ├── file_url, file_name
    │   └── extracted_text, page_count
    │
    ├── ComplianceMatrix (exigences extraites)
    │   ├── id, exigence_text
    │   ├── source_document, source_page, source_excerpt
    │   ├── status (couvert/non_couvert/partiel)
    │   ├── category (candidature/offre/technique/planning)
    │   └── suggestion_ia (conseil pour couvrir l'exigence)
    │
    ├── CandidatureChecklist (documents administratifs requis)
    │   ├── id, document_type_required
    │   ├── linked_document_id (lien vers coffre-fort)
    │   ├── status (present/manquant/expiré)
    │   └── source_in_rc (page/paragraphe du RC)
    │
    └── MemoireTechnique (mémoire généré)
        ├── id, content_json (contenu structuré)
        ├── version, generated_at
        ├── variables (nb_ouvriers, délai, interlocuteur, etc.)
        ├── is_reference_template (bool)
        └── docx_export_url
```

### 2.4 Architecture des fichiers du projet

```
saas-ao/
├── README.md
├── PRD.md                          # Ce document
│
├── frontend/                       # Application React
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── Landing.tsx         # Page d'accueil publique
│       │   ├── Login.tsx           # Connexion
│       │   ├── Register.tsx        # Inscription
│       │   ├── Pricing.tsx         # Page tarifs
│       │   ├── Dashboard.tsx       # Tableau de bord
│       │   ├── NewProject.tsx      # Créer un nouvel AO
│       │   ├── Project.tsx         # Vue détaillée d'un AO
│       │   │   ├── StepUpload.tsx      # Étape 1: Upload DCE
│       │   │   ├── StepAnalysis.tsx    # Étape 2: Analyse IA + Compliance Matrix
│       │   │   ├── StepCandidat.tsx    # Étape 3: Checklist candidature
│       │   │   ├── StepMemoire.tsx     # Étape 4: Mémoire technique
│       │   │   └── StepExport.tsx      # Étape 5: Vérification & Export
│       │   ├── Vault.tsx           # Coffre-fort documentaire
│       │   ├── References.tsx      # Références chantiers
│       │   ├── Company.tsx         # Profil entreprise
│       │   ├── Team.tsx            # Gestion d'équipe
│       │   └── Settings.tsx        # Paramètres & facturation
│       ├── components/
│       │   ├── ui/                 # Composants shadcn/ui
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx     # Menu latéral
│       │   │   ├── Header.tsx      # Barre supérieure
│       │   │   └── Layout.tsx      # Layout principal
│       │   ├── dashboard/
│       │   │   ├── AOCard.tsx      # Carte d'un AO en cours
│       │   │   ├── AlertCard.tsx   # Carte d'alerte (doc expiré, deadline)
│       │   │   └── StatsBar.tsx    # Statistiques rapides
│       │   ├── project/
│       │   │   ├── FileUploader.tsx     # Upload de fichiers DCE
│       │   │   ├── ComplianceTable.tsx  # Tableau compliance matrix
│       │   │   ├── ChecklistView.tsx    # Checklist candidature
│       │   │   ├── MemoireEditor.tsx    # Éditeur de mémoire technique
│       │   │   ├── DocumentViewer.tsx   # Visionneuse PDF avec surlignage
│       │   │   └── StepProgress.tsx     # Barre de progression des étapes
│       │   └── common/
│       │       ├── FileCard.tsx
│       │       ├── StatusBadge.tsx
│       │       └── ExpiryAlert.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useProject.ts
│       │   └── useDocuments.ts
│       ├── services/
│       │   ├── api.ts              # Client API
│       │   ├── auth.ts
│       │   └── upload.ts
│       ├── stores/
│       │   └── authStore.ts        # État global (Zustand)
│       └── types/
│           └── index.ts            # Types TypeScript
│
├── backend/                        # API FastAPI
│   ├── requirements.txt
│   ├── main.py                     # Point d'entrée FastAPI
│   ├── config.py                   # Configuration (env vars)
│   ├── database.py                 # Connexion PostgreSQL
│   │
│   ├── models/                     # Modèles SQLAlchemy
│   │   ├── organization.py
│   │   ├── user.py
│   │   ├── document.py
│   │   ├── team_member.py
│   │   ├── reference.py
│   │   ├── project.py
│   │   ├── compliance_item.py
│   │   ├── checklist_item.py
│   │   ├── memoire.py
│   │   └── memoire_template.py
│   │
│   ├── routers/                    # Endpoints API
│   │   ├── auth.py                 # Inscription, connexion, JWT
│   │   ├── organizations.py        # Gestion entreprise
│   │   ├── users.py                # Gestion utilisateurs/équipe
│   │   ├── documents.py            # Coffre-fort documentaire
│   │   ├── references.py           # Références chantiers
│   │   ├── projects.py             # CRUD projets/AO
│   │   ├── analysis.py             # Analyse IA du DCE
│   │   ├── compliance.py           # Compliance matrix
│   │   ├── candidature.py          # Checklist candidature
│   │   ├── memoire.py              # Génération mémoire technique
│   │   └── export.py               # Export .docx
│   │
│   ├── services/                   # Logique métier
│   │   ├── ai/
│   │   │   ├── dce_analyzer.py     # Analyse du DCE (Sonnet)
│   │   │   ├── compliance_extractor.py  # Extraction compliance matrix (Sonnet)
│   │   │   ├── checklist_matcher.py     # Matching checklist (Sonnet)
│   │   │   ├── memoire_generator.py     # Génération mémoire (Opus)
│   │   │   └── prompts.py               # Tous les prompts système
│   │   ├── document_processor.py   # Extraction texte PDF/DOCX
│   │   ├── expiry_checker.py       # Vérification expiration documents
│   │   ├── docx_exporter.py        # Génération fichier .docx
│   │   └── file_storage.py         # Upload/download S3
│   │
│   ├── schemas/                    # Schémas Pydantic
│   │   ├── auth.py
│   │   ├── organization.py
│   │   ├── project.py
│   │   ├── document.py
│   │   ├── compliance.py
│   │   ├── memoire.py
│   │   └── export.py
│   │
│   └── tasks/                      # Tâches asynchrones (Celery)
│       ├── analyze_dce.py          # Analyse DCE en arrière-plan
│       ├── generate_memoire.py     # Génération mémoire en arrière-plan
│       ├── check_expiry.py         # Vérification quotidienne des expirations
│       └── export_docx.py          # Génération export en arrière-plan
│
└── docs/                           # Documentation
    ├── SETUP.md                    # Guide d'installation
    ├── API.md                      # Documentation API
    └── DEPLOYMENT.md               # Guide de déploiement
```

---

## 3. FONCTIONNALITÉS DÉTAILLÉES

### 3.1 Inscription & Onboarding Progressif

**Principe :** Ne jamais demander trop d'informations au début. L'utilisateur complète son profil au fur et à mesure qu'il utilise le SaaS.

**Étape 1 — Inscription (30 secondes) :**
- Email, mot de passe
- Nom de l'entreprise
- SIRET (auto-complétion des infos via API INSEE/Pappers)
- Choix du plan (Pro 249€ / Business 399€)
- Paiement Stripe

**Étape 2 — Premier AO (l'onboarding se fait en travaillant) :**
- L'utilisateur crée son premier projet et upload le DCE
- L'IA analyse et dit : "Pour cet AO, vous avez besoin de ces documents : URSSAF, KBIS, Qualibat..."
- L'utilisateur upload les documents demandés → ils sont stockés dans le coffre-fort automatiquement
- Pour le mémoire technique, l'IA pose les questions nécessaires sur l'entreprise (organigramme, moyens, etc.)
- Chaque réponse enrichit le profil entreprise pour les prochains AO

**Résultat :** Au bout de 2-3 AO, le profil est complet et les AO suivants sont beaucoup plus rapides.

### 3.2 Dashboard

**Contenu de la page principale :**

- **Section "AO en cours"** : Cards des projets actifs avec nom, deadline (avec compte à rebours), statut d'avancement (barre de progression 5 étapes), maître d'ouvrage
- **Section "Alertes"** : Documents qui expirent bientôt (orange = < 30 jours, rouge = expiré), deadlines AO proches (< 7 jours)
- **Bouton principal "Nouvel Appel d'Offres"** : Gros bouton visible, action primaire
- **Statistiques** : Nombre d'AO en cours, AO soumis ce mois, taux de succès (gagné/perdu)

### 3.3 Création d'un nouveau projet (AO)

**Informations minimales requises :**
- Nom du projet (ex: "Construction 42 logements - Charleville")
- Maître d'ouvrage (optionnel)
- Date limite de réponse

**Le projet est ensuite géré en 5 étapes guidées (tunnel) :**

---

### 3.4 ÉTAPE 1 — Upload du DCE

**Interface :**
- Zone de drag & drop pour uploader les fichiers du DCE
- Types acceptés : PDF, DOCX, XLSX
- L'utilisateur catégorise chaque fichier : RC, CCTP, DPGF, Acte d'engagement, Plans, Autre
- Si un seul fichier ZIP est uploadé, le SaaS le décompresse automatiquement

**Traitement backend :**
- Extraction du texte de chaque document (PyPDF2 / python-docx / openpyxl)
- Stockage du texte extrait en base + fichier original sur S3
- Comptage des pages pour référencement

**Bouton : "Analyser les documents" → déclenche l'Étape 2**

---

### 3.5 ÉTAPE 2 — Analyse IA & Compliance Matrix

C'est la **killer feature** du SaaS. Deux sous-fonctionnalités :

#### 3.5.1 Compliance Matrix

**Ce que l'IA fait (modèle : Sonnet 4.6) :**
1. Lit le RC et le CCTP intégralement
2. Extrait TOUTES les exigences (administratives, techniques, délais, critères de notation)
3. Pour chaque exigence, identifie :
   - Le texte de l'exigence
   - Le document source (RC page X, CCTP page Y)
   - L'extrait exact du document
   - La catégorie (candidature / offre / technique / planning / critères de notation)

**Interface — Tableau interactif :**

| # | Exigence | Source | Page | Catégorie | Statut | Action |
|---|----------|--------|------|-----------|--------|--------|
| 1 | Attestation URSSAF < 6 mois | RC | 3 | Candidature | ✅ Couvert | [Voir page] |
| 2 | Qualibat RGE valide | RC | 3 | Candidature | ❌ Manquant | [Voir page] |
| 3 | Conducteur ≥ 5 ans expérience | CCTP | 42 | Technique | ⚠️ Partiel | [Voir page] |
| 4 | Planning détaillé | RC | 15 | Offre | ❌ À produire | [Voir page] |
| 5 | Mémoire technique 20 pages max | RC | 8 | Offre | 🔄 À générer | [Voir page] |

**Statuts possibles :**
- ✅ **Couvert** : Le document existe dans le coffre-fort et est valide
- ⚠️ **Partiellement couvert** : Le document existe mais ne satisfait pas complètement l'exigence (+ suggestion IA)
- ❌ **Manquant** : Le document n'est pas dans le coffre-fort
- 🔄 **À générer** : Doit être produit (mémoire technique, planning...)
- ⏰ **Expiré** : Le document existe mais a dépassé sa date de validité

**Bouton "Voir page" :**
- Ouvre le document source (PDF/DOCX) dans une visionneuse intégrée
- Scroll automatiquement vers la page concernée
- Le passage exact est surligné en jaune
- C'est la fonctionnalité qui crée la **confiance** — l'utilisateur peut vérifier chaque exigence

**Suggestion IA (pour les exigences "Partiel" ou "Manquant") :**
- L'IA affiche un conseil : "Votre conducteur de travaux M. LOK a 3 ans d'expérience. L'exigence demande ≥ 5 ans. Suggestion : proposer M. TURCATO (Directeur des travaux, 15 ans d'expérience) comme interlocuteur principal."

#### 3.5.2 Critères de notation

L'IA extrait aussi les critères de notation du RC, par exemple :
- Prix : 40%
- Valeur technique (mémoire) : 50%
- Délai : 10%

Ces critères sont affichés en haut de la compliance matrix pour que l'utilisateur sache où concentrer ses efforts.

---

### 3.6 ÉTAPE 3 — Checklist Candidature

**Ce que l'IA fait :**
- À partir de la compliance matrix (catégorie "candidature"), génère une checklist
- Vérifie automatiquement le coffre-fort documentaire
- Match chaque exigence avec un document existant

**Interface — Checklist avec statuts :**

**CANDIDATURE :**
- ✅ Attestation URSSAF → valide jusqu'au 15/06/2026
- ✅ KBIS → valide jusqu'au 01/05/2026
- ⏰ Attestation décennale → **expire dans 12 jours** [Mettre à jour]
- ❌ Qualibat RGE → **manquant** [Uploader]
- ✅ DC1 → présent
- ✅ DC2 → présent
- ❌ Certificat CACES → **manquant** [Uploader]

**OFFRE :**
- 🔄 Mémoire technique → **à générer** [Aller à l'étape 4]
- ❌ Acte d'engagement → **manquant** [Uploader]
- ✅ DPGF → présent (uploadé dans le DCE)
- ✅ RIB → présent

**Actions :**
- Bouton [Uploader] pour chaque document manquant → le document va automatiquement dans le coffre-fort
- Bouton [Mettre à jour] pour les documents expirés
- Le document uploadé ici sera réutilisé pour tous les prochains AO

---

### 3.7 ÉTAPE 4 — Mémoire Technique

C'est la **deuxième plus grosse valeur** du SaaS.

#### 3.7.1 Flux de génération

**Première utilisation (profil entreprise incomplet) :**
L'IA détecte les informations manquantes et pose des questions ciblées :
- "Quelle est la date de création de votre entreprise ?"
- "Décrivez brièvement vos activités principales"
- "Listez vos véhicules et matériel"
- "Quels sont vos principaux fournisseurs ?"

Les réponses sont sauvegardées dans le profil entreprise (Organization) et réutilisées pour tous les futurs AO.

**Utilisations suivantes (profil complet) :**
L'IA pose uniquement les questions spécifiques au projet :
- "Combien d'ouvriers seront dédiés à ce chantier ?" (ex: 3)
- "Quel est le délai estimé ?" (ex: 3 mois)
- "Qui sera l'interlocuteur dédié sur ce chantier ?" (liste des team members)
- "Y a-t-il des particularités techniques à mentionner ?"

**Bouton "Générer le mémoire technique"** → Tâche asynchrone (Celery)

#### 3.7.2 Structure du mémoire généré

Le mémoire suit la structure validée par Adil (Car Iso Facade) :

**PARTIE A — PRÉSENTATION GÉNÉRALE** *(depuis le profil entreprise)*
1. Implantation géographique
2. Historique de l'entreprise
3. Engagement qualitatif (certifications Qualibat, démarche qualité)
4. Activités
5. Organigramme
6. Rôles et missions de l'équipe d'encadrement
7. Moyens informatiques
8. Véhicules
9. Matériel
10. Références (tableau des chantiers passés — filtré par pertinence avec l'AO)
11. Fournisseurs

**PARTIE B — PRESTATION MISE À DISPOSITION** *(adapté au projet)*
1. Démarrage (pièces administratives, études de préparation, conformité DCE)
2. Interlocuteur dédié (team member sélectionné)
3. Qualité des ouvrages (mode opératoire, autocontrôles)
4. Respect du planning (nombre d'ouvriers dédiés — variable)
5. Dispositions relatives à la sécurité (EPI, échafaudage, balisage)
6. Traitement des déchets
7. Environnement

**PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE** *(générée par l'IA selon le CCTP)*
1. Méthodologie détaillée (adaptée au type de travaux : façade, ITE, carrelage...)
2. Effectifs dédiés au chantier (variable)
3. Matériels dédiés au chantier (filtré depuis le profil)
4. Hygiène et sécurité
5. Mesures environnementales
6. GPA (Garantie de Parfait Achèvement)
7. Délai de travaux (variable)

#### 3.7.3 Éditeur de mémoire

**Interface :**
- Éditeur de texte riche (type Notion/Google Docs) intégré
- Le mémoire généré apparaît avec toutes les sections
- L'utilisateur peut modifier chaque section directement
- Les "variables" (nb ouvriers, délai, interlocuteur) sont mises en évidence (surlignées) pour modification facile
- Bouton "Régénérer cette section" pour redemander à l'IA de réécrire un passage

**Bouton "Utiliser comme référence" :**
- Sauvegarde le mémoire comme template de référence
- Associé à un corps de métier (façade, ITE, carrelage…)
- Les prochains AO du même type utiliseront ce template comme base
- L'IA s'améliore : elle part du template validé plutôt que de générer from scratch

---

### 3.8 ÉTAPE 5 — Vérification Finale & Export

**Récapitulatif avant soumission :**

L'interface affiche un résumé complet :
- ✅ / ❌ Compliance matrix : X/Y exigences couvertes
- ✅ / ❌ Documents candidature : X/Y documents présents et valides
- ✅ / ❌ Mémoire technique : généré et validé
- ✅ / ❌ DPGF : uploadée
- ⚠️ Alertes éventuelles

**Export :**
- Bouton **"Télécharger le mémoire technique (.docx)"**
  - Export Word professionnel avec :
    - Page de garde avec logo entreprise
    - Sommaire automatique
    - En-têtes et pieds de page
    - Mise en page soignée (A4, marges standard)
    - Tableaux de références formatés
    - Numérotation des pages
- Bouton **"Télécharger le dossier complet (.zip)"**
  - Tous les documents de candidature + mémoire technique dans un ZIP organisé

**Après soumission :**
- L'utilisateur change le statut du projet : "Soumis"
- Plus tard : "Gagné" ou "Perdu"
- Si "Gagné" → les références du chantier sont automatiquement ajoutées à la base de données

---

### 3.9 Coffre-fort Documentaire

**Page dédiée accessible depuis le menu latéral.**

**Contenu :**
Tous les documents administratifs de l'entreprise, organisés par catégorie :

- **Assurances** : Attestation décennale, Attestation RC civile
- **Social** : Attestation URSSAF, Attestation PRO BTP, Attestation CIBTP
- **Fiscal** : Attestation fiscale
- **Juridique** : KBIS, Déclaration sur l'honneur, Pouvoir habilitées
- **Qualifications** : Qualibat RGE, CACES, Amiante SS4
- **Formulaires** : DC1, DC2, RIB
- **Entreprise** : Organigramme, Chiffre d'affaires 3 ans, Effectifs

**Fonctionnalités :**
- Upload par drag & drop
- Détection automatique du type de document (IA)
- Affichage de la date d'expiration pour chaque document
- Système d'alertes :
  - 🟢 Valide
  - 🟠 Expire dans < 30 jours
  - 🔴 Expiré
- Notification par email quand un document expire bientôt
- Historique des versions (garder les anciennes versions)

**Règles d'expiration :**

| Document | Durée de validité |
|----------|-------------------|
| Attestation URSSAF | 6 mois |
| Attestation fiscale | 6 mois |
| Attestation PRO BTP | 6 mois |
| Attestation CIBTP | 6 mois |
| KBIS | 3 mois |
| Qualibat RGE | Jusqu'à date de fin |
| Décennale / RC | Jusqu'à date de fin (annuel) |

---

### 3.10 Références Chantiers

**Page dédiée pour gérer l'historique des chantiers.**

**Tableau avec colonnes :**
- Année
- Intitulé du marché
- Adresse
- Maître d'ouvrage
- Maître d'œuvre
- Lot
- Montant HT
- Statut (gagné/perdu/en cours)

**Fonctionnalités :**
- Ajout manuel de références
- Import depuis un fichier Excel
- Ajout automatique quand un AO passe en statut "Gagné"
- Filtre par corps de métier, année, montant
- Sélection des références pertinentes pour chaque AO (l'IA pré-sélectionne les plus pertinentes)

---

### 3.11 Profil Entreprise

**Page pour renseigner les informations fixes de l'entreprise.**

**Sections :**
- Informations générales (nom, SIRET, adresse, logo, date de création)
- Présentation / Historique
- Activités
- Organigramme
- Équipe d'encadrement (avec rôles et missions)
- Moyens informatiques
- Véhicules
- Matériel
- Fournisseurs (avec logos)

**Barre de progression :** "Votre profil est complété à 65%" — incite à compléter

---

### 3.12 Gestion d'Équipe

**Accessible selon le plan :**
- Plan Pro (249€) : 1-2 utilisateurs
- Plan Business (399€) : 5+ utilisateurs

**Fonctionnalités :**
- Inviter un utilisateur par email
- Rôles : Admin (tout accès) / Membre (accès projets, pas de facturation)
- Voir qui travaille sur quel AO

---

## 4. PROMPTS SYSTÈME IA

### 4.1 Prompt — Analyse du DCE et extraction des exigences

```
MODÈLE : claude-sonnet-4-6

SYSTEM PROMPT :

Tu es un expert en marchés publics et privés du BTP en France. Tu analyses les documents d'un Dossier de Consultation des Entreprises (DCE).

Ton rôle est d'extraire TOUTES les exigences du Règlement de Consultation (RC) et du CCTP.

Pour chaque exigence, retourne un objet JSON avec :
- "exigence": le texte de l'exigence (reformulé clairement)
- "source_document": "RC" ou "CCTP" ou autre
- "source_page": numéro de page
- "source_excerpt": l'extrait exact du document (max 200 caractères)
- "category": une parmi ["candidature", "offre", "technique", "planning", "criteres_notation"]
- "priority": "obligatoire" ou "souhaitée"

Catégories :
- "candidature" : documents administratifs (URSSAF, KBIS, DC1, DC2, assurances, qualifications, etc.)
- "offre" : documents à produire pour l'offre (mémoire technique, DPGF, acte d'engagement, etc.)
- "technique" : exigences techniques sur l'exécution des travaux
- "planning" : délais, phasage, planning
- "criteres_notation" : critères et pondération pour l'évaluation de l'offre

Sois EXHAUSTIF. Ne manque aucune exigence. Chaque document demandé, chaque critère, chaque condition doit être listé.

Retourne un JSON array uniquement, sans texte autour :
[
  { "exigence": "...", "source_document": "...", "source_page": 3, "source_excerpt": "...", "category": "...", "priority": "..." },
  ...
]
```

### 4.2 Prompt — Matching checklist candidature

```
MODÈLE : claude-sonnet-4-6

SYSTEM PROMPT :

Tu es un assistant spécialisé dans les appels d'offres BTP en France.

On te fournit :
1. La liste des exigences de candidature extraites du RC
2. La liste des documents disponibles dans le coffre-fort de l'entreprise (avec type, date d'émission, date d'expiration)

Pour chaque exigence de candidature, détermine :
- "exigence": le texte de l'exigence
- "document_type_required": le type de document attendu
- "matched_document_id": l'ID du document trouvé dans le coffre-fort (null si aucun)
- "status": "present" | "manquant" | "expire" | "expiration_proche"
- "details": explication courte (ex: "Valide jusqu'au 15/06/2026", "Aucun document Qualibat trouvé")
- "source_in_rc": référence dans le RC

Retourne un JSON array.
```

### 4.3 Prompt — Génération du mémoire technique

```
MODÈLE : claude-opus-4-6

SYSTEM PROMPT :

Tu es un rédacteur expert en mémoires techniques pour les marchés publics et privés du BTP en France. Tu rédiges des mémoires techniques professionnels, précis et convaincants.

CONTEXTE :
Tu reçois :
1. Les informations de l'entreprise (profil complet : présentation, historique, moyens, équipe, références, etc.)
2. Le CCTP (Cahier des Clauses Techniques Particulières) du projet
3. Le RC (Règlement de Consultation) avec les critères de notation
4. Les variables spécifiques au projet (nombre d'ouvriers, délai, interlocuteur dédié)
5. Optionnel : un template de référence validé par l'entreprise pour ce type de travaux

STRUCTURE DU MÉMOIRE À GÉNÉRER :

PRÉAMBULE
- Engagement de l'entreprise à réaliser l'opération dans les meilleures conditions
- Respect du projet architectural et technique
- Réalisation conforme aux règles de l'art

PARTIE A — PRÉSENTATION GÉNÉRALE
1. Implantation géographique
2. Historique
3. Engagement qualitatif
4. Activités
5. Organigramme
6. Rôles et missions de l'équipe d'encadrement
7. Moyens informatiques
8. Véhicules
9. Matériel
10. Références (sélectionner les 10-15 plus pertinentes par rapport au lot)
11. Fournisseurs

PARTIE B — PRESTATION MISE À DISPOSITION
1. Démarrage (notification, études, préparation, conformité DCE, VIC, PPSPS)
2. Interlocuteur dédié (utiliser le team member désigné)
3. Qualité des ouvrages (dossier d'exécution, autocontrôles, prise en compte des avis MOA/MOE)
4. Respect du planning (nombre d'ouvriers = variable, moyens techniques, pas de location)
5. Dispositions relatives à la sécurité (EPI, échafaudage, balisage, normes)
6. Traitement des déchets (collecte, évacuation, bennes)
7. Environnement (label chantier propre, développement durable)

PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE
1. Méthodologie détaillée — ADAPTER au type de travaux décrit dans le CCTP :
   - Pour FAÇADE/ENDUIT : protection, réception support, montage échafaudage, préparation support, lavage, traitement épaufrures, application, finitions, repli
   - Pour ITE : fixation isolant, chevillage, sous-enduit armé, finition, points singuliers
   - Pour CARRELAGE : réception support, implantation, pose, joints, nettoyage
   - Pour PEINTURE : protection, préparation surfaces, impression, couches de finition
   - Pour RAVALEMENT : diagnostic, nettoyage, réparations, traitement, finition
   - Etc.
2. Effectifs dédiés au chantier (utiliser la variable nb_ouvriers)
3. Matériels dédiés au chantier (filtrer depuis le profil selon le type de travaux)
4. Hygiène et sécurité
5. Mesures environnementales (tri des déchets par type)
6. GPA (délai 10 jours pour désordres mineurs, 24/48h pour urgences, intervention lundi-samedi 7h30-17h30)
7. Délai de travaux (utiliser la variable delai)

INSTRUCTIONS DE RÉDACTION :
- Ton professionnel mais accessible
- Phrases courtes et percutantes
- Mettre en gras les mots-clés importants (comme dans le mémoire de référence)
- Utiliser des listes à puces pour la clarté
- Environ 20 pages au total
- Adapter la méthodologie SPÉCIFIQUEMENT aux travaux décrits dans le CCTP — ne PAS faire de méthodologie générique
- Si un template de référence est fourni, s'en inspirer fortement pour le style et la structure tout en adaptant le contenu au nouveau projet

SORTIE :
Retourne le contenu en JSON structuré :
{
  "preambule": "...",
  "partie_a": {
    "implantation": "...",
    "historique": "...",
    ...
  },
  "partie_b": {
    "demarrage": "...",
    ...
  },
  "partie_c": {
    "methodologie": "...",
    ...
  }
}
```

### 4.4 Prompt — Sélection des références pertinentes

```
MODÈLE : claude-sonnet-4-6

SYSTEM PROMPT :

Tu reçois :
1. La liste complète des références chantiers d'une entreprise BTP
2. Les informations sur l'AO en cours (type de travaux, lot, maître d'ouvrage, localisation)

Sélectionne les 10 à 15 références les PLUS pertinentes pour cet AO, en priorisant :
- Même type de travaux / lot (le plus important)
- Montants similaires ou supérieurs
- Projets récents (dernières 3 années)
- Même type de maître d'ouvrage (public/privé)
- Proximité géographique

Retourne les IDs des références sélectionnées en JSON :
{ "selected_reference_ids": ["id1", "id2", ...], "justification": "..." }
```

---

## 5. INTERFACES — WIREFRAMES TEXTUELS

### 5.1 Menu latéral (Sidebar)

```
┌──────────────────────┐
│  [LOGO SAAS]         │
│                      │
│  📊 Dashboard        │
│  📁 Mes AO           │
│  🗄️ Coffre-fort      │
│  🏗️ Références       │
│  🏢 Mon Entreprise   │
│  👥 Équipe           │
│  ⚙️ Paramètres       │
│                      │
│  ──────────────────  │
│  [+ Nouvel AO]       │
│                      │
│  Plan: Pro           │
│  AO ce mois: 3/∞     │
└──────────────────────┘
```

### 5.2 Dashboard

```
┌─────────────────────────────────────────────────┐
│  Bonjour, Mohamed 👋            [+ Nouvel AO]   │
├─────────────────────────────────────────────────┤
│                                                  │
│  📊 Ce mois : 3 AO en cours | 2 soumis | 1 gagné│
│                                                  │
│  ⚠️ ALERTES                                      │
│  ┌──────────────────────────────────────────┐    │
│  │ 🔴 Attestation URSSAF expire dans 5 jours│    │
│  │ 🟠 KBIS expire dans 22 jours            │    │
│  │ 🔴 AO "Gymnase Muizon" : deadline demain │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  📁 AO EN COURS                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │Construction  │ │Rénovation   │ │Gymnase     │ │
│  │42 logements  │ │106 logts    │ │Muizon      │ │
│  │Charleville   │ │Reims        │ │            │ │
│  │              │ │             │ │            │ │
│  │▓▓▓▓░░ 60%   │ │▓▓▓░░░ 40%  │ │▓▓▓▓▓░ 80% │ │
│  │⏰ J-12       │ │⏰ J-25      │ │⏰ J-1  ⚠️  │ │
│  │[Continuer]  │ │[Continuer]  │ │[Continuer] │ │
│  └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────────────────────────────┘
```

### 5.3 Vue Projet — Barre d'étapes

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ① Upload DCE  →  ② Analyse IA  →  ③ Candidature   │
│      ✅              🔄 En cours       ⬜            │
│                                                      │
│  →  ④ Mémoire technique  →  ⑤ Export                │
│        ⬜                      ⬜                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 6. GUIDE DE CONFIGURATION — OPENCLAW + TELEGRAM

### 6.1 Prérequis

- OpenClaw installé sur WSL (Ubuntu) — déjà fait ✅
- Clé API Anthropic valide (RÉGÉNÉRER l'ancienne, elle a été exposée)
- Bot Telegram "OpenMaga_bot" créé via BotFather — déjà fait ✅
- Token HTTP API Telegram (flouté sur les screenshots)

### 6.2 Configuration OpenClaw

```bash
# 1. Reconfigurer avec la nouvelle clé API
openclaw configure

# Sélectionner :
# - Gateway: Local (this machine)
# - Model/auth provider: Anthropic
# - Auth method: Anthropic API key
# - Coller la NOUVELLE clé API
# - Model: anthropic/claude-sonnet-4-6 (pour le dev quotidien, moins cher)
```

### 6.3 Pairing Telegram

```bash
# 2. Approuver le pairing Telegram
# Utiliser le pairing code affiché dans le bot Telegram
openclaw pairing approve telegram <PAIRING_CODE>

# 3. Vérifier que ça fonctionne
openclaw tui
# Taper "hello" — devrait répondre sans erreur 401
```

### 6.4 Configuration du workspace pour le SaaS

```bash
# 4. Créer le workspace du projet
mkdir -p ~/saas-ao
cd ~/saas-ao

# 5. Copier le PRD dans le workspace
cp PRD.md ~/saas-ao/

# 6. Configurer les fichiers OpenClaw du workspace
cd ~/.openclaw/workspace
```

**Fichier CLAUDE.md (instructions pour l'agent) :**
```markdown
# Agent SaaS AO BTP

Tu es un développeur full-stack senior qui construit un SaaS de réponse aux appels d'offres BTP.

## Contexte
- Lis le fichier PRD.md pour comprendre le projet complet
- Stack : React + TypeScript + Tailwind (frontend), FastAPI + PostgreSQL (backend)
- IA : Claude API (Sonnet pour tâches simples, Opus pour mémoire technique)

## Règles
- Toujours écrire du code propre, typé, commenté
- Suivre l'architecture de fichiers définie dans le PRD
- Ne jamais hardcoder de clés API
- Utiliser les variables d'environnement pour la config
- Écrire des tests pour les fonctions critiques
```

### 6.5 Utilisation avec Telegram

Une fois le pairing fait, tu pourras envoyer des messages à ton bot Telegram pour :
- Demander à OpenClaw de coder des fonctionnalités
- Vérifier l'état du développement
- Lancer des tests
- Tout ça depuis ton téléphone, même quand tu n'es pas devant ton PC

---

## 7. PLAN DE DÉVELOPPEMENT — PHASES

### Phase 1 — Fondations (Semaine 1-2)
- [ ] Setup projet (React + FastAPI + PostgreSQL)
- [ ] Système d'authentification (inscription, connexion, JWT)
- [ ] Modèles de base de données
- [ ] Layout principal (sidebar, header, routing)
- [ ] Page Dashboard (statique)

### Phase 2 — Coffre-fort & Profil (Semaine 2-3)
- [ ] Upload et stockage de fichiers (S3)
- [ ] Coffre-fort documentaire (CRUD)
- [ ] Système d'alertes d'expiration
- [ ] Profil entreprise (formulaire)
- [ ] Gestion des références chantiers

### Phase 3 — Cœur du produit (Semaine 3-5)
- [ ] Création de projet / AO
- [ ] Upload du DCE
- [ ] Extraction de texte (PDF/DOCX)
- [ ] Intégration Claude API — Analyse du DCE
- [ ] Compliance Matrix (extraction + affichage)
- [ ] Visionneuse de documents avec surlignage
- [ ] Checklist candidature (matching automatique)

### Phase 4 — Mémoire technique (Semaine 5-7)
- [ ] Formulaire de questions pré-génération
- [ ] Intégration Claude API — Génération mémoire (Opus)
- [ ] Éditeur de mémoire intégré
- [ ] Système de templates de référence
- [ ] Export Word (.docx) professionnel

### Phase 5 — Finitions & Lancement (Semaine 7-8)
- [ ] Page de vérification finale
- [ ] Export ZIP du dossier complet
- [ ] Suivi des statuts (soumis/gagné/perdu)
- [ ] Page pricing + intégration Stripe
- [ ] Landing page
- [ ] Tests utilisateurs avec Adil
- [ ] Déploiement production

### Post-lancement (V2)
- [ ] Système de parrainage
- [ ] Assistant de chiffrage
- [ ] Import automatique depuis plateformes de marchés publics
- [ ] Application mobile
- [ ] Multi-langue

---

## 8. MÉTRIQUES DE SUCCÈS

| Métrique | Objectif Mois 1 | Objectif Mois 6 |
|----------|-----------------|-----------------|
| Utilisateurs inscrits | 5-10 (beta) | 50+ |
| MRR (revenu mensuel récurrent) | 1 250€ | 12 500€+ |
| AO traités par mois | 20 | 200+ |
| Taux de rétention | 80%+ | 85%+ |
| Temps moyen par AO (avant) | 2-3 jours | — |
| Temps moyen par AO (avec SaaS) | 2-4 heures | — |

---

*Ce PRD est un document vivant. Il sera mis à jour au fur et à mesure du développement et des retours utilisateurs.*
