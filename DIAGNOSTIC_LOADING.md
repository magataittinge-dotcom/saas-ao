# Diagnostic — perceived loading sur le SaaS

**Date :** 2026-05-03
**Scope :** identifier l'origine des "trous noirs" pendant 1-3 s sur Dashboard et autres pages.

---

## 1. Inventaire skeletons / loaders

| Fichier | Ligne | Pattern | Couleur visible |
|---|---|---|---|
| `frontend/src/components/common/Skeleton.tsx` | 4 | `Skeleton` base | `#F1F5F9` (slate-100, OK) |
| `frontend/src/components/common/Skeleton.tsx` | **41** | `SkeletonCard` wrapper | **`#0C1222` ❌ slate-950 quasi-noir — la racine du bug** |
| `frontend/src/index.css` | 600-610 | `.skeleton-shimmer` | gradient cyan transparent (subtil, OK) |
| `frontend/src/routes/Dashboard.tsx` | 166 | `<SkeletonCard h-[110px]>` × 4 | hérite `#0C1222` ❌ |
| `frontend/src/routes/Dashboard.tsx` | 223 | `<SkeletonCard h-[52px]>` × 3 | hérite `#0C1222` ❌ |
| `frontend/src/routes/Project.tsx` | 36-41 | spinner cyan `animate-spin` h-64 | OK (pas de noir) |
| `frontend/src/routes/Projects.tsx` | 173-178 | spinner cyan `animate-spin` py-16 | OK |
| `frontend/src/routes/MemoireConfig.tsx` | 481-485 | spinner cyan h-64 | OK |
| `frontend/src/routes/project/StepCandidat.tsx` | 73-83 | spinner + texte "Chargement…" | OK mais générique |
| `frontend/src/routes/project/StepAnalysis.tsx` | 231-241 | spinner + texte | OK mais générique |
| `frontend/src/routes/project/StepExport.tsx` | 296-307 | spinner + texte | OK mais générique |
| `frontend/src/routes/project/StepMemoire.tsx` | 806-818 | spinner + texte | OK mais générique |
| `frontend/src/components/project/VaultPickerModal.tsx` | 109 | spinner local | OK |
| `frontend/src/routes/Vault.tsx` | (aucun) | rendu direct avec `data = []` | flash empty state |
| `frontend/src/routes/References.tsx` | (aucun) | rendu direct avec `data = []` | flash empty state |
| `frontend/src/routes/Company.tsx` | (aucun) | aucun fetch identifié | n/a |
| `frontend/src/routes/Team.tsx` | (aucun) | aucun fetch identifié | n/a |

**Verdict :** un seul vrai bug visuel — `SkeletonCard` (ligne 41 de `Skeleton.tsx`) avec `background: '#0C1222'`. C'est utilisé uniquement par Dashboard, mais c'est le composant le plus visible (4 stat cards + 3 lignes projets) → "trous noirs" pendant 1-3 s.

Les autres pages utilisent un spinner cyan sur fond blanc — moins agressif mais pas optimal (générique, ne ressemble pas au contenu, pas progressif).

---

## 2. API calls au mount des 5 pages

| Page | Hook / useQuery | Endpoint | Loading state |
|---|---|---|---|
| **Dashboard** (`Dashboard.tsx:98-105`) | `useQuery(['projects'])` | `GET /projects` | `pLoad` indép. |
| **Dashboard** | `useQuery(['dashboard-stats'])` | `GET /dashboard/stats` | `sLoad` indép. |
| **Projects** (`Projects.tsx:29`) | `useProjects()` | `GET /projects` | `isLoading` global |
| **StepUpload** (cf `StepUpload.tsx`) | (à confirmer — pas de useQuery direct vu) | — | — |
| **StepCandidat** (`StepCandidat.tsx:23`) | `useQuery(['checklist',id])` | `GET /projects/{id}/checklist` | tout-ou-rien |
| **StepMemoire** (`StepMemoire.tsx:697`) | `useQuery(['memoire',id])` | `GET /projects/{id}/memoire` | tout-ou-rien |

Bonus :
- `Project.tsx:18` utilise `useProject(id)` puis bloque tout l'écran en spinner avant de monter le step. **Double loading** : spinner pour le projet, puis loader du step.
- Dashboard a déjà du **fetching parallèle** (2 useQuery indépendants) → bon point.
- Step* sont en **tout-ou-rien** — pas de progressive rendering.

React Query est correctement configuré (`main.tsx:15-22`) : `staleTime: 5 min`, `retry: 1`. La navigation interne dans la fenêtre 5 min n'a donc PAS de re-fetch — les flashs n'arrivent qu'à la 1ʳᵉ visite ou après 5 min d'inactivité.

---

## 3. Mesure des temps backend — **nécessite un token Clerk**

Tous les endpoints exigent un JWT Clerk valide (`get_auth_user` → JWKS check). Pas de bypass DEBUG dans le code — pas de moyen de mesurer en local sans token.

**À toi, Mohamed :** copie-colle la sortie de :
```bash
TOKEN="<copie le JWT depuis devtools → Application → Cookies → __session, ou Network tab>"
for ep in /api/dashboard/stats /api/projects /api/documents /api/users/team; do
  echo -n "$ep : "
  curl -w "%{time_total}s\n" -o /dev/null -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000$ep"
done
```

Cible : tous < 0.2 s en local. Si > 0.5 s, on creuse en Phase 4.

**Hypothèse a priori :** vu la nuit (14 indexes + cache 60 s sur dashboard), je m'attends à :
- `/api/dashboard/stats` < 30 ms (cache HOT) ou < 80 ms (cache COLD, 2 SUM CASE)
- `/api/projects` < 50 ms (single indexed query)
- `/api/documents` < 50 ms (single indexed query)
- `/api/users/team` ~50 ms

Si tu confirmes ces ordres, **le bottleneck n'est pas le backend** — c'est uniquement le composant `SkeletonCard` (couleur + tout-ou-rien) + la route `Project.tsx` qui block la nested step pendant 1 fetch.

---

## 4. Hypothèses de causes (à valider par les mesures)

1. **Couleur SkeletonCard (CRITIQUE)** — `#0C1222` au lieu de slate-100 → "trous noirs" pendant 1-3 s. **Fix : 5 lignes dans `Skeleton.tsx`.**
2. **Cold-start réseau** — TLS handshake + JWKS Clerk fetch sur le 1ᵉʳ render après login. Visible une fois, pas pour les navigations internes.
3. **Project.tsx serial loading** — bloque le step en plein écran avant de monter `StepX`, qui à son tour bloque jusqu'à ses propres données. **Fix : afficher le squelette du stepper même pendant le fetch projet.**
4. **Vault / References pas de loading state** — flash d'empty state au lieu d'un skeleton. **Fix : ajouter un skeleton table tant que `isLoading`.**
5. **Step* tout-ou-rien** — un seul fetch par step, pas progressif. **Fix : skeletons par section.**

---

## 5. Plan Phase 2-5 (en attente validation Mohamed)

**Phase 2 — Refactor skeletons (1 h)**
- Réécrire `Skeleton.tsx` avec couleur slate-100/200 + shimmer plus visible
- Créer `<StatCardSkeleton>`, `<ProjectRowSkeleton>`, `<RequirementCardSkeleton>`, `<MemoireSectionSkeleton>`, `<DocumentRowSkeleton>` aux dimensions exactes du contenu réel
- Remplacer les `<SkeletonCard>` du Dashboard par les bons skeletons spécifiques
- Ajouter `animate-in fade-in duration-200` sur le contenu real

**Phase 3 — Progressive loading (1 h)**
- `Project.tsx` : afficher le stepper en skeleton tant que projet pas chargé
- `Step*.tsx` : split en sections avec leur propre `isLoading`
- `Vault.tsx` / `References.tsx` : ajouter table skeleton

**Phase 4 — Backend perf (45 min, peut-être skip)**
- Selon les mesures Phase 1 §3, optimiser uniquement les endpoints > 200 ms
- Vu la nuit, vraisemblablement skip. Au pire : ajouter cache 60 s sur `/api/projects` + `/api/documents`.

**Phase 5 — Test réel + commit**

---

## 6. Décision attendue Mohamed

- Confirme les temps API du §3 (token requis)
- Valide qu'on ne touche QUE le scope skeleton + perceived perf (pas de drive-by)
- Choisis la couleur de base : slate-100 (`#F1F5F9`, très clair) ou slate-200 (`#E2E8F0`, légèrement plus visible) ?
