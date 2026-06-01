# BLOC 2 — Audit Frontend (lecture seule, 0 API)

**Stack confirmée :** React 18 + TypeScript + Vite + Tailwind + Zustand + React Router v6 + @tanstack/react-query + axios + Clerk (auth) + react-pdf + react-dropzone.
**Couche API :** `src/services/api.ts` — instance axios `baseURL=/api`, JWT Clerk injecté par intercepteur. En dev, Vite proxie `/api → localhost:8000`.

## Constat global

> Le frontend **n'est pas le goulot d'étranglement**. Il est **mature, complet et entièrement câblé** aux endpoints backend. Le pipeline 6 étapes a une UI fonctionnelle de bout en bout. **Le seul écran qui échouera à l'exécution est la génération de mémoire — non par défaut d'UI, mais à cause du bug backend du moteur mémoire (cf. BLOC1).**

---

## Pipeline 6 étapes — état du câblage

Routage : `routes/Project.tsx` monte 6 sous-routes (`upload / lots / analysis / candidature / memoire / export`), pilotées par `StepProgress` (stepper cliquable, `current_step` / `completed_steps` depuis la DB).

| Étape | Fichier | Lignes | Endpoints appelés | État |
|-------|---------|--------|-------------------|------|
| 1. Upload | `StepUpload.tsx` | 637 | `GET/POST/DELETE /projects/{id}/documents`, `PATCH …/documents/{docId}` (type) | ✅ **Câblé & fonctionnel** (dropzone, polling progress, classement type) |
| 2. Lots | `StepLotSelection.tsx` | 791 | `GET /projects/{id}/lots` (polling status/progress), `POST …/lots/select`, `PATCH …/lots/{id}/rename` | ✅ **Câblé & fonctionnel** (détection async + saisie manuelle de lots) |
| 3. Analyse | `StepAnalysis.tsx` | 678 | `GET …/documents`, `GET …/compliance` (matrice de conformité), validation | ✅ **Câblé & fonctionnel** (compliance matrix, recherche, surlignage source) |
| 4. Candidature | `StepCandidat.tsx` | 247 | `GET …/checklist`, `POST`/`PUT` (compléter une pièce) | ✅ **Câblé & fonctionnel** (checklist pièces, statut, vault picker) |
| 5. Mémoire | `StepMemoire.tsx` | 1284 | `GET …/memoire`, `POST …/memoire/generate`, `PATCH …/memoire`, `GET …/memoire/export-docx`, `GET /memoire-config/stats` | ⚠️ **UI complète & câblée MAIS** `generate` → backend cassé (BLOC1 #1/#2/#3). L'éditeur, l'export, le profil sont prêts. |
| 6. Export | `StepExport.tsx` | 738 | `GET …/export/detail`, `GET …/export/docx`, `GET …/export/zip`, `POST …/dpgf-upload` | ✅ **Câblé & fonctionnel** (DOCX + ZIP dossier AO + DPGF) |

**Aucun stub trouvé** dans les 6 étapes. Toutes utilisent `useQuery`/`useMutation` réels vers l'API.

---

## Cohérence Front ↔ Back (endpoints)

Tous les endpoints appelés par le front **existent** côté backend (routers vérifiés) :

| Front appelle | Router backend | OK |
|---------------|----------------|----|
| `POST /projects/{id}/analyze` | `analysis.py:34` | ✅ |
| `GET /projects/{id}/compliance` | `compliance.py:15` | ✅ |
| `GET /projects/{id}/checklist` | `candidature.py:42` | ✅ |
| `POST /projects/{id}/memoire/generate` | `memoire.py:45` | ✅ (mais moteur cassé) |
| `GET/PATCH /projects/{id}/memoire` | `memoire.py:32/200` | ✅ |
| `GET …/lots` · `POST …/lots/select` | `projects.py:1368/1562` | ✅ |
| `GET …/export/docx` · `/export/zip` · `/export/detail` | `export.py:156/185/30` | ✅ |
| `GET/POST …/documents` · `POST …/dpgf-upload` | `documents.py` | ✅ |
| `GET /memoire-config/stats` · `GET/PUT /memoire-config` | `memoire_config.py` | ✅ |

→ **Pas de désalignement front/back détecté.** Le contrat d'API est cohérent.

---

## Sidebar v2 — état

`components/layout/Sidebar.tsx` — nav actuelle (8 items) :

| Concept mission v2 | Item sidebar actuel | Route | État |
|--------------------|---------------------|-------|------|
| Mes AO | **Projets** | `/projects` (213 l, réel) | ✅ présent (label différent) |
| Mon entreprise | — | `/company` (135 l, réel) | ⚠️ **route existe mais ABSENTE de la sidebar nav** (accessible via Header/breadcrumb) |
| Mes références | **Références** | `/references` (91 l, réel) | ✅ présent |
| Bibliothèque mémoire | **Mémoires techniques** | `/memoire-config` (771 l, réel) | ✅ présent (≈) |
| Coffre-fort | **Coffre-fort** | `/vault` (128 l, via hooks `useDocuments`) | ✅ présent & fonctionnel |
| (extra) | Tableau de bord, Équipe, Facturation, Paramètres | — | ✅ présents |

**Seule anomalie sidebar :** « Mon entreprise » (`/company`) n'est pas listé dans `navItems` alors que la page existe et appelle l'API. À ajouter (1 ligne).

---

## Pages principales (hors pipeline) — toutes réelles

| Page | Lignes | Appels API | État |
|------|--------|-----------|------|
| Dashboard | 565 | 3 | ✅ données réelles |
| Projects | 213 | 1 | ✅ liste réelle |
| Company | 135 | 1 | ✅ réel (mais hors sidebar) |
| References | 91 | 1 | ✅ réel |
| Vault | 128 | via `useDocuments`/`uploadService` | ✅ réel (upload + ExpiryAlert) |
| MemoireConfig | 771 | 3 | ✅ réel (profil entreprise riche) |
| Billing | 392 | (Stripe) | ✅ réel |
| NewProject | 189 | — | ✅ création projet |

---

## Verdict Bloc 2

- **Front = câblé / complet** sur l'intégralité du pipeline 6 étapes et la sidebar v2 (à 1 item près).
- **Manquant / partiel :**
  1. ⚠️ « Mon entreprise » (`/company`) absent de la sidebar nav (page fonctionnelle pourtant) — **fix 1 ligne**.
  2. ⚠️ L'étape Mémoire a une **UI prête** mais sera **inutilisable tant que le moteur backend n'est pas réparé** (BLOC1). C'est un blocage **backend**, pas frontend.
- **Aucun stub**, aucun endpoint front sans contrepartie backend.

**Implication clé :** réparer le moteur mémoire (BLOC1) débloque immédiatement un parcours utilisateur **déjà entièrement construit côté front**. Le ROI de ce correctif est maximal.
