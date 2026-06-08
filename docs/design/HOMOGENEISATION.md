# Homogénéisation visuelle — récap

> Mission : sécuriser les bugs déjà faits, rendre « Mon entreprise » accessible, et aligner toutes les pages secondaires sur la qualité du Dashboard (charte Synorix stricte : DM Sans, cyan #0EA5E9, glass-card, tokens `ds-*`). Frontend uniquement, build vert après chaque lot, commits + push par lot.

## Étape 0 — Bugs sécurisés ✅
Commit `4afc71b` — *fix(front): footer sticky + lien profil entreprise + prix plans (299/499)* — **pushé** sur `refactor-v2`.

## Étape 1 — « Mon entreprise » dans la nav ✅
Commit `67ffcbf` — **pushé**.
- `/company` (Company.tsx) **n'était pas dans la sidebar** → ajoutée (icône `Briefcase`, entre « Références » et « Calculateurs »).
- Page vérifiée : formulaire profil (nom, SIRET, adresse, présentation, historique, activités, moyens…), sauvegarde via `PATCH /organizations/me` (endpoint existant), `glass-card` + `btn-primary` + barre de complétion cyan.
- **Cohérence libellés** : « Mon entreprise » partout — sidebar, lien Settings, titre de page (était « Mon Entreprise »), breadcrumb Header (était « Mon Entreprise »).

## Étape 2 — Homogénéisation visuelle ✅

### Cause racine n°1 — tokens de couleur invalides
Plusieurs pages paraissaient « plates/ternes » à cause de **classes Tailwind inexistantes** (donc sans couleur appliquée) :
- `text-ds-blue` / `text-ds-blue-light` (5 fichiers : Settings, Billing, Projects, NewProject, PdfViewerModal) — **n'existent pas** dans `tailwind.config.js`. → remplacés par `ds-cyan` / `ds-cyan-dark`.
- `text-ds-success-light` (Billing) — inexistant. → `ds-cyan` / `ds-cyan-dark`.

### Cause racine n°2 — texte blanc sur fond clair (Billing)
Les prix `299€` / `499€` et le prix des cartes plan étaient en `text-white` sur fond clair (**invisibles**, vestige d'un thème sombre). → `text-ds-text`. Bouton « Gérer mon abonnement » dont le texte devenait invisible au survol → restylé lisible.

### Cause racine n°3 — couleurs hors-charte
- **Violet** (`rgba(139,92,246)`) : badge « Populaire » de Billing, Pricing, paywall (SubscriptionWall) → cyan.
- **Teal** (`rgba(0,212,170)`) : MemoireConfig (3×), AnalysisProgress, NewProject → cyan.
- **Amber/orange** (`#F59E0B`, `#F97316`, `rgba(245,158,11)`, `rgba(249,115,22)`, `#FFFBEB`) : états « warning / expire bientôt » dans StepUpload, StepExport, StepLotSelection, CandidatureSection×2, VaultPickerModal → **slate** (rôle warning de la charte).
- **Indigo générique** (`#3B82F6`) : icône fichier StepUpload → cyan.

### Cause racine n°4 — échéances alarmistes
`AOCard` (cartes /projects) utilisait du **rouge agressif** pour les deadlines proches → passé en **cyan calme** (règle « premium silencieux, jamais alarmiste »), wording adouci (« Échéance aujourd'hui », « À déposer »).

### Pages / lots retravaillés
| Lot | Commit | Contenu |
|---|---|---|
| Dashboard (référence) | `2b66d5b` | refonte commitée (cartes glass animées, rail pipeline, échéances cyan) — sert de référence |
| Settings | `4102b9a` | token cyan valide, contraste sous-titre (`text-3`→`text-2`), libellé « Mon entreprise », espacement |
| Billing + Pricing | `1ea42b3` | prix visibles, tokens cyan, suppression violet, bouton lisible, lien charte |
| Outils | `cc09bea` | boutons « Calculer » actifs et vifs (voir décision ci-dessous) |
| Projects + NewProject + AOCard | `3894867` | token cyan, teal→cyan, échéances cyan non alarmistes |
| MemoireConfig + paywall + viewers | `cb81e94` | teal/violet→cyan, token valide |
| Pipeline (6 étapes) | `bfce97d` | amber/indigo→slate/cyan, charte respectée |

Tous **pushés** sur `refactor-v2`. **Build vert (`tsc` + `vite build`) après chaque lot.**

## Décisions / points à arbitrer par Mohamed
1. **Boutons « Calculer » (/outils)** : étaient désactivés (opacité 0.45) tant qu'aucun montant n'était saisi → aspect « pâle ». Je les ai rendus **toujours actifs** (la validation existante affiche un message d'aide au clic à vide). C'est un léger ajustement de comportement (clic possible à vide) au service de la lisibilité demandée. À confirmer.
2. **Refonte Dashboard commitée** : elle était dans l'arbre de travail non commitée et servait de référence à toute l'étape 2 → je l'ai commitée (`2b66d5b`). Si tu voulais encore itérer dessus avant de figer, dis-le.
3. **Émeraude restante** : conservée dans `StepExport` (`isValid` = **Conforme**, usage autorisé par la charte) et `ProgressDisplay` (état « terminé » d'une progression — *borderline*, laissé tel quel pour ne pas casser l'animation). À trancher si tu veux la passer en cyan.
4. **Hors-scope (refonte séparée prévue)** : `Landing.tsx` et `PlanetBackground.tsx` contiennent encore du teal/violet décoratif ; `PaymentCard` garde or/gold (marque carte, légitime). Non touchés.
5. **Orphelin** : `frontend/src/components/ui/GlassButton.tsx` (issu d'une demande antérieure interrompue) reste non commité/non importé. À garder, brancher, ou supprimer.

## Vérifier en local
Serveur dev : `cd frontend && npm run dev` → **http://localhost:3000** (port réel 3000).
- **Nav** : « Mon entreprise » visible dans la sidebar (icône mallette) → ouvre le formulaire `/company`.
- **Billing/Pricing** : prix 299€/499€ bien **visibles**, badge « Populaire » cyan (plus de violet).
- **Outils** : boutons « Calculer » vifs et cliquables.
- **Projects** : cartes AO — deadline proche en **cyan** (plus de rouge).
- **Settings** : icônes/sous-titres cyan et contrastés ; section « Mon entreprise » → lien vers `/company`.
- **Pipeline** (upload→export) : états d'attention en slate (plus d'amber), accents cyan.
