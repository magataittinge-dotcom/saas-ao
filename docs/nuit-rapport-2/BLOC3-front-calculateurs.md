# BLOC 3 — Front ↔ calculateurs déterministes (0 API, lecture seule, plan sans code)

Base : audit frontend nuit 1 (`docs/nuit-rapport/BLOC2-audit-frontend.md`) — front mature React 18 + TS + Tailwind + React Router v6 + @tanstack/react-query + axios (`services/api.ts`, `baseURL=/api`, JWT Clerk injecté). Sidebar : Tableau de bord, Projets, Mémoires techniques, Références, Coffre-fort, Équipe, Facturation, Paramètres.

## Rappel : les endpoints du Bloc 1 ne sont PAS project-scoped
`POST /api/calculators/oab` et `/retenue-garantie` ne prennent **pas** de `project_id` — ce sont des outils génériques « marchés publics ». Ils peuvent donc vivre **hors pipeline projet** (page dédiée) et/ou être appelés **en contexte** (étape offre, pré-remplis).

## Composants UI réutilisables repérés (à réemployer, ne pas réinventer)
| Composant | Emploi pour les calculateurs |
|---|---|
| `components/common/StatusBadge.tsx` | **Jauge OAB vert/orange/rouge** (`gauge`) — mapping direct. |
| `SummaryCard` + `AccordionSection` (dans `StepExport.tsx`) | Carte résultat (postes retenue, M1/M2/seuil) + sections repliables. |
| `components/common/AiTip.tsx` | Afficher `rappel_juridique` (TA Nantes Verchéenne) et `avertissements`. |
| Formulaires Tailwind inline (cf. `StepLotSelection.tsx`) | `components/ui/` est **vide** (pas de shadcn) → suivre le pattern inline `<input className=...>` existant. |
| `services/api.ts` (`api.post`) | Appels — `api.post('/calculators/oab', body)`. |

## Où brancher — recommandation

### Option A (recommandée, minimale) — page dédiée « Outils / Calculateurs » dans la sidebar
- Ajouter 1 item sidebar `{ to: '/outils', icon: Calculator, label: 'Calculateurs' }` (`components/layout/Sidebar.tsx`) + route `/outils` (`App.tsx`) → page `routes/Tools.tsx` avec 2 cartes (OAB, Retenue de garantie).
- **Avantage** : découplé du pipeline, expose la valeur immédiatement, 0 dépendance projet. Cohérent avec le fait que les endpoints sont génériques.

### Option B (complément contextuel) — encart dans l'étape Export/Offre
- Dans `routes/project/StepExport.tsx` (qui gère déjà DPGF / montant offre) : un encart « Risque OAB » pré-rempli avec le total DPGF comme `prix_candidat`, + saisie manuelle des offres concurrentes ; et « Retenue de garantie » pré-rempli avec le montant marché.
- **Avantage** : contextualisé au projet. **À faire après l'option A** (réutilise les mêmes composants).

## Plan minimal (sans coder)

**1. Calculateur OAB** (`/outils`, carte 1)
- Form : `prix_candidat` (number), liste dynamique `prix_offres[]` (ajout/suppression), `seuil_oab` (défaut 0,9, avancé).
- Appel : `const { data } = await api.post('/calculators/oab', { prix_candidat, prix_offres, seuil_oab })`.
- Affichage : `StatusBadge` couleur=`gauge` ; carte M1 / M2 / `seuil_oab_euros` / `marge_avant_oab` ; `est_oab` en gros (« Offre anormalement basse : OUI/NON ») ; `AiTip` avec `rappel_juridique` + `avertissements`.

**2. Calculateur Retenue de garantie** (`/outils`, carte 2)
- Form : `montant_ht` (number), `taux_rg` (déf 5 %), `tva` (déf 20 %), champs avancés (pénalités : `jours_retard_execution`, `penalite_diviseur` ; moratoires : `taux_bce`, `jours_retard_paiement`).
- Appel : `api.post('/calculators/retenue-garantie', body)`.
- Affichage : `montant_ttc` en tête ; tableau des `postes[]` (poste / montant / base / detail) via `SummaryCard` ou table Tailwind ; `avertissements` via `AiTip`.

**3. Validation côté front** : mirror léger des bornes backend (montants > 0, taux_rg ≤ 5 %) pour feedback immédiat ; le backend reste l'autorité (422 géré → message d'erreur).

## Effort estimé
- 1 page `Tools.tsx` + 2 cartes formulaire + 1 item sidebar + 1 route : **~0,5 j front**, 0 backend (endpoints prêts), 0 API.
- Réutilise StatusBadge/AiTip/SummaryCard → peu de CSS neuf.

## Verdict
✅ Branchement front **simple et à faible risque** : les endpoints sont prêts et génériques, les composants d'affichage (jauge, carte résultat, tip) existent déjà. Recommandation : **page « Calculateurs » dédiée (option A)** en premier (découplée, valeur immédiate), puis encart contextuel dans l'étape Export (option B).
