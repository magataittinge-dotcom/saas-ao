# Audit Complet — SaaS AO BTP (Synorix)

> **Date :** 30 mars 2026
> **Objectif :** Transmettre au designer une vue exhaustive du projet

---

## 1. Structure des fichiers frontend

### Arborescence `src/`

```
src/
├── App.tsx                          # Router principal (React Router v6 BrowserRouter)
├── main.tsx                         # Entry point (React 18, QueryClientProvider, StrictMode)
├── index.css                        # Styles globaux, @font-face, classes utilitaires
├── styles/
│   └── tokens.css                   # Design tokens CSS variables (Synorix glass system)
├── lib/
│   └── utils.ts                     # cn(), formatDate(), formatRelative(), daysUntil(), formatMontant()
├── types/
│   └── index.ts                     # Toutes les interfaces TypeScript (365 lignes)
├── stores/
│   ├── authStore.ts                 # Zustand : user, organization, accessToken, isAuthenticated
│   └── uiStore.ts                   # Zustand : état UI (sidebar, etc.)
├── services/
│   ├── api.ts                       # Instance Axios + intercepteurs JWT (Bearer token)
│   ├── auth.ts                      # login(), register() → POST /api/auth/*
│   └── upload.ts                    # uploadProjectDocument(), uploadVaultDocument()
├── hooks/
│   ├── useAuth.ts                   # useLogin(), useRegister(), useLogout() (mutations)
│   ├── useProject.ts               # useProjects(), useProject(id), useCreateProject(), useUpdateProject(), useCompleteStep()
│   └── useDocuments.ts             # Hooks CRUD documents coffre-fort
├── components/
│   ├── layout/
│   │   ├── Layout.tsx              # Wrapper : Sidebar + Header + <Outlet /> + ToastContainer
│   │   ├── Sidebar.tsx             # Navigation latérale collapsible (hover expand)
│   │   └── Header.tsx              # Barre supérieure : breadcrumb + search + notif + avatar
│   ├── common/
│   │   ├── DeleteConfirmModal.tsx   # Modal danger avec confirmation texte
│   │   ├── ExpiryAlert.tsx         # Bannière expiration document (rouge/amber)
│   │   ├── FileCard.tsx            # Card document coffre-fort
│   │   ├── LoadingProgress.tsx     # Cercle de progression SVG avec confettis
│   │   ├── PaymentCard.tsx         # Carte bancaire 3D avec effet perspective
│   │   ├── PlanetBackground.tsx    # Animation orbitale décorative (landing)
│   │   ├── Skeleton.tsx            # Shimmer loading placeholders
│   │   ├── StatusBadge.tsx         # Badge coloré (success/warning/danger/info/neutral)
│   │   ├── SubscriptionWall.tsx    # Modal paywall freemium (Pro 249€ / Business 399€)
│   │   └── Toast.tsx               # Notifications toast empilées (global toast())
│   ├── dashboard/
│   │   ├── AOCard.tsx              # Card projet avec progress, deadline J-X, lot
│   │   └── StatsBar.tsx            # Grille 4 stats KPI
│   └── project/
│       ├── AnalysisProgress.tsx    # Overlay progression analyse/génération IA
│       ├── PdfViewerModal.tsx      # Viewer PDF plein écran (zoom, page, highlight)
│       └── StepProgress.tsx        # Indicateur étapes horizontales (6 steps)
└── routes/
    ├── Landing.tsx                  # Page d'accueil marketing (publique)
    ├── Login.tsx                    # Connexion
    ├── Register.tsx                 # Inscription
    ├── Pricing.tsx                  # Page tarifs (publique)
    ├── Dashboard.tsx                # Tableau de bord principal
    ├── Projects.tsx                 # Liste des projets (grille AOCard)
    ├── NewProject.tsx               # Formulaire création projet
    ├── Project.tsx                  # Container projet + StepProgress + sous-routes
    ├── Vault.tsx                    # Coffre-fort documentaire
    ├── References.tsx               # Références chantiers
    ├── Company.tsx                  # Profil entreprise
    ├── MemoireConfig.tsx            # Configuration mémoire technique
    ├── Team.tsx                     # Équipe
    ├── Settings.tsx                 # Paramètres compte
    ├── Billing.tsx                  # Facturation / abonnement
    └── project/
        ├── StepUpload.tsx           # Étape 1 : Upload DCE (drag-drop, ZIP)
        ├── StepLotSelection.tsx     # Étape 2 : Détection et sélection lots
        ├── StepAnalysis.tsx         # Étape 3 : Résultats analyse IA
        ├── StepCandidat.tsx         # Étape 4 : Checklist candidature
        ├── StepMemoire.tsx          # Étape 5 : Génération mémoire technique
        └── StepExport.tsx           # Étape 6 : Export final
```

### Router

- **Librairie :** React Router v6 (`BrowserRouter`)
- **Guard :** `PrivateRoute` (redirige vers `/login` si non authentifié), `PublicRoute` (redirige vers `/dashboard` si déjà connecté)

### Toutes les routes

| Route | Composant | Accès | Description |
|-------|-----------|-------|-------------|
| `/` | Landing | Public | Page d'accueil marketing |
| `/pricing` | Pricing | Public | Page tarifs |
| `/login` | Login | Public (redirige si auth) | Connexion |
| `/register` | Register | Public (redirige si auth) | Inscription |
| `/dashboard` | Dashboard | Privé (Layout) | Tableau de bord |
| `/projects` | Projects | Privé | Liste des AO |
| `/projects/new` | NewProject | Privé | Créer un AO |
| `/projects/:id/*` | Project | Privé | Container projet (nested routes) |
| `/projects/:id/upload` | StepUpload | Privé | Étape 1 |
| `/projects/:id/lots` | StepLotSelection | Privé | Étape 2 |
| `/projects/:id/analysis` | StepAnalysis | Privé | Étape 3 |
| `/projects/:id/candidature` | StepCandidat | Privé | Étape 4 |
| `/projects/:id/memoire` | StepMemoire | Privé | Étape 5 |
| `/projects/:id/export` | StepExport | Privé | Étape 6 |
| `/vault` | Vault | Privé | Coffre-fort docs |
| `/references` | References | Privé | Références chantiers |
| `/memoire-config` | MemoireConfig | Privé | Config mémoire |
| `/company` | Company | Privé | Profil entreprise |
| `/team` | Team | Privé | Gestion équipe |
| `/settings` | Settings | Privé | Paramètres |
| `/billing` | Billing | Privé | Facturation |
| `*` | Redirect `/` | — | Fallback |

---

## 2. Composants

### Composants partagés (layout)

| Composant | Chemin | Rôle |
|-----------|--------|------|
| `Layout` | `components/layout/Layout.tsx` | Flex h-screen : Sidebar + (Header + `<Outlet />`) + ToastContainer. Background `#080B12` avec gradients ambiants |
| `Sidebar` | `components/layout/Sidebar.tsx` | Nav latérale collapsible hover (72px → 260px, 300ms). Logo Synorix, 6 nav items, plan card, logout |
| `Header` | `components/layout/Header.tsx` | Barre sticky glassmorphism : breadcrumb (auto-detect route) + pill (search + Bell notif + avatar initiales) |

### Composants common

| Composant | Props principales | Ce qu'il affiche |
|-----------|-------------------|------------------|
| `DeleteConfirmModal` | `title, message, projectName, onConfirm, onCancel` | Modal danger, input de confirmation texte "SUPPRIMER", boutons Annuler/Supprimer |
| `ExpiryAlert` | `expiryDate, documentName` | Bannière inline rouge (≤7j) ou amber (8-30j) avec icone et jours restants |
| `FileCard` | `document, onDelete` | Card document horizontal : icone type, nom, expiry, badge statut, boutons lien/suppr |
| `LoadingProgress` | `progress (0-100), label, sublabel, variant` | Cercle SVG animé, pourcentage au centre, confettis à 100%. Variants : upload/analysis/generation |
| `PaymentCard` | `cardType, lastFour, holderName, expiryDate` | Carte 3D 340x200 avec chip, logo, tilt au hover |
| `PlanetBackground` | (aucun) | Planète orbitale animée 800x800 (décoration landing) |
| `Skeleton` | `className` | Shimmer loading. Exports : SkeletonText, SkeletonAvatar, SkeletonCard |
| `StatusBadge` | `label, variant` | Pill colorée. Helpers : `complianceStatusBadge()`, `documentStatusBadge()`, `projectStatusBadge()` |
| `SubscriptionWall` | `open, onClose, feature` | Modal paywall glassmorphism : 2 plans (Pro 249€, Business 399€), features, CTA → /facturation |
| `Toast` | Global `toast(msg, variant)` | Notifications top-right, auto-dismiss 4s, progress bar, variants success/error/info/warning |

### Composants project

| Composant | Props | Ce qu'il affiche |
|-----------|-------|------------------|
| `AnalysisProgress` | `isAnalyzing, isSuccess, onComplete, stages` | Overlay plein écran, cercle progression, étapes animées, checkmark à 100% |
| `PdfViewerModal` | `fileUrl, fileName, targetPage, searchText, onClose` | Viewer PDF 85vw×90vh, zoom 0.5-2.5x, navigation clavier, highlight recherche |
| `StepProgress` | `currentStep, completedSteps, onStepClick` | 6 cercles horizontaux connectés (Upload → Lots → Analyse → Candidature → Mémoire → Export) |

### Composants dashboard

| Composant | Props | Ce qu'il affiche |
|-----------|-------|------------------|
| `AOCard` | `project, onDelete` | Card projet : status pill, nom, maître d'ouvrage, lot, progress bar, J-X deadline, bouton continuer |
| `StatsBar` | `stats` | Grille 4 cols : AO en cours, soumis ce mois, gagnés, taux succès |

### State management

- **Zustand** (`stores/authStore.ts`) : user, organization, accessToken, isAuthenticated. Persiste dans localStorage via `persist` middleware
- **TanStack React Query** : Toute la data serveur (projects, documents, stats, compliance, etc.). staleTime 5min, retry 1

---

## 3. Design actuel

### Fonts importées

Chargées via Google Fonts dans `index.html` :

| Font | Poids | Usage |
|------|-------|-------|
| **Plus Jakarta Sans** | 400, 500, 600, 700 (+ italic) | Font display (titres), configurée dans Tailwind comme `font-display` |
| **DM Sans** | 300, 400, 500, 600 (+ italic) | Font UI corps de texte, configurée comme `font-sans` |
| **JetBrains Mono** | 400, 500 | Font monospace (code, chiffres), configurée comme `font-mono` |

> **Note :** Le Dashboard utilise aussi `Outfit` (référencée en inline style `fontFamily: "'Outfit', sans-serif"`) mais elle n'est **pas importée** dans index.html. Elle est absente du chargement Google Fonts.

### CSS Variables (`tokens.css`)

```css
/* Glass effect */
--glass-opacity: 0.04;
--glass-blur: 16px;
--glass-border-opacity: 0.08;
--glass-saturate: 150%;
--glass-hover-opacity: 0.07;
--glass-hover-border: 0.15;

/* Shadows */
--shadow-card: 0px 4px 6px rgba(0,0,0,0.25), 0px 10px 40px rgba(0,0,0,0.15);
--shadow-card-hover: 0px 8px 20px rgba(0,0,0,0.3), 0px 0px 30px rgba(59,130,246,0.06);
--shadow-horizon: 14px 17px 40px 4px rgba(0,0,0,0.20);
--shadow-horizon-hover: 14px 17px 40px 4px rgba(0,0,0,0.28), 0 0 24px rgba(59,130,246,0.06);

/* Card backgrounds */
--card-navy: #111C44;
--card-navy-alt: #0B1437;

/* Text hierarchy */
--text-primary: rgba(255,255,255,0.92);
--text-secondary: rgba(255,255,255,0.65);
--text-tertiary: rgba(255,255,255,0.45);
--text-muted: rgba(255,255,255,0.30);

/* Border radius */
--radius-card: 20px;
--radius-lg: 16px;
--radius-md: 12px;
--radius-sm: 8px;

/* Accent */
--accent-blue: #3B82F6;
--accent-blue-light: #60A5FA;
--accent-cyan: #06B6D4;
--accent-green: #10B981;
--accent-amber: #F59E0B;
--accent-red: #EF4444;

/* Background gradients */
--bg-gradient-1: radial-gradient(ellipse 80% 80% at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 50%);
--bg-gradient-2: radial-gradient(ellipse 60% 60% at 80% 20%, rgba(6,182,212,0.06) 0%, transparent 50%);
--bg-gradient-3: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(59,130,246,0.03) 0%, transparent 60%);
```

### Classes glass (tokens.css)

| Classe | Usage |
|--------|-------|
| `.glass-card` | Card de base (blur 16px, border 0.08, radius 20px, hover) |
| `.glass-stat` | Card stat (hover translateY -2px) |
| `.glass-sidebar` | Sidebar (blur 20px, border-right) |
| `.glass-header` | Header (blur 24px, background 75% opaque) |
| `.glass-input` | Input field (focus ring bleu) |
| `.glass-btn` | Bouton glass (hover 10% opacity) |
| `.glass-nav` | Item navigation (hover/active states) |
| `.glass-badge` | Badge inline-flex |
| `.glass-auth` | Card auth forte (blur 32px, radius 24px) |

### Classes utilitaires (index.css)

- `.btn-primary` — Bouton gradient bleu avec ::before glow, hover brightness
- `.btn-glass` — Bouton verre transparent
- `.input-dark` — Input sombre avec placeholder et focus
- `.progress-track`, `.progress-bar-gradient`, `.progress-bar-success` — Barres de progression
- `.pill`, `.pill-success`, `.pill-warning`, `.pill-danger`, etc. — Pills colorées
- `.table-dark` — Table sombre avec hover rows
- `.nav-item`, `.nav-item.active` — Items navigation (active ::before indicator)
- `.text-gradient`, `.text-gradient-subtle` — Texte gradient
- `.glow-cyan`, `.glow-blue`, `.glow-sm`, `.glow-blue-strong` — Effets glow
- `.card-premium` — Card premium avec hover
- `.gradient-border` — Bordure gradient via ::before
- `.animate-fade-in`, `.animate-fade-in-delay-1` à `6` — Animations séquentielles
- `.skeleton-shimmer` — Animation shimmer loading

### CSS Variables (index.css — shadcn/ui HSL)

```css
--background: 216 28% 7%;
--foreground: 214 32% 91%;
--card: 220 39% 9%;
--primary: 217 91% 60%;
--secondary: 217 33% 12%;
--muted: 217 33% 12%;
--accent: 217 33% 12%;
--destructive: 0 84% 60%;
--border: 217 33% 12%;
--ring: 217 91% 60%;
--radius: 0.625rem;
```

### Tailwind config — custom tokens

**Custom colors (namespace `ds.`) :**

| Token | Valeur | Usage |
|-------|--------|-------|
| `ds.bg` | `#080B12` | Fond principal app |
| `ds.bg-2` | `#0F172A` | Fond secondaire |
| `ds.bg-3` | `#1E293B` | Fond tertiaire |
| `ds.sidebar` | `#0B0F17` | Fond sidebar |
| `ds.text` | `#E2E8F0` | Texte principal |
| `ds.text-2` | `#64748B` | Texte secondaire |
| `ds.text-3` | `#475569` | Texte tertiaire |
| `ds.cyan` | `#3B82F6` | Accent principal (nommé "cyan" mais c'est du bleu) |
| `ds.teal` | `#60A5FA` | Accent light |
| `ds.blue` | `#3B82F6` | Bleu |
| `ds.indigo` | `#6366F1` | Indigo |
| `ds.success` | `#10B981` | Vert succès |
| `ds.warning` | `#F59E0B` | Amber warning |
| `ds.danger` | `#EF4444` | Rouge danger |
| `ds.border-subtle` | `rgba(255,255,255,0.06)` | Bordure subtile |
| `ds.border-hover` | `rgba(59,130,246,0.25)` | Bordure hover |

**Custom gradients :**
- `gradient-cta` : `linear-gradient(135deg, #3B82F6, #60A5FA)`
- `gradient-success` : `linear-gradient(135deg, #10B981, #3B82F6)`
- `gradient-subtle` : `linear-gradient(135deg, rgba(59,130,246,0.12), rgba(96,165,250,0.08))`

**Custom shadows :**
- `glow-cyan` : `0 0 20px rgba(59,130,246,0.35)`
- `card` : `0 4px 24px rgba(0,0,0,0.5)`
- `card-hover` : `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)`
- `glass` : `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`

**Backdrop blur :** `xs: 4px`, `DEFAULT: 16px`, `lg: 24px`, `xl: 32px`

**Animations :** `accordion-down`, `accordion-up`, `wave`, `fade-in`, `shimmer`, `pulse_glow`

**Plugins :** `tailwindcss-animate`, `@tailwindcss/typography`

### Librairies UI installées

| Librairie | Version | Usage |
|-----------|---------|-------|
| `lucide-react` | 0.414.0 | Toutes les icones (AUCUN emoji/unicode) |
| `@radix-ui/*` | v1-2 | 12 primitives : alert-dialog, avatar, checkbox, dialog, dropdown-menu, label, progress, select, separator, slot, tabs, toast, tooltip |
| `react-hook-form` | 7.52.2 | Formulaires (Login, Register, NewProject) |
| `@hookform/resolvers` | 3.9.0 | Zod resolver pour react-hook-form |
| `zod` | 3.23.8 | Validation schemas |
| `class-variance-authority` | 0.7.0 | Variants composants (shadcn/ui) |
| `clsx` + `tailwind-merge` | 2.1.1 / 2.4.0 | Merge classnames (fn `cn()`) |
| `react-dropzone` | 14.2.3 | Drag-drop upload fichiers |
| `react-pdf` | 10.4.1 | Viewer PDF dans PdfViewerModal |
| `react-markdown` | 10.1.0 | Rendu markdown mémoire technique |
| `docx` | 9.6.1 | Génération Word côté client (non utilisé, export backend) |
| `date-fns` | 3.6.0 | Formatage dates (locale FR) |
| `@stripe/stripe-js` | 4.1.0 | Stripe (placeholder) |
| `axios` | 1.7.3 | Client HTTP |
| `@tanstack/react-query` | 5.51.1 | Cache serveur, mutations |
| `zustand` | 4.5.4 | State management client |
| `react-router-dom` | 6.26.0 | Routing |

---

## 4. Pages detaillees

### Dashboard.tsx

**Layout :** Page avec 4 glow blobs en fond (fixed, pointer-events none), gap 14px entre sections.

**Structure :**

1. **Greeting card** (full width) — Glassmorphism `rgba(14,20,35,0.7)` backdrop-blur(20px)
   - Gauche : "Bonjour, {prenom}" 20px Outfit 600 + "Pret a repondre a vos appels d'offres" 13px
   - Droite : Horloge live 48px Outfit 300 (setInterval 1s) + date "Lundi 30 mars 2026" 12px

2. **Stat cards** (grille 4 colonnes) — Compacts, padding 14px 16px, radius 12px
   - Dot coloré 4px + label uppercase 11px
   - Nombre 24px Outfit 600
   - Tendance : ArrowUpRight/Down 11px + valeur + "vs mois dernier" 10px
   - Cards : AO en cours (bleu), Taux conformite (vert), AO gagnes (cyan), CA en cours (amber)
   - Animation fadeUp staggerée (0.06 + i*0.07)
   - CountUp animé 900ms cubic ease-out

3. **Layout 2 colonnes** (grid `2fr 1fr`, gap 14px)
   - **Gauche :** Projets recents (grille 3 cols de AOCard, ou empty state dashed)
   - **Droite :**
     - Insights card : Donut SVG (67% centre, arcs bleu/cyan/rouge) + 3 barres progression (AO deposes 75%, Taux succes 67%, Conformite 94%) height 4px
     - Activite recente : dots 5px, titres 13px weight 450, timestamps 11px, badges pill 11px rgba 0.08
     - Actions rapides : 3 boutons discrets (Nouvel AO, Coffre-fort, Deadlines) avec ChevronRight

### Landing.tsx

| Section | Lignes | Contenu |
|---------|--------|---------|
| **Navigation** | ~265-346 | Header sticky glassmorphism, logo "S" + "Synorix", liens (Features, Pricing, Contact), CTA "Commencer" |
| **Hero** | ~351-461 | PlanetBackground animée, badge "Propulse par l'IA", titre "Repondez aux appels d'offres 10x plus vite" (shimmer gradient sur "10x"), sous-titre, 2 CTA, trust signal 4 avatars + "120+ entreprises BTP" |
| **Features** | ~466-539 | Titre "Tout ce dont vous avez besoin", grille 2 cols de 4 feature cards (Analyse DCE/FileText, Detection multi-lots/Layers, Conformite auto/ShieldCheck, Memoire IA/BookOpen) |
| **How it works** | ~544-647 | 3 steps en colonnes (01 Upload/Upload, 02 Analyse/Brain, 03 Export/FileDown) avec watermark numbers et connecteurs dashed |
| **Pricing** | ~652-775 | 2 plans (Pro 249€, Business 399€), badge "POPULAIRE" sur Business, features avec checkmarks |
| **CTA Band** | ~780-832 | Card gradient, "Pret a gagner plus de marches?", bouton glow-pulse |
| **Footer** | ~837-983 | 4 colonnes (Brand, Produit, Entreprise, Legal), copyright, liens login/register |

### Login.tsx

- **Layout :** Card centrée avec glow blobs en fond
- **Header :** Icone Sparkles + "SYNORIX", titre "Connexion"
- **Champs :** Email (icone Mail), Password (icone Lock)
- **Validation :** Zod (email required, password min 6)
- **Bouton :** Loading spinner pendant mutation
- **Lien :** "S'inscrire" vers /register
- **API :** `useLogin()` → POST /api/auth/login

### Register.tsx

- **Layout :** Card centrée plus large que login
- **Header :** Logo + "Creer mon compte"
- **Champs :** Nom (User), Organisation (Building2), SIRET (Hash, 14 chiffres), Email + Password (grille 2 cols)
- **Selection plan :** 2 boutons interactifs (Pro/Business) avec prix, description, features, checkmark
- **Validation :** Zod avec validation SIRET personnalisée
- **API :** `useRegister()` → POST /api/auth/register

### NewProject.tsx

- **Layout :** Card glassmorphism max-w-lg centrée, bouton retour
- **Header :** Icone Briefcase, "Nouvel appel d'offres"
- **Champs :** Nom projet (requis, min 3), Maitre d'ouvrage (optionnel, icone User), Date limite (optionnel, type date, icone Calendar)
- **Bouton :** "Creer le projet →" ou "Creation en cours..." avec spinner
- **Erreurs :** Bandeau rouge AlertCircle si erreur API
- **API :** `useCreateProject()` → POST /api/projects → navigate `/projects/{id}/upload`

### Stepper projet (6 etapes)

#### Etape 1 — StepUpload.tsx (Upload DCE)
- Dropzone drag-drop (react-dropzone)
- Detection auto du type par nom de fichier (RC, CCTP, CCAP, DPGF, etc.)
- Selector dropdown type par document
- Progress modal (LoadingProgress) pendant upload
- Liste documents uploades avec icone, nom, taille, type badge, bouton delete
- Erreur explicite pour .rar/.7z (non supporte)
- Bouton "Detecter les lots →" (GET /projects/{id}/lots)
- **API :** GET/POST/DELETE `/projects/{id}/documents`, GET `/projects/{id}/lots`

#### Etape 2 — StepLotSelection.tsx (Selection lot)
- Cards lots avec radio button, nom, confidence badge (vert ≥80%, amber 50-79%, rouge <50%)
- Sources indicator ("Confirme par X sources : DPGF, RC, Fichier")
- Option "Tous les lots" en haut
- Formulaire ajout lot manuel (numero 1-30, intitule optionnel)
- Warning lots erreur (Excel protege par mot de passe)
- **Paywall :** Si plan free → SubscriptionWall au clic sur "Lancer l'analyse IA"
- Bouton "Lancer l'analyse IA →" (POST `/projects/{id}/analyze`)
- **API :** POST `/projects/{id}/lots/select`, POST `/projects/{id}/analyze`

#### Etape 3 — StepAnalysis.tsx (Resultats analyse IA)
- Loading avec polling (GET `/projects/{id}/analysis-progress`) tant que items vides
- LoadingProgress avec "Document X/Y — nom_fichier"
- Bandeau filtre lot (documents inclus/exclus)
- Card Infos Marche (objet, maitre ouvrage, duree, montant, procedure)
- Card Conditions Financieres (delai paiement, penalites, retenue garantie)
- Card Conditions Execution (visite site, variantes, sous-traitance)
- Card Criteres de Jugement (tableau criteres + poids + sous-criteres)
- Rapport exigences : filtre par categorie (Candidature/Offre/Technique/Planning/Criteres) + recherche
- Tableau par categorie : exigence, source (doc + page), priorite (obligatoire/souhaitee), bouton source externe
- Clic source → ouvre PDF a la bonne page avec highlight
- Bouton "J'ai pris connaissance de l'analyse" → complete step 3
- **API :** GET `/projects/{id}/compliance`, GET `/projects/{id}/analysis-progress`, GET `/projects/{id}/documents`

#### Etape 4 — StepCandidat.tsx (Checklist candidature)
- Barre progression (X/total documents)
- Pourcentage conformite
- Checklist groupee par statut : Expire (rouge), Manquant, Expiration proche, Present/Valide
- Chaque ligne : icone statut, type document, details, source RC, bouton upload si manquant
- Bouton "Candidature complete" ou "Validee"
- **API :** GET `/projects/{id}/checklist`, POST `/projects/{id}/complete-step/4`

#### Etape 5 — StepMemoire.tsx (Generation memoire technique)
- Formulaire generation : nb ouvriers, delai, particularites (textarea)
- **Paywall :** Si plan free → SubscriptionWall au clic sur "Generer le memoire technique"
- Progress overlay pendant generation (polling GET `/projects/{id}/memoire/progress`)
- Affichage memoire en sections Markdown (Preambule, Partie A 11 sections, Partie B 7 sections, Partie C 7 sections)
- Editeur plein ecran Markdown (textarea monospace)
- Boutons : Exporter Word, Modifier, Regenerer
- **API :** GET/POST/PATCH `/projects/{id}/memoire`, GET `/projects/{id}/memoire/progress`, GET `/projects/{id}/memoire/export-docx`

#### Etape 6 — StepExport.tsx (Export final)
- Resume de completude (compliance, checklist, memoire, DPGF)
- Export DOCX ou ZIP
- **API :** GET `/projects/{id}/export/summary`, GET `/projects/{id}/export/docx`, GET `/projects/{id}/export/zip`

---

## 5. Sidebar

### Items de navigation

| Ordre | Label | Icone (lucide-react) | Route |
|-------|-------|---------------------|-------|
| 1 | Tableau de bord | `LayoutDashboard` | `/dashboard` |
| 2 | Projets | `FolderOpen` | `/projects` |
| 3 | References | `Building2` | `/references` |
| 4 | Coffre-fort | `Archive` | `/vault` |
| 5 | Equipe | `Users` | `/team` |
| 6 | Facturation | `CreditCard` | `/billing` |
| — | Deconnexion | `LogOut` | (action logout) |

### Collapse/Expand

- **Trigger :** `onMouseEnter` → expand, `onMouseLeave` → collapse
- **Tailles :** Collapsed = 72px, Expanded = 260px
- **Transition :** 300ms ease-in-out
- **Collapsed :** Icones seules, labels masques, tooltips au hover
- **Expanded :** Labels visibles (opacity 0→1 avec delay 0.15s), card plan complete

### Elements supplementaires

- **Logo :** Carre bleu gradient "S" + texte "Synorix" gradient (bleu→cyan)
- **Card plan :** Rond avec initiale plan, label "Plan Pro", barre progression "3 AO / 15 max"
- **Indicateur actif :** Barre droite bleue (#3B82F6) avec glow, background rgba bleu
- **Style :** `.glass-sidebar` (blur 20px, border-right subtile)

---

## 6. Backend endpoints

### Vue d'ensemble

- **Framework :** FastAPI
- **BDD :** PostgreSQL (SQLAlchemy ORM, Alembic migrations)
- **Auth :** JWT Bearer (HS256, expiry 7 jours)
- **IA :** Anthropic Claude API (Sonnet pour analyse, Opus pour memoire)
- **Prefix :** Tous les endpoints sous `/api/`

### Liste complete des endpoints

#### Auth (`/api/auth`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/register` | Inscription (email, password, name, org_name, siret, plan="free") → {user, organization, tokens} |
| POST | `/login` | Connexion (email, password) → {user, organization, tokens} |
| GET | `/me` | User + organization courante |

#### Organizations (`/api/organizations`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/me` | Organisation courante |
| PATCH | `/me` | MAJ profil entreprise (tous champs optionnels) |

#### Users (`/api/users`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/team` | Liste membres equipe |
| POST | `/team` | Creer membre equipe |
| DELETE | `/team/{member_id}` | Supprimer membre |

#### Documents coffre-fort (`/api/documents`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `` | Liste documents coffre-fort |
| POST | `` | Upload document (file + type + dates) |
| DELETE | `/{doc_id}` | Supprimer document |

#### References (`/api/references`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `` | Liste references chantiers |
| POST | `` | Creer reference |
| DELETE | `/{ref_id}` | Supprimer reference |

#### Projects (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `` | Liste projets (filtre par org) |
| POST | `` | Creer projet (name, maitre_ouvrage?, deadline?) → status="brouillon", step=1 |
| GET | `/{id}` | Detail projet |
| PATCH | `/{id}` | MAJ projet |
| DELETE | `/{id}` | Supprimer projet + cascade |
| GET | `/{id}/documents` | Liste documents DCE du projet |
| POST | `/{id}/documents` | Upload document/ZIP (auto-detect type, extraction ZIP nested, PDF conversion) |
| PATCH | `/{id}/documents/{doc_id}` | Changer type document |
| DELETE | `/{id}/documents/{doc_id}` | Supprimer document |
| GET | `/{id}/lots` | Detecter lots (Excel + RC + filenames) |
| POST | `/{id}/lots/select` | Selectionner lot → step 3 |
| POST | `/{id}/complete-step/{step}` | Marquer etape completee |

#### Analyse IA (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/{id}/analyze` | Lancer analyse DCE (Claude Sonnet). Extrait exigences, criteres, infos marche. Timeout 280s |
| GET | `/{id}/analysis-progress` | Progression analyse (total_docs, analyzed_docs, current_doc_name) |

#### Compliance (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/{id}/compliance` | Matrice conformite (exigences extraites) |

#### Candidature (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/{id}/checklist` | Checklist candidature (documents requis vs coffre-fort) |

#### Memoire technique (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/{id}/memoire` | Recuperer memoire genere |
| POST | `/{id}/memoire/generate` | Generer memoire (Claude Opus). Params : nb_ouvriers, delai, particularites |
| GET | `/{id}/memoire/progress` | Progression generation (sections completees) |
| PATCH | `/{id}/memoire` | Sauvegarder modifications content_json |
| GET | `/{id}/memoire/export-docx` | Exporter en Word (.docx) |

#### Config memoire (`/api/memoire-config`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `` | Config memoire de l'organisation |
| PUT | `` | MAJ config |
| POST | `/import` | Importer depuis Word/PDF (extraction IA) |

#### Export (`/api/projects`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/{id}/export/summary` | Resume completude (compliance, checklist, memoire, dpgf) |
| GET | `/{id}/export/docx` | Export dossier complet en Word |
| GET | `/{id}/export/zip` | Export dossier complet en ZIP |

#### Dashboard (`/api/dashboard`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/stats` | KPIs (AO en cours, soumis ce mois, gagnes, taux succes, docs expires) |

#### Fichiers (`/api/files`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/view/{file_path}` | Servir fichier inline (PDF highlight, MIME detection, anti-traversal) |

#### Sante

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Health check |

### Modele de donnees

```
Organization (1) ──┬── (*) User
                   ├── (*) Project ──┬── (*) ProjectDocument
                   │                 ├── (*) ComplianceItem
                   │                 ├── (*) ChecklistItem ──── (0..1) Document (vault)
                   │                 └── (0..1) MemoireTechnique
                   ├── (*) Document (vault)
                   ├── (*) TeamMember
                   ├── (*) Reference
                   ├── (*) MemoireTemplate
                   └── (0..1) MemoireConfig
```

| Table | Colonnes cles |
|-------|---------------|
| `organizations` | id, name, siret, plan (free/pro/business), stripe_customer_id, presentation, historique, activites, moyens, vehicules, materiel, fournisseurs |
| `users` | id, org_id, email, password_hash, name, role (admin/member) |
| `projects` | id, org_id, name, status (brouillon/en_cours/soumis/gagne/perdu), deadline, current_step (1-6), completed_steps (JSON), criteres_jugement (JSON), infos_marche (JSON), lots_detectes (JSON), selected_lot |
| `project_documents` | id, project_id, type (rc/cctp/ccap/dpgf/acte_engagement/plan/autre), file_url, extracted_text, file_size, page_count, pdf_preview_url, related_lots (JSON) |
| `documents` | id, org_id, type (18 types admin), file_url, file_name, issued_date, expiry_date, status (valid/expiring_soon/expired) |
| `compliance_items` | id, project_id, exigence_text, source_document, source_page, source_excerpt, status, category (candidature/offre/technique/planning/criteres_notation), priority, suggestion_ia |
| `checklist_items` | id, project_id, document_type_required, linked_document_id (FK vault), status (present/manquant/expire/expiration_proche), details, source_in_rc |
| `memoires_techniques` | id, project_id (unique), content_json, version, generated_at, variables (JSON), is_reference_template |
| `memoire_configs` | id, org_id (unique), 20+ champs config entreprise |
| `memoire_templates` | id, org_id, name, corps_metier, content_json, is_default |
| `team_members` | id, org_id, name, role, specialite, experience_years, certifications |
| `references` | id, org_id, intitule, maitre_ouvrage, lot, montant_ht, annee, statut (gagne/perdu/en_cours) |

---

## 7. Flow utilisateur complet

### Inscription → Export memoire

```
1. INSCRIPTION (gratuit)
   └─ /register → email, nom, organisation, SIRET, mot de passe
   └─ Plan = "free" par defaut
   └─ → Redirige vers /dashboard

2. DASHBOARD
   └─ KPIs, projets recents, activite
   └─ Bouton "Nouvel AO"

3. CREATION PROJET
   └─ /projects/new → nom, maitre d'ouvrage, date limite
   └─ POST /api/projects → status "brouillon", step 1
   └─ → Redirige vers /projects/{id}/upload

4. ETAPE 1 — UPLOAD DCE (GRATUIT)
   └─ Drag-drop ou clic pour uploader ZIP ou fichiers individuels
   └─ Detection auto du type (RC, CCTP, DPGF, etc.)
   └─ Extraction ZIP (nested), conversion PDF preview
   └─ → Bouton "Detecter les lots"

5. ETAPE 2 — SELECTION LOT (GRATUIT)
   └─ Lots detectes automatiquement (Excel + RC + noms fichiers)
   └─ Indicateurs de confiance et sources
   └─ Ajout lot manuel possible
   └─ Selection du lot cible ou "Tous les lots"
   └─ ┌──────────────────────────────────────┐
     │ PAYWALL : Clic "Lancer l'analyse IA" │
     │ Si plan = free → SubscriptionWall     │
     │ (Modal Pro 249€ / Business 399€)      │
     │ CTA → /facturation                    │
     └──────────────────────────────────────┘
   └─ Si plan pro/business → POST /api/projects/{id}/analyze

6. ETAPE 3 — ANALYSE IA (PAYANT)
   └─ Claude Sonnet lit tous les documents
   └─ Extrait : exigences, criteres de jugement, infos marche
   └─ Affiche : matrice conformite, conditions, filtres
   └─ Clic source → ouvre PDF a la bonne page
   └─ Bouton "J'ai pris connaissance" → step 4

7. ETAPE 4 — CHECKLIST CANDIDATURE (PAYANT)
   └─ Documents requis vs coffre-fort
   └─ Status : present, manquant, expire, expiration proche
   └─ Upload direct si manquant
   └─ Bouton "Candidature complete" → step 5

8. ETAPE 5 — MEMOIRE TECHNIQUE (PAYANT)
   └─ ┌──────────────────────────────────────────┐
     │ PAYWALL : Clic "Generer le memoire"       │
     │ Si plan = free → SubscriptionWall          │
     └──────────────────────────────────────────┘
   └─ Si plan pro/business → Claude Opus genere ~20 pages
   └─ Structure : Preambule + Partie A (entreprise) + B (prestation) + C (methodologie)
   └─ Editeur Markdown plein ecran
   └─ Export Word (.docx)

9. ETAPE 6 — EXPORT FINAL
   └─ Resume completude
   └─ Export DOCX ou ZIP du dossier complet
```

### Ou est le paywall exactement

1. **StepLotSelection.tsx ligne ~258** : `handleLaunch()` verifie `organization.plan`. Si `"free"` → `setShowPaywall(true)` → affiche `SubscriptionWall` avec `feature="analysis"`
2. **StepMemoire.tsx ligne ~384** : Bouton "Generer le memoire" verifie `organization.plan`. Si `"free"` → `setShowPaywall(true)` → affiche `SubscriptionWall` avec `feature="memoire"`

Le paywall est uniquement cote **frontend**. Il n'y a pas de verification backend du plan avant les endpoints `/analyze` ou `/memoire/generate`.

---

## 8. Dependances

### Frontend (package.json)

**Runtime (34 deps) :**

| Package | Version | Role |
|---------|---------|------|
| react | 18.3.1 | Framework UI |
| react-dom | 18.3.1 | DOM renderer |
| react-router-dom | 6.26.0 | Routing |
| @tanstack/react-query | 5.51.1 | Server state / cache |
| zustand | 4.5.4 | Client state |
| axios | 1.7.3 | HTTP client |
| lucide-react | 0.414.0 | Icones |
| tailwind-merge | 2.4.0 | Merge Tailwind classes |
| tailwindcss-animate | 1.0.7 | Animations Tailwind |
| @tailwindcss/typography | 0.5.19 | Plugin prose |
| clsx | 2.1.1 | Class conditionnelles |
| class-variance-authority | 0.7.0 | Variants (shadcn/ui) |
| react-hook-form | 7.52.2 | Formulaires |
| @hookform/resolvers | 3.9.0 | Zod resolver |
| zod | 3.23.8 | Validation schemas |
| react-dropzone | 14.2.3 | Drag-drop upload |
| react-pdf | 10.4.1 | Viewer PDF |
| react-markdown | 10.1.0 | Rendu Markdown |
| docx | 9.6.1 | Generation Word (client) |
| date-fns | 3.6.0 | Dates |
| @stripe/stripe-js | 4.1.0 | Stripe (placeholder) |
| @radix-ui/react-alert-dialog | 1.1.1 | Dialog danger |
| @radix-ui/react-avatar | 1.1.0 | Avatar |
| @radix-ui/react-checkbox | 1.1.1 | Checkbox |
| @radix-ui/react-dialog | 1.1.1 | Dialog |
| @radix-ui/react-dropdown-menu | 2.1.1 | Menu dropdown |
| @radix-ui/react-label | 2.1.0 | Label |
| @radix-ui/react-progress | 1.1.0 | Progress bar |
| @radix-ui/react-select | 2.1.1 | Select |
| @radix-ui/react-separator | 1.1.0 | Separator |
| @radix-ui/react-slot | 1.1.0 | Slot (shadcn) |
| @radix-ui/react-tabs | 1.1.0 | Tabs |
| @radix-ui/react-toast | 1.2.1 | Toast |
| @radix-ui/react-tooltip | 1.1.2 | Tooltip |

**Dev (13 deps) :**

| Package | Version |
|---------|---------|
| typescript | 5.5.3 |
| vite | 5.3.4 |
| @vitejs/plugin-react | 4.3.1 |
| tailwindcss | 3.4.7 |
| postcss | 8.4.40 |
| autoprefixer | 10.4.19 |
| eslint | 8.57.0 |
| @typescript-eslint/eslint-plugin | 7.15.0 |
| @typescript-eslint/parser | 7.15.0 |
| eslint-plugin-react-hooks | 4.6.2 |
| eslint-plugin-react-refresh | 0.4.8 |
| @types/react | 18.3.3 |
| @types/react-dom | 18.3.0 |

### Backend (requirements.txt)

| Package | Version | Role |
|---------|---------|------|
| fastapi | 0.111.1 | Framework API |
| uvicorn[standard] | 0.30.1 | Serveur ASGI |
| sqlalchemy | 2.0.31 | ORM |
| alembic | 1.13.2 | Migrations BDD |
| psycopg2-binary | 2.9.9 | Driver PostgreSQL |
| pydantic | 2.8.2 | Validation donnees |
| pydantic-settings | 2.3.4 | Gestion settings |
| python-jose[cryptography] | 3.3.0 | JWT |
| passlib[bcrypt] | 1.7.4 | Hash passwords |
| bcrypt | 4.0.1 | Crypto |
| python-multipart | 0.0.9 | Upload fichiers |
| httpx | 0.27.0 | Client HTTP async |
| anthropic | 0.31.0 | Claude API |
| json-repair | 0.30.3 | Reparer JSON malformes |
| boto3 | 1.34.144 | AWS S3 |
| python-docx | 1.1.2 | Generation Word |
| PyPDF2 | 3.0.1 | Lecture PDF |
| openpyxl | 3.1.5 | Lecture Excel |
| celery | 5.4.0 | Taches async |
| redis | 5.0.7 | Cache / queue |
| stripe | 10.5.0 | Paiement |
| python-dotenv | 1.0.1 | Variables env |
| email-validator | 2.2.0 | Validation email |
| Pillow | 10.4.0 | Traitement images |

### Services backend (`backend/services/`)

| Fichier | Role |
|---------|------|
| `ai/__init__.py` | Services IA (DCEAnalyzer, MemoireGenerator, ChecklistMatcher, MemoireImporter) |
| `document_processor.py` | Extraction texte (PDF, DOCX, Excel) |
| `document_tagger.py` | Detection type document par nom |
| `docx_exporter.py` | Export memoire en Word |
| `expiry_checker.py` | Verification expiration documents |
| `file_storage.py` | Stockage fichiers (local / S3) |
| `lot_detector.py` | Detection lots (Excel sheets + RC + filenames) |
| `pdf_converter.py` | Conversion DOCX/Excel → PDF preview |
| `pdf_highlighter.py` | Highlight texte dans PDF |

---

> **Note pour le designer :** Le Dashboard utilise la font `Outfit` en inline style mais elle n'est pas importee dans les Google Fonts. A ajouter si on garde ce design. La font `Plus Jakarta Sans` est importee mais peu utilisee (surtout logo Sidebar). `DM Sans` est la font principale du corps de texte.
