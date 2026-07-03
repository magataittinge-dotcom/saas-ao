# Architecture — Synorix v2.0

**Technical reference for the v2.0 refactor.**

| Field | Value |
|---|---|
| Document version | 2.5 |
| Status | Active — aligné sur **Vision V1 FINALE** (PRD v3.0, 2026-07-01) |
| Companion to | [`PRD_SYNORIX_V2.md`](./PRD_SYNORIX_V2.md), [`SKILLS_REGISTRY_V2.md`](./SKILLS_REGISTRY_V2.md) |
| Last updated | 2026-07-01 |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Multi-Model AI Architecture](#3-multi-model-ai-architecture)
4. [Database Schema](#4-database-schema)
5. [Pipeline Processing Flow](#5-pipeline-processing-flow)
6. [Skills System Architecture](#6-skills-system-architecture)
7. [Security — Non-Negotiables](#7-security--non-negotiables)
8. [Performance — Non-Negotiables](#8-performance--non-negotiables)
9. [Observability](#9-observability)
10. [Deployment](#10-deployment)
11. [MCPs & External Integrations](#11-mcps--external-integrations)
12. [Changelog](#12-changelog)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                                │
│              React 18 + TypeScript + Tailwind                         │
│              Zustand (state) + React Router v6                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS (Clerk-issued JWT)
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Nginx — synorix.tech                               │
│           TLS termination · HSTS · CSP · rate-limit                   │
└────────────┬─────────────────────────────────────────┬───────────────┘
             │                                         │
             ▼                                         ▼
┌────────────────────────────┐         ┌────────────────────────────┐
│   FastAPI (uvicorn)        │         │  Static assets             │
│   - REST API               │         │  - frontend SPA (Vite)     │
│   - Server-Sent Events     │         │  - landing page (dark)     │
│   - WebSocket (Coach)      │         │  → served by Nginx, same   │
│                            │         │    origin (V1.0)           │
└──┬──────┬──────┬───────────┘         └────────────────────────────┘
   │      │      │
   │      │      └────────────────► Anthropic API (Claude)
   │      │                          - Haiku 4.5 / Sonnet 4.6 / Opus 4.7
   │      │                          - Streaming via asyncio.to_thread
   │      │
   │      └─► Redis (cache, session-scratch, pub/sub for Coach)
   │
   ▼
┌────────────────────────────┐
│   PostgreSQL 16            │
│   - Encrypted at rest      │
│   - WAL backups (daily)    │
│   - Read replicas (V1.5)   │
└────────────────────────────┘
   │
   └─► S3-compatible object storage (Hostinger or AWS S3)
       - DCE uploads
       - Coffre-fort docs (encrypted)
       - Generated memos / ZIPs

External integrations:
   - Clerk (auth, sessions, MFA)
   - Stripe (subscriptions)
   - Sentry (error tracking)
   - NotebookLM MCP (skill creation only — not runtime)
   - Higgsfield MCP (landing visuals — design phase only)
```

### Process model

- **Stateless** FastAPI workers behind Nginx
- **Idempotent** request handling (every pipeline step is resumable)
- **Async-first** I/O — `asyncio.to_thread` for any CPU-bound or third-party blocking call (especially Anthropic SDK calls, to avoid WSL2 timeouts during dev)
- **Streaming** responses for AI generation (Server-Sent Events to the SPA)

### Single-VPS V1.0 deployment

V1.0 ships on **one Hostinger KVM1 VPS** (Ubuntu 24.04). All services on the same host:

- Nginx + FastAPI + Postgres + Redis + object-storage proxy
- Vertical scaling first; horizontal scaling deferred to V1.5

This is deliberate — the V2.0 success criterion is *ship & be impressive*, not *scale to 10k tenants*. A bigger architecture is V1.5's problem.

---

## 2. Tech Stack

### 2.1 Frontend

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 18 | Mature, ecosystem, hiring pool |
| Language | TypeScript (strict) | Type safety on the most error-prone layer |
| Styling | Tailwind CSS | Speed of iteration; design tokens via `tailwind.config.js` |
| Components | shadcn/ui | Copy-in pattern, full ownership of components |
| State | Zustand | Lightweight, easier than Redux, scales fine for V2.0 |
| Routing | React Router v6 | Standard |
| Forms | react-hook-form + zod | Type-safe validation client-side |
| Data fetch | TanStack Query | Cache + retries + SSE compatibility |
| Editor (rich text) | TipTap | For memo editor & "Réécrire avec instructions" |
| Editor (spreadsheet) | Handsontable or Glide Data Grid | For DPGF/BPU edit (FR-ANA-12) |
| PDF viewer + highlight | PDF.js + custom highlight layer | For Source-click highlighting (FR-ANA-10) |

### 2.2 Backend

| Concern | Choice | Rationale |
|---|---|---|
| Framework | FastAPI | Async-native, Pydantic-native, OpenAPI free |
| Language | Python 3.12 | Anthropic SDK Python is first-class |
| ORM | SQLAlchemy 2.0 (async) | Mature, async support, expressive querying |
| Migrations | Alembic | Standard with SQLAlchemy |
| Validation | Pydantic v2 | Strict mode on every boundary |
| Background work | Celery + Redis broker | V1.0 keeps it simple — long-running pipeline steps run inline with SSE; Celery for scheduled jobs (follow-ups, expiry alerts) |
| PDF parsing | PyMuPDF (`pymupdf`) | Best perf, text + position + highlight |
| ZIP extraction | `zipfile` + `chardet` for filename encoding | Handles CP437/Latin-1/UTF-8 (FR-UPL-03) |
| DOCX generation | `python-docx` + `docxtpl` | Memo `.docx` export |
| PDF generation | WeasyPrint or `reportlab` | Memo `.pdf` export |
| Image generation | SVG inlined via Python (organigramme, Gantt) | No external dependency |
| AI SDK | `anthropic` Python SDK | First-party, supports prompt caching, streaming |

### 2.3 Data layer

| Concern | Choice | Rationale |
|---|---|---|
| Primary DB | PostgreSQL 16 | JSONB for unstructured DCE outputs, robust SQL for everything else |
| Cache | Redis 7 | Hot reads, session scratch, Coach pub/sub |
| Object storage | Hostinger object storage (S3-compatible) | DCE uploads, generated docs, coffre-fort encrypted |
| Search | Postgres full-text (V1.0); **socle pgvector en place** — migration `0003_rag_corpus_pgvector` (table `rag_chunks`, extension `vector`, index HNSW cosine + GIN FTS français). Ingestion du corpus réglementaire à venir | Le schéma RAG est posé ; le branchement (embeddings Voyage + recherche hybride) reste à câbler |

### 2.4 Auth & payments

| Concern | Choice | Rationale |
|---|---|---|
| Auth | Clerk | Already integrated, MFA-ready, organisation support for Plan Business |
| Payments | Stripe | Subscriptions, prorations, EU VAT |

### 2.5 Observability

| Concern | Choice | Rationale |
|---|---|---|
| Error tracking | Sentry | Frontend + backend, source-maps, perf |
| Structured logs | `structlog` | JSON logs, request-id correlation |
| Metrics | Prometheus (V1.5) | Skip for V1.0; rely on Sentry & log queries |
| Uptime | Better Stack (Uptime) | Free-tier sufficient |

### 2.6 Development

| Concern | Choice |
|---|---|
| Repo | `github.com/magataittinge-dotcom/saas-ao` (branch `refactor-v2`) |
| Dev env | WSL2 Ubuntu on Windows |
| Test framework (Python) | pytest + pytest-asyncio |
| Test framework (TS) | vitest + Playwright (E2E) |
| Lint / format | ruff + black + mypy / eslint + prettier |
| Pre-commit | pre-commit hooks |

---

## 3. Multi-Model AI Architecture

### 3.1 Model assignment per skill

| Model | Use | Avg cost / call | Skills assigned |
|---|---|---|---|
| **Claude Haiku 4.5** | Lightweight classification, deterministic extraction, fast routing, **reformulation de texte libre du profil** | €0.005–0.02 | Steps 1, validation, low-stakes, profil mémoire vivant (§3.7) |
| **Claude Sonnet 4.6** | Bulk analysis, extraction-with-reasoning, long-form memo composition | €0.02–0.90 | Steps 2 & 3 (extraction + alerts), **Step 4 memo composition** |
| **Claude Opus 4.7** | Targeted paragraph rewrite, high-stakes synthesis, **fallback** | €0.10–0.30 | Réécriture ciblée de paragraphe (éditeur mémoire) + fallback |

> **Synorix Score = déterministe 0 € (Vision V1 FINALE).** Le go/no-go d'éligibilité (PRD §1.7 D1) et le score de conformité étape 5 (« 14/16 », PRD §3.5) sont **calculés sans LLM** sur les données déjà extraites — Opus n'y intervient **pas**. Le Synorix Score qualité mémoire /100 (LLM) est déclassé en V1.5.

### 3.2 Cost target per AO

| Step | Model | Estimated cost |
|---|---|---|
| 1 — Upload | Haiku 4.5 | €0.02 |
| 2 — Lots | Sonnet 4.6 | €0.05 |
| 3 — AI Analysis | Sonnet 4.6 | €0.40 |
| 4 — Memo | Sonnet 4.6 | ~€0.50† |
| 5 — Verification | Déterministe 0 € (score conformité, dates, DPGF, signatures) ; Sonnet 4.6 résiduel pour le matching exigences↔pièces | ~€0.02 |
| 6 — Export | none | €0 |
| **Total per AO** | | **~€1.0†** |

> † **Mesuré (full-Sonnet).** La génération mémoire tourne sur Sonnet 4.6 (tous segments), pas Opus. Mesure sur le DCE Gueux (gros DCE) : mémoire ≈ **€0.90 en Sonnet vs ~€6 en Opus** (~7× moins cher), cf. `docs/comparaison-memoire-AB/RESULTAT.md`. Coût/AO réel mesuré **~€1**, dominé par la mémoire ; Opus 4.7 n'est utilisé que pour la réécriture ciblée de paragraphe et le Synorix Score.

À ~40 mémoires/mois sur Pro (€349) → ~€40 de coût IA → **>90 % de marge brute** (Sonnet ~7× moins cher qu'Opus ; le profil mémoire vivant + prompt caching abaissent le coût des mémoires suivants à **< €0,50**).

### 3.3 Prompt caching

All system prompts (per-skill prompt + per-user company profile + per-AO DCE summary) are cached using Anthropic's prompt cache (5-minute TTL).

Cache strategy:

- **Skill system prompt** — cached, near-immutable per skill version
- **Company profile** — cached per user, invalidated on sidebar edit
- **DCE summary** — cached per AO, invalidated on document re-upload

Expected cache-hit ratio: **> 80%** in steady state — divides input-token cost by ~10.

### 3.4 Streaming

Every long-running AI call streams via SSE:

```python
async def stream_memo_section(section: str, ...) -> AsyncIterator[str]:
    async with client.messages.stream(...) as stream:
        async for chunk in stream.text_stream:
            yield chunk
```

Frontend connects via `EventSource` and progressively renders.

### 3.5 Timeouts

- WSL2 development environment causes blocking-call timeouts. Every Anthropic SDK call wraps in `asyncio.to_thread(...)` to avoid event-loop starvation.
- Production timeout per call: **120 s** (Haiku/Sonnet standard), **300 s** (memo composition — Sonnet 4.6, long-form).
- Retry policy: 1 retry on 5xx and 429, exponential back-off.

### 3.6 Failure modes

| Failure | Behaviour |
|---|---|
| Rate limit (429) | Retry with back-off; if persistent, queue and resume |
| 5xx | 1 retry; on persistent failure, surface a banner with "réessayer" CTA |
| Cost guard breach | Soft cap per user/day; hard cap per account; alert via Sentry |
| Output validation failure (Pydantic schema mismatch) | Retry with stricter prompt; on second failure, log + surface graceful error |

### 3.7 Profil mémoire vivant <!-- v2.5 - vision V1 FINALE -->

Le profil entreprise est une **couche stable persistée en BDD** (`companies`, §4.2) — c'est le *profil mémoire vivant* du PRD §4.2. Il vit dans « Mon entreprise » (onglets Identité / Moyens / Certifications), **pas** dans une entrée « mémoire technique » séparée.

- **Lecture au moment T.** La génération du mémoire (Step 4) lit le profil **à l'instant de la génération** ; aucune reconstruction depuis zéro à chaque AO.
- **Overrides locaux par mémoire.** Les modifications faites dans le pre-flight preview sont **locales au mémoire** par défaut (`memos.profile_overrides`, §4.3) ; une case « mettre à jour mon profil » les promeut dans `companies`.
- **Reformulation texte libre → Haiku.** Les champs narratifs libres (historique, présentation) sont reformulables via **Haiku 4.5** (coût négligeable), sans toucher aux données factuelles.
- **Coût.** Profil stable + prompt caching (§3.3) tiennent la cible : **1er mémoire ≤ €1, suivants < €0,50**.

---

## 4. Database Schema

PostgreSQL 16. All tables `snake_case`, primary keys `id BIGSERIAL` (or `UUID` for externally-shared IDs). Timestamps `created_at`, `updated_at` on every table (managed via SQLAlchemy mixin).

### 4.1 Core entities

```sql
CREATE TABLE accounts (
    id BIGSERIAL PRIMARY KEY,
    clerk_org_id TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'business')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    clerk_user_id TEXT UNIQUE NOT NULL,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    email CITEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_account_idx ON users(account_id);
```

### 4.2 Sidebar entities

```sql
CREATE TABLE companies (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    legal_name TEXT,
    siret CHAR(14) NOT NULL UNIQUE,        -- one SIRET = one account, INSEE-validated
    naf_code VARCHAR(6),                   -- INSEE NAF — must start with 41/42/43 (BTP)
    siret_validated_at TIMESTAMPTZ,        -- when INSEE SIRENE confirmed active status
    legal_form TEXT,
    capital_eur NUMERIC(15, 2),
    headquarters_address JSONB,
    legal_representative JSONB,
    workforce JSONB,            -- cadres / employés / ouvriers
    revenue_3y JSONB,           -- last 3 years CA
    technical_capacities JSONB,
    insurances JSONB,
    certifications JSONB,
    -- ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chantier_references (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    year SMALLINT,
    title TEXT NOT NULL,
    address TEXT,
    moa TEXT,
    moe TEXT,
    lot TEXT,
    corps_de_metier TEXT,       -- enum-like FK to a separate ref table
    amount_ht_eur NUMERIC(15, 2),
    photos JSONB,               -- list of S3 keys (kept; see photos_path[] below for typed paths)
    photos_path TEXT[],         -- v2.1: typed S3 paths to photos (preferred over photos JSONB for new entries)
    attestation_doc_id BIGINT REFERENCES coffre_fort_docs(id),
    attestation_bonne_execution_path TEXT,    -- v2.1: S3 path to "attestation de bonne exécution" PDF
    fiche_dechets_path TEXT,                  -- v2.1: S3 path to "fiche déchets" / SOGED of this past chantier (RSE)
    performance_thermique_kWh NUMERIC(8, 2),  -- v2.1: post-execution measured thermal performance, when applicable (ITE / rénovation énergétique refs)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ref_account_idx ON chantier_references(account_id);
CREATE INDEX ref_cdm_idx ON chantier_references(corps_de_metier);
CREATE INDEX ref_amount_idx ON chantier_references(amount_ht_eur);

CREATE TABLE coffre_fort_docs (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    storage_key TEXT NOT NULL,           -- S3 path (encrypted blob)
    original_filename TEXT,
    issued_at DATE,
    expires_at DATE,
    is_valid BOOLEAN GENERATED ALWAYS AS (
        expires_at IS NULL OR expires_at >= CURRENT_DATE
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cf_account_cat_idx ON coffre_fort_docs(account_id, category);
CREATE INDEX cf_expires_idx ON coffre_fort_docs(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE memo_library (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    section TEXT NOT NULL,               -- preambule / presentation / methodologie / etc.
    corps_de_metier TEXT,
    paragraph TEXT NOT NULL,
    source_memo_id BIGINT,
    preference_score SMALLINT DEFAULT 50,  -- editable by user (promote/demote)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ml_lookup_idx ON memo_library(account_id, section, corps_de_metier);
```

### 4.3 Pipeline entities

```sql
CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'brouillon', 'en_cours', 'pret_a_deposer', 'depose',
        'en_cours_evaluation', 'gagne', 'perdu', 'sans_reponse'
    )),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    pipeline_progress JSONB NOT NULL DEFAULT '{"steps": []}'::jsonb,
        -- live progress steps: [{name, status, started_at, ended_at, substeps: [...]}]; see §5 for schema details
    deposit_deadline TIMESTAMPTZ,
    deposit_platform TEXT,
    site_visit JSONB,                    -- {is_mandatory, when, where, registration}
    selected_lots JSONB,                 -- array of lot IDs
    judgement_criteria JSONB,
    deposited_at TIMESTAMPTZ,
    last_followup_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX prj_account_idx ON projects(account_id);
CREATE INDEX prj_status_idx ON projects(status);
CREATE INDEX idx_projects_active ON projects(account_id, status)
    WHERE archived = FALSE;

CREATE TABLE dce_documents (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    doc_type TEXT,                       -- RC / CCAP / CCTP / DPGF / etc.
    extraction_status TEXT NOT NULL CHECK (extraction_status IN ('ok', 'unreadable', 'pending')),
    is_duplicate_of BIGINT REFERENCES dce_documents(id),
    is_superseded_by BIGINT REFERENCES dce_documents(id),
    page_count INTEGER,
    extracted_text_key TEXT,             -- S3 key to extracted text artefact
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dce_project_idx ON dce_documents(project_id);

CREATE TABLE lots (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    corps_de_metier TEXT,
    estimated_amount_ht_eur NUMERIC(15, 2),
    source TEXT CHECK (source IN ('rc', 'dpgf', 'both', 'manual')),
    internal_confidence NUMERIC(3, 2),   -- never exposed in UI
    is_selected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lots_project_idx ON lots(project_id);

CREATE TABLE requirements (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lot_id BIGINT REFERENCES lots(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('admin', 'offer', 'technical', 'trap')),
    title TEXT NOT NULL,
    description TEXT,
    source_doc_id BIGINT REFERENCES dce_documents(id),
    source_page INTEGER,
    source_offset_start INTEGER,
    source_offset_end INTEGER,
    linked_coffre_doc_id BIGINT REFERENCES coffre_fort_docs(id),
    completion_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (completion_status IN ('pending', 'in_progress', 'completed', 'invalid')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX req_project_cat_idx ON requirements(project_id, category);

CREATE TABLE memos (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lot_id BIGINT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    structure JSONB NOT NULL,            -- ordered sections + content
    profile_overrides JSONB,             -- v2.5: per-memo local edits to the living profile (§3.7)
    options JSONB,                       -- which add-ons were checked
    generation_params JSONB,             -- length / tone / technical_level
    docx_key TEXT,
    pdf_key TEXT,
    synorix_score NUMERIC(5, 2),
    synorix_score_breakdown JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memos_project_idx ON memos(project_id);

CREATE TABLE editable_docs (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id BIGINT REFERENCES requirements(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,              -- dpgf / bpu / dc1 / dc2 / ae / etc.
    content JSONB NOT NULL,              -- structured cell-grid for DPGF, fields for Cerfa
    is_complete BOOLEAN NOT NULL DEFAULT false,
    last_saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quota tracking (Vision V1 FINALE): DEUX compteurs mensuels distincts —
-- analyses ET mémoires. Unité : 1 lot = 1 mémoire = 1 unité.
-- Pro : 40 analyses + 40 mémoires / mois. Business : illimité (fair use).
-- Pas de facturation à l'unité supplémentaire en V1 (dépassement -> upgrade).
CREATE TABLE quota_consumption (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lot_id BIGINT REFERENCES lots(id) ON DELETE SET NULL,   -- 1 lot = 1 unité
    kind TEXT NOT NULL CHECK (kind IN ('analyse', 'memoire')),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    billing_period DATE NOT NULL         -- first day of the month (truncated)
);
CREATE INDEX idx_quota_account_period_kind
    ON quota_consumption(account_id, billing_period, kind);

-- v2.1 - notebooks 17/5/26 -- [V1.5 — déclassé de V1 par la Vision V1 FINALE]
-- Jurisprudence reference table. Populated at build time from NotebookLM N6.
-- Read-only at runtime; refreshed when a new ruling is added to N6.
-- Supporte l'ancrage juridique profond (Roadmap V1.5, PRD §9.2).
CREATE TABLE jurisprudence (
    id BIGSERIAL PRIMARY KEY,
    juridiction TEXT NOT NULL CHECK (juridiction IN ('CE', 'CAA', 'TA', 'CJUE', 'Conseil constitutionnel')),
    date DATE NOT NULL,
    numero TEXT NOT NULL,                  -- e.g., "474772", "2405722", "n°506640"
    principe TEXT NOT NULL,                -- the legal principle in one sentence
    application_pratique TEXT NOT NULL,    -- how Synorix surfaces it to users
    notebook_source TEXT NOT NULL DEFAULT 'N6',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jur_juridiction_date ON jurisprudence(juridiction, date DESC);
CREATE INDEX idx_jur_numero ON jurisprudence(numero);

-- v2.1 - notebooks 17/5/26 -- [V1.5 — déclassé de V1]
-- GME (Groupement Momentané d'Entreprises) — supports Skill #89, PRD §9.2 (Roadmap V1.5).
CREATE TABLE groupements (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('conjoint', 'solidaire')),
    mandataire_id BIGINT NOT NULL REFERENCES accounts(id),
    partenaires JSONB NOT NULL,            -- [{siret, raison_sociale, role, capacites_apportees}]
    cca_clauses JSONB,                     -- specific CCAP clauses on the GME (article references)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grp_project ON groupements(project_id);
CREATE INDEX idx_grp_mandataire ON groupements(mandataire_id);

-- v2.1 - notebooks 17/5/26 -- [V1.5 — déclassé de V1]
-- RSE engagements per project — supports Skill #92, PRD §9.2 (Roadmap V1.5).
CREATE TABLE engagements_rse (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categorie TEXT NOT NULL CHECK (categorie IN ('dechets', 'carbone', 'biosources', 'insertion', 'mobilite')),
    description TEXT NOT NULL,
    indicateur_chiffre NUMERIC(12, 3),     -- always user-supplied, never invented
    indicateur_unite TEXT,                 -- e.g., '%', 'kgCO2eq/m2', 't', 'heures d insertion'
    certification_source TEXT,             -- e.g., 'BBCA', 'Effinergie', 'NF Habitat HQE', 'RGE 8632'
    cite_jurisprudence_id BIGINT REFERENCES jurisprudence(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rse_project_cat ON engagements_rse(project_id, categorie);
```

### 4.4 Skills tracking

```sql
CREATE TABLE skill_invocations (
    id BIGSERIAL PRIMARY KEY,
    skill_name TEXT NOT NULL,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cost_eur NUMERIC(8, 6),
    duration_ms INTEGER,
    status TEXT CHECK (status IN ('success', 'retry', 'failed')),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX skill_acc_created_idx ON skill_invocations(account_id, created_at DESC);
CREATE INDEX skill_project_idx ON skill_invocations(project_id);
```

### 4.5 Coach

```sql
CREATE TABLE coach_threads (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,    -- null = global
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coach_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES coach_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_thread_created_idx ON coach_messages(thread_id, created_at);
```

### 4.6 Indexing rules

- **No N+1.** Every relationship traversed in a list view has its child table eagerly loaded via `selectinload` (SQLAlchemy).
- **Every WHERE column is indexed** when used in user-facing queries (sidebar list, project list, requirements list).
- **JSONB** fields used in filters get a **GIN index** (`CREATE INDEX ... USING GIN`).
- **Cursor pagination** is used everywhere — `WHERE id < :last_id ORDER BY id DESC LIMIT :n` rather than OFFSET.

---

## 5. Pipeline Processing Flow

### 5.1 End-to-end flow

```
USER                       BACKEND                        AI
 │
 │── upload(ZIP) ───────►   /projects/{id}/upload
 │                            │
 │                            ├── stream extract → S3
 │                            ├── classify each doc  ──►  Skill #1 (Sonnet)
 │                            ├── detect deadline    ──►  Skill #2 (Sonnet)
 │                            ├── detect duplicates  ──►  Skill #3 (Haiku)
 │                            ├── detect platform    ──►  Skill #4 (Haiku)
 │                            ├── detect site visit  ──►  Skill #5 (Sonnet)
 │                            └── estimate analysis  ──►  Skill #6 (deterministic)
 │
 │◄── upload_complete{summary, eta_min} ─────
 │
 │── select_lots(lot_ids) ─►  /projects/{id}/lots
 │                            │
 │                            ├── detect lots         ──►  Skill #7 (Sonnet)
 │                            ├── detect cdm          ──►  Skill #8 (Haiku)
 │                            ├── extract descriptions──►  Skill #9 (Sonnet)
 │                            └── detect inconsist.   ──►  Skill #10 (Sonnet)
 │
 │◄── lots_ready ────────────
 │
 │── start_analysis() ─────►  /projects/{id}/analyze   (SSE)
 │                            │
 │                            ├── parallel skill fan-out (#11–#18)
 │                            ├── corp-experts dispatch (#26–#35)
 │                            ├── coffre-fort link    (#19, #36)
 │                            ├── source enrichment   (#20)
 │                            └── synthese executive  (#24)
 │
 │◄── SSE chunks ────────────  (incremental requirements as they extract)
 │
 │── start_memo(options) ──►  /projects/{id}/memo     (SSE)
 │                            │
 │                            ├── pull sidebar data   (#37, #38, #39)
 │                            ├── generate sections   (#41–#50)
 │                            ├── generate options    (#51–#58)
 │                            ├── detect phrases risq.(#61)
 │                            └── suggest plus-values (#62)
 │
 │◄── SSE chunks ────────────  (incremental section content)
 │
 │── verify() ────────────►   /projects/{id}/verify
 │                            │
 │                            ├── pieces vs DCE       (#69)
 │                            ├── validity check      (#70)
 │                            ├── synorix score       (#71)
 │                            └── suggestions         (#72)
 │
 │◄── verification_report ───
 │
 │── export() ────────────►   /projects/{id}/export
 │                            │
 │                            ├── render docx         (#63)
 │                            ├── render pdf          (#64)
 │                            ├── compose ZIP         (#73, #74, #75)
 │                            └── store + sign URL
 │
 │◄── zip_url (signed, 24h) ─
```

### 5.2 Resumability

Every step writes its outputs to Postgres **before** signalling the user that the step is done. If the worker dies mid-step, the next request re-reads the partial state and continues from the last successful sub-skill.

### 5.3 Parallelism

Within a step, independent skills run **in parallel** with `asyncio.gather`. Example for Step 3:

```python
admin, offer, tech, criteria, traps, visit, caution = await asyncio.gather(
    extract_admin(...),       # Skill #11
    extract_offer(...),       # Skill #12
    extract_technical(...),   # Skill #13
    extract_criteria(...),    # Skill #14
    detect_traps(...),        # Skill #17
    detect_visit(...),        # Skill #15
    detect_caution(...),      # Skill #16
)
```

Cost-cap and rate-limit guards run at the orchestrator level, not per-skill.

### 5.3bis Chunking anti-troncature (DCE volumineux)

Avant le fan-out des skills d'extraction, le `dce_analyzer` découpe les pièces volumineuses (CCAP/CCTP) en **documents entiers chunkés** avec **déduplication**, ce qui supprime le cap de troncature historique (~30k caractères) qui amputait l'analyse en prod. Couvert par `backend/tests/test_dce_chunking.py` ; mesures avant/après dans `docs/rag/PHASE0-*` (passage ~13 → ~118 exigences CCAP).

### 5.4 Idempotency

Every `POST` mutation accepts an idempotency key (UUID v4 from client). Replays with the same key return the cached result without re-running.

### 5.5 Live progress events (SSE)

Every skill invocation emits one or more progress events over a per-project SSE channel. The frontend connects to `/api/projects/{id}/progress` (SSE) and renders the checkpoint panel from event arrivals (see PRD §3.3.7 for UX).

**Event types:**

- `step_started` — `{ step_name, started_at }`
- `step_substep` — `{ step_name, substep_text, count? }`
- `step_completed` — `{ step_name, completed_at, summary }`
- `step_failed` — `{ step_name, reason }`
- `pipeline_stalled` — emitted after 60 s without any event on the current step; the Coach uses this to surface its explainer

**Storage:** every event is also appended to `projects.pipeline_progress` (JSONB) for replay if the SSE channel drops mid-pipeline. The frontend reconnects with `Last-Event-ID` and the backend resends from that point.

**WSL2 dev note:** SSE is implemented over HTTP/1.1 with `asyncio.to_thread`-wrapped emitters to avoid the long-running async-context timeout observed in WSL2 dev environments.

---

## 6. Skills System Architecture

### 6.1 Skill as a unit of code

A skill = a Python module with a strict interface:

```python
# backend/skills/extraction/exigences_admin.py

from pydantic import BaseModel
from synorix.ai import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput

class Input(SkillInput):
    project_id: int
    rc_text: str
    ccap_text: str | None
    ae_text: str | None

class AdminRequirement(BaseModel):
    type: str
    description: str
    source_doc: str
    source_page: int

class Output(SkillOutput):
    requirements: list[AdminRequirement]

class ExtractionExigencesAdmin(Skill):
    name = "extraction-exigences-administratives"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_admin.md"   # produced via NotebookLM

    async def run(self, inp: Input, *, client: Client) -> Output:
        prompt = self._build_prompt(inp)
        raw = await client.complete(self.model, self.system_prompt, prompt, schema=Output)
        return Output.model_validate(raw)
```

Strict invariants:

- One file per skill — no shared "extraction-utils" module that mutates behaviour.
- `Input` and `Output` are Pydantic models, **validated on both sides**.
- `system_prompt_path` points to a markdown file populated from NotebookLM during skill creation. **The system prompt is never inlined in Python.**
- Every skill is unit-testable against fixtures (real DCE excerpts).

### 6.2 Skill registry

A single Python registry maps `skill_name` → `Skill` class. The orchestrator (Step 3, Step 4, etc.) calls skills **by name** — never by direct import. This makes A/B testing different model assignments or prompt variants trivial.

```python
# backend/skills/registry.py
SKILLS: dict[str, type[Skill]] = {
    "extraction-exigences-administratives": ExtractionExigencesAdmin,
    ...
}

async def invoke(name: str, inp: SkillInput, *, client: Client) -> SkillOutput:
    skill = SKILLS[name]()
    return await skill.run(inp, client=client)
```

### 6.3 Skill creation flow (build-time, NotebookLM-driven)

```
┌───────────────────────────────────────────────────────────────┐
│  Claude Code (build session)                                   │
│                                                                 │
│  1. Read SKILLS_REGISTRY_V2.md entry for skill N                │
│  2. Connect to NotebookLM MCP                                   │
│  3. Ingest the suggested sources                                │
│  4. Ask the "Question NotebookLM" — collect expert answer       │
│  5. Draft the system prompt from the answer                     │
│  6. Write backend/skills/<category>/<name>.py                   │
│  7. Write fixtures + tests                                      │
│  8. pytest backend/skills/<category>/test_<name>.py             │
└───────────────────────────────────────────────────────────────┘
```

At **runtime**, NotebookLM is **not** involved. The expert knowledge it provided has been baked into the system prompt of the skill.

### 6.4 Skill caching at runtime

Two levels:

1. **Anthropic prompt cache** (5-min TTL) — the static part of every skill prompt (system instructions + reference fixtures).
2. **Output cache** (Redis, 24h TTL) — for deterministic skills on identical input (e.g., `detection-plateforme-depot` on the same RC text). Skip for non-deterministic skills (e.g., memo generation).

### 6.5 Versioning

Each skill carries a `version` field. A change to system prompt → `version` bumps. Postgres logs `skill_name, version, model, input_hash, output` for every invocation, enabling:

- Replay an exact prior run
- A/B test versions
- Identify regressions

### 6.6 Skill generation strategy — NotebookLM static snapshot <!-- v2.1 - notebooks 17/5/26 -->

NotebookLM is consulted **only at build time**, never at runtime. The workflow that converts validated notebook expertise into deployable skill code:

```
┌──────────────────────────────────────────────────────────────────┐
│  BUILD TIME (dev, on demand)                                      │
│                                                                    │
│  1. Operator opens NotebookLM workspace (magaaa.dev@gmail.com)    │
│  2. Notebook (e.g., N6 Pièges/Jurisprudence) is verified —        │
│     all expected sources present, validation score ≥ 9/10         │
│  3. Operator asks the skill's "Question NotebookLM"               │
│  4. Operator copies validated answer → `prompts/<skill>.md`       │
│  5. Operator writes `backend/skills/<cat>/<name>.py` with         │
│     Pydantic Input/Output + skill class loading the .md prompt    │
│  6. Operator writes fixtures + tests; pytest                      │
│  7. Skill `version` bumps; deploy                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  RUNTIME (production)                                              │
│                                                                    │
│  Anthropic API call uses the frozen prompt from <skill>.md        │
│  NotebookLM is NEVER called                                       │
│  Determinism, latency, cost — all preserved                       │
└──────────────────────────────────────────────────────────────────┘
```

**Why static and not live (RAG against NotebookLM):**

| Concern | Static snapshot | Live NotebookLM RAG |
|---|---|---|
| Determinism | ✅ frozen prompt → reproducible | ❌ source set drifts |
| Latency | ✅ direct Anthropic call (1–5 s) | ❌ +5–15 s per skill call |
| Cost | ✅ included in ~€1/AO measured cost | ❌ adds €0.05–0.20/AO |
| Audit / compliance | ✅ prompt is in git, replayable | ❌ retrieval drift is opaque |
| Anthropic prompt cache | ✅ hot, ~80% hit ratio | ❌ broken by varying retrieved chunks |

**Refresh process when a notebook source is added (e.g., new CE ruling, new DTU revision):**

1. Add the source to the appropriate notebook in NotebookLM.
2. Re-run the notebook's validation question(s).
3. If the answer materially changes, regenerate `prompts/<skill>.md` for affected skills.
4. Bump each affected skill's `version`; redeploy.
5. Update `NOTEBOOKS_REGISTRY.md` with the new source entry.

**V2 ambition** — automate the change-detection: an Obsidian + RSS regulatory-watch system that auto-suggests new sources to add to NotebookLM when CE / CAA / TA decisions, DTU updates, or DAJ guides are published. Out of V1 scope.

---

## 7. Security — Non-Negotiables

### 7.1 Authentication & Sessions

- Clerk-issued JWT, verified server-side via Clerk public keys.
- Cookies (Clerk session cookie) **HttpOnly + Secure + SameSite=Strict**.
- No tokens in `localStorage`.
- MFA optional V1.0; **required to open coffre-fort** in V1.5.

### 7.2 Authorisation

- Every API route resolves the user's `account_id` server-side from the JWT.
- Every query has `WHERE account_id = :current_account_id`. **No exceptions.**
- Plan Business: 5 seats, two roles (`admin` / `member`). Sidebar write-permissions limited to `admin`.

### 7.3 Input validation

- Every API endpoint receives a **Pydantic v2 model** with strict mode.
- File uploads validated for MIME, magic-bytes, size (5 GB max).
- ZIP entries scanned for path traversal (`..`, absolute paths) before extraction.

### 7.4 SQL injection

- **Zero** string-concatenated SQL. All queries parameterised via SQLAlchemy.
- No `text(f"...{user_value}...")` patterns. PR checks block any `f"...{}..."` near `sa.text`.

### 7.5 XSS

- React handles auto-escaping for rendered content.
- The PDF viewer and the rich-text memo editor (TipTap) sanitise content via DOMPurify before insertion.
- Generated `.docx` and `.pdf` never embed raw HTML from user input.

### 7.6 CSRF

- All state-changing requests carry the Clerk session cookie + a CSRF double-submit token (Clerk-issued). Server validates both.

### 7.7 Secret management

- All secrets via env vars; **never** committed.
- `.env.example` ships with placeholder keys only.
- VPS env vars set via systemd unit file `EnvironmentFile=`.
- Stripe webhook signature verified per request.
- **Stripe webhook endpoint IP-allowlisted** (Stripe published IP ranges) at the Nginx level; webhook signature additionally verified per request in FastAPI.
- **Two distinct Anthropic API keys to support WSL2 development:**
  - `ANTHROPIC_API_KEY_PROD`: IP-locked to the Hostinger VPS public IP via the Anthropic Console. Used only on production.
  - `ANTHROPIC_API_KEY_DEV`: unrestricted, but capped at €50/month via Anthropic Console spending limit. Used in WSL2 dev and CI.
  Keys are never swapped between environments. The frontend never holds either.

### 7.8 Encryption

- **At rest** — Postgres data dir on encrypted volume (LUKS); object-storage server-side encryption (SSE-S3).
- **Coffre-fort docs** — additionally encrypted at the application level with AES-256-GCM and a per-account data key (envelope encryption; KEK in env, DEK in DB).
- **In transit** — TLS 1.3 everywhere; HSTS 1y with `includeSubDomains; preload`.

### 7.9 CSP & headers

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://clerk.synorix.tech https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.synorix.tech;
  font-src 'self';
  connect-src 'self' https://api.anthropic.com https://*.clerk.dev https://api.stripe.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 7.10 Server-side validation, always

Even if the frontend validates a field, the backend **revalidates**. The frontend is a convenience layer, not a security boundary.

### 7.11 Rate limiting

- Per-IP: 100 req / min (Nginx)
- Per-account **throttle technique anti-abus** (distinct du **quota commercial** §8.10 / PRD §6) : 30 uploads DCE / jour ; 100 générations mémoire / jour (FastAPI middleware Redis)
- Coach: 60 messages / hour per user

### 7.12 Audit log

Every privileged action (login, sidebar edit, document download, billing change) logs to a separate Postgres table `audit_log` with `actor_user_id, action, target, ip, user_agent, created_at`.

### 7.13 Data retention & deletion

- Account deletion: pipeline data hard-deleted within 30 days (cascade).
- Coffre-fort docs: hard-deleted immediately on user request.
- Backups: rotated within 90 days.

---

## 8. Performance — Non-Negotiables

### 8.1 Pagination

- Every list endpoint uses **cursor pagination** (`WHERE id < :last_id`), never `OFFSET`.
- Default page size 50, max 200.

### 8.2 Caching

- Redis for: hot-read company profile, hot-read coffre-fort index, Coach session scratch.
- TTLs:
  - Company profile — 5 min (invalidated on update)
  - Coffre-fort index — 1 hour (invalidated on update)
  - Anthropic prompt cache — 5 min (managed by Anthropic)

### 8.3 Indexes

See [§4](#4-database-schema). Every query path in the user-facing flow has been mapped to an index. EXPLAIN ANALYZE runs in CI for any new migration touching > 1M rows.

### 8.4 Eager loading

SQLAlchemy `selectinload` on every relationship traversed in a list view. PR checks reject obvious N+1 patterns.

### 8.5 Streaming

All AI generation streams via SSE. The frontend renders progressively; no spinner > 2 s.

### 8.6 `asyncio.to_thread`

Every Anthropic SDK call wraps in `asyncio.to_thread` — even though the SDK exposes async, this prevents WSL2 event-loop starvation during dev. In production we re-evaluate, but the wrapping is harmless.

### 8.7 Bundle size (frontend)

- Code-split per route (React.lazy + Suspense)
- Tailwind purge enabled (`content` configured)
- TipTap and Handsontable lazy-loaded only when entering the editor pages
- Target: initial JS < 200 KB gzipped

### 8.8 Image optimisation

- Memo photos resized server-side to max 1920 px wide on upload
- WebP served via Nginx where supported

### 8.9 Postgres tuning

V1.0 — sized for KVM2 (16 GB RAM total, shared with FastAPI + Redis + Celery + transient PyMuPDF spikes):

- `shared_buffers = 2 GB` (~12% of RAM, leaves headroom for analysis spikes)
- `effective_cache_size = 6 GB`
- `work_mem = 32 MB`
- `maintenance_work_mem = 512 MB`
- `random_page_cost = 1.1` (SSD)
- Connection pooler: PgBouncer (transaction-pooling), 50 conns

### 8.10 Cost guard

Two distinct dimensions: **customer-visible quota** (Vision V1 FINALE, billing-facing) and **internal AI hard ceiling** (cost-protection, invisible to user).

- **Customer-visible quota** (§4.3 `quota_consumption`, PRD §6) — **deux compteurs mensuels** :
  - Pro : **40 analyses + 40 mémoires / mois** (1 lot = 1 mémoire = 1 unité).
  - Business : **illimité (fair use)**.
  - **Pas d'overage facturé en V1.** Au dépassement Pro : **blocage doux + nudge upgrade** ; jamais de blocage silencieux.
  - **Soft warning à 70 %** du quota mensuel.
- **Internal AI hard ceiling (invisible au client, cost-protection) :**
  - Per-account daily cap: €15 (~15 AO/day at ~€1/AO).
  - Monthly: Pro €100, Business €300 (fair-use safety ceiling).
  - At hard AI cap: pause new analyses, full read access preserved, contact CTA.

Breaches surface as a Coach explainer: *"Limite quotidienne atteinte, reprise à minuit. Besoin d'une augmentation ? Contactez-nous."* (premium-silent tone — never blame the user, never mention cost).

---

## 9. Observability

### 9.1 Error tracking — Sentry

- Frontend (React SDK) + Backend (Python SDK)
- Source maps uploaded on build
- 100% sample rate for errors; 10% perf trace sampling in V1.0
- Tags: `release`, `account_id`, `route`, `skill_name` (if relevant)
- PII scrubbing on: user emails, SIRET, doc names — only `account_id` and `user_id` surface in traces

### 9.2 Structured logs — structlog

Every log line is JSON, includes:

```json
{
  "ts": "2026-05-13T10:14:22.119Z",
  "level": "INFO",
  "request_id": "01J3...",
  "user_id": 42,
  "account_id": 7,
  "route": "/projects/123/analyze",
  "duration_ms": 1284,
  "msg": "skill.invocation.complete",
  "skill_name": "extraction-exigences-administratives",
  "model": "claude-sonnet-4-6",
  "input_tokens": 8412,
  "output_tokens": 1290,
  "cache_read_tokens": 7100,
  "cost_eur": 0.038
}
```

### 9.3 Key metrics

| Metric | Target | Source |
|---|---|---|
| AI cost per AO | ≤ €1.00 | `skill_invocations` aggregation |
| Pipeline success rate | ≥ 99% | structlog |
| Step 3 P95 duration | ≤ 90 s | structlog |
| Step 4 P95 duration | ≤ 180 s | structlog |
| Memo cache-hit ratio | ≥ 80% | Anthropic response headers |
| Sentry critical errors | 0 / 7 days | Sentry |

### 9.4 Uptime monitoring — Better Stack

- HTTPS check every 60 s on `/health` and `/api/health`
- Alert via email + Telegram

---

## 10. Deployment

### 10.1 V1.0 — Single VPS

**Host:** Hostinger KVM2 — Ubuntu 24.04, 6 vCPU, 16 GB RAM, 200 GB SSD.

**Rationale:** V1.0 co-hosts Nginx + FastAPI (4 workers) + Postgres + Redis + Celery worker + Celery beat on a single VPS. Postgres alone consumes ~4 GB (`shared_buffers` + `effective_cache_size`). A single Sonnet 4.6 analysis on a 5 GB ZIP can spike to 3–4 GB transient RAM during PyMuPDF extraction. KVM1 (8 GB) would force serialised processing under load; KVM2 absorbs 2–3 concurrent analyses comfortably. The ~10 €/month delta is negligible vs the migration cost under customer pressure.

**Services on the host:**

```
nginx                     :80, :443  →  reverse proxy, TLS
fastapi (gunicorn+uvicorn):8000      →  4 workers (= CPU count)
postgres                  :5432      →  primary DB
redis                     :6379      →  cache + Celery broker
celery-worker             —          →  scheduled jobs (followups, expiry alerts)
celery-beat               —          →  scheduler
```

**Systemd units** for each service, with `Restart=on-failure`, `EnvironmentFile=/etc/synorix/env`.

### 10.2 TLS

- Let's Encrypt via certbot
- HTTP/2 enabled
- Automatic renewal cron

### 10.3 Backups

**Postgres** — `pg_dump` nightly at 03:00 UTC, encrypted with `age` (XChaCha20) using a public key whose private key is stored offline (1Password vault), pushed to a **different provider** than the primary object storage. Default choice: Backblaze B2 (~$0.005/GB/month, ~5 €/month for 1 TB). 30-day retention with object lock to prevent ransomware overwrite.

**Object storage** (DCE uploads, generated docs) — bucket-level versioning, no manual deletes allowed, 90-day version retention, replication to the same B2 backup account.

**Restoration drill** — automated cron on the 1st of each month: pulls latest encrypted dump, decrypts on a disposable container, runs `pg_restore` against a scratch Postgres, verifies row counts on the 5 largest tables, posts result to Sentry. *A drill that doesn't run = a backup that doesn't exist.*

### 10.4 CI/CD — GitHub Actions

| Stage | Action |
|---|---|
| `lint` | ruff + black + mypy / eslint + prettier |
| `test` | pytest + vitest |
| `build` | docker image for backend, frontend bundle |
| `deploy` | SSH to VPS, run `docker compose pull && docker compose up -d` (or systemd reload) |

Branch protection on `main`: required `lint` + `test` checks; review on PR.

### 10.5 Frontend hosting

**V1.0 — Single-host serving.**

The React SPA is built statically (Vite) and served by Nginx on the same VPS as the API, under the same origin `synorix.tech`. The landing page is a separate static build served from `synorix.tech/`.

**Rationale:**

- Same-origin cookies → no cross-site cookie issues, simpler Clerk session handling, stricter `SameSite=Strict` possible.
- Zero CORS configuration to maintain.
- No Vercel bandwidth bill as traffic grows.
- One deploy target, one TLS cert, one log stream.

Edge / CDN deferred to V1.5, at which point **Cloudflare** in front of the VPS is the most likely choice (Vercel reconsidered then if dynamic edge-rendering becomes useful).

### 10.6 Environment variables (backend)

```
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=...
# Anthropic — two keys, never swapped between envs (see §7.7)
ANTHROPIC_API_KEY_PROD=...          # production only — IP-locked to VPS
ANTHROPIC_API_KEY_DEV=...           # WSL2 dev + CI — capped at €50/month in Console
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
REDIS_URL=redis://localhost:6379/0
SENTRY_DSN=...
COFFRE_FORT_KEK=...                 # 32-byte hex; rotated yearly
# Quotas client (Vision V1 FINALE) — deux compteurs, pas d'overage en V1
QUOTA_PRO_ANALYSES_PER_MONTH=40
QUOTA_PRO_MEMOIRES_PER_MONTH=40
QUOTA_BUSINESS_MODE=fair_use
# Plafond IA interne (invisible client, cost-protection)
COST_GUARD_DAILY_EUR=15.00
COST_GUARD_MONTHLY_PRO_EUR=100.00
COST_GUARD_MONTHLY_BUSINESS_EUR=300.00
# INSEE SIRENE — SIRET validation at sign-up (see §11.4)
INSEE_SIRENE_API_TOKEN=...
INSEE_SIRENE_API_URL=https://api.insee.fr/entreprises/sirene/V3
SIRET_NAF_ALLOWED_PREFIXES=41,42,43   # BTP sector
```

### 10.7 Environment variables (frontend)

```
VITE_API_URL=https://api.synorix.tech
VITE_CLERK_PUBLISHABLE_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=...
VITE_SENTRY_DSN=...
```

---

## 11. MCPs & External Integrations

### 11.1 MCPs

| MCP | Use | Phase | Cost |
|---|---|---|---|
| **NotebookLM MCP** (community jacob-bd) | Skill creation — ingests expert sources, answers `Question NotebookLM` for each skill | Build-time only (not runtime) | Free (NotebookLM is free) |
| **Higgsfield MCP** (`https://mcp.higgsfield.ai/mcp`) | Generate animated visuals + premium video assets for the landing page | Design phase | Per Higgsfield pricing |
| **GitHub MCP** | Repo operations during dev | Always | Free |
| **Stripe MCP** | Billing operations during dev | Always | Free |
| **chrome-devtools MCP** | UI debugging / E2E in dev | Dev only | Free |
| **context7 MCP** | Fresh docs for libraries (React, FastAPI, etc.) during build | Dev only | Free |
| **playwright MCP** | E2E test authoring | Dev only | Free |

### 11.2 Anthropic API

- Production: direct REST + Python SDK
- **Models — exact API identifiers to be confirmed against Anthropic's official models documentation at implementation time** (Anthropic uses date-suffixed identifiers, e.g. `claude-haiku-4-5-20251001`). The Python SDK exposes a `models.list()` endpoint to verify at build time. Model IDs are stored as constants in `backend/synorix/ai/models.py` with a single source of truth per environment.
- Features used: streaming, prompt caching, tool-use (for structured extraction with Pydantic)
- Rate limits: managed via per-account cost guard ([§8.10](#810-cost-guard))

### 11.3 Clerk

- Authentication, sessions, MFA
- **Organisations** for Plan Business multi-seat
- Webhooks for user.created → triggers welcome email

### 11.4 INSEE SIRENE — SIRET validation

Used at sign-up to validate the customer's SIRET, ensure the entity is active, and verify it belongs to the BTP sector (NAF code prefix 41, 42, or 43).

> **Statut d'implémentation (2026-07-01) :** le champ `siret` est **stocké** (modèle `Organization`), mais l'appel Sirene n'est **pas encore câblé** — pré-remplissage profil + validation NAF **à construire** (voir TASKS). Ci-dessous = design cible.

- **Endpoint:** `GET https://api.insee.fr/entreprises/sirene/V3/siret/{siret}`
- **Auth:** OAuth2 bearer token (free, INSEE-issued, 30 req/sec rate limit).
- Used only at **sign-up** and at **SIRET-change events** — not on every request.
- **Failure modes:** API outage → queue the validation, allow sign-up with `siret_validated_at = NULL`, retry job; do **NOT** block sign-up on INSEE outage.
- **Cache:** 24h Redis cache per SIRET to avoid double-fetching during a multi-step sign-up.

### 11.5 Stripe

- Subscriptions (Pro / Business) — **carte uniquement en V1** (`payment_method_types=["card"]`) ; **pas de SEPA** (migration d'entité juridique : les mandats ne migrent pas entre comptes Stripe)
- Provider abstrait (`billing_provider`, `billing_country`) déjà en place — prêt pour la migration d'entité
- Customer Portal for self-service plan management
- Webhooks for `customer.subscription.updated` → updates `accounts.subscription_status`
- **Production keys** activated before V1.0 ships

### 11.6 NotebookLM strategy

NotebookLM is the **single source of truth** for BTP métier knowledge inside Synorix. Each skill in `SKILLS_REGISTRY_V2.md` has:

- A precise question to ask NotebookLM
- A list of sources to ingest in the NotebookLM notebook before asking

Sources NotebookLM should accumulate over time across notebooks:

| Notebook | Purpose |
|---|---|
| `synorix-marches-publics-base` | Code de la commande publique, CCAG-T 2021, guides DAJ |
| `synorix-dtu-btp` | All NF DTU per corps de métier |
| `synorix-jurisprudence` | Tribunal-administratif decisions on AO disputes |
| `synorix-memoires-gagnants` | 50+ winning memos, anonymised (collected from Adil, Ozcan, ecosystem) |
| `synorix-corps-de-metier-facade` | Façade specialised notebook |
| (... one notebook per corps de métier ...) | |
| `synorix-ux-saas-b2b` | UX research on premium B2B SaaS |
| `synorix-coaching-patterns` | Coaching / mentorship patterns for B2B tools |

When a skill is built, Claude Code:

1. Identifies which notebooks to query.
2. Asks the specific question from the registry.
3. Drafts the skill's system prompt from the answer.
4. Stores the prompt under `backend/skills/prompts/<skill_name>.md`, version-controlled.

The expert knowledge is **baked in at build time**, not retrieved at runtime — runtime stays fast, deterministic, and cheap.

---

## 12. Changelog

### 2.5 — 2026-07-01 (alignement Vision V1 FINALE)

- **Métadonnées** — v2.5, alignée sur PRD v3.0 (2026-07-01).
- **§3.1 / §3.2** — Opus 4.7 = réécriture ciblée **+ fallback** (retrait du Synorix Score : désormais **déterministe 0 €**). Haiku 4.5 = routing **+ reformulation texte libre du profil**. Étape 5 recentrée déterministe. Pricing €299 → €349, quota 40.
- **§3.7 NEW** — Profil mémoire vivant (couche stable BDD lue au moment T, overrides locaux par mémoire, reformulation Haiku, cible ≤ €1 puis < €0,50).
- **§4.3** — `ao_quota_consumption` → **`quota_consumption`** : deux compteurs (analyse / mémoire), unité 1 lot = 1 mémoire, **overage retiré**. `memos.profile_overrides` ajouté. Tables `jurisprudence` / `groupements` / `engagements_rse` marquées **V1.5 (déclassées)**.
- **§8.10 / §10.6** — Cost guard : quota client **40 analyses + 40 mémoires** (Pro) / **fair-use** (Business), **pas d'overage** (dépassement → upgrade). Vars quota ajoutées.
- **§11.4** — INSEE SIRENE : statut « à construire » explicité (champ stocké, appel non câblé). **§11.5** — Stripe **carte uniquement en V1**.

### 2.4 — 2026-05-18

Integration of 8 validated NotebookLM notebooks (193 sources) — see [NOTEBOOKS_REGISTRY.md](./NOTEBOOKS_REGISTRY.md).

- **§4 `chantier_references`** — Enriched: `photos_path TEXT[]`, `attestation_bonne_execution_path`, `fiche_dechets_path`, `performance_thermique_kWh`. Original `photos JSONB` kept for backward compatibility.
- **§4 NEW `jurisprudence`** — Reference table populated from N6 at build time; read-only at runtime.
- **§4 NEW `groupements`** — Supports Skill #89 (Mode GME, PRD §3.7.1).
- **§4 NEW `engagements_rse`** — Supports Skill #92 (RSE 2026, PRD §3.7.2).
- **§6.6** — NEW. Skill generation strategy (NotebookLM static snapshot vs live RAG); refresh process; V2 Obsidian-watch ambition.

### 2.3 — 2026-05-13

- **§4** — Projects table: `pipeline_progress JSONB` column for live progress state and SSE replay.
- **§5.5** — Live progress events documented (SSE channel `/api/projects/{id}/progress`, 5 event types, JSONB storage for replay, WSL2 dev note).

### 2.2 — 2026-05-13

- **§4** — Projects table: 8-status enum (French codes) + `archived` flag + partial index on active projects.
- **§4** — Companies table: SIRET `NOT NULL UNIQUE` + `naf_code` + `siret_validated_at`.
- **§4** — New `ao_quota_consumption` table for AO counting & overage billing.
- **§8.10** — Cost guard separated into customer-visible quota (30/120 AO) vs internal AI hard ceiling (€100/€300).
- **§10.6** — `INSEE_SIRENE_API_TOKEN` + `INSEE_SIRENE_API_URL` + `SIRET_NAF_ALLOWED_PREFIXES` env vars added.
- **§11.4** — INSEE SIRENE integration documented (SIRET validation at sign-up); Stripe pushed to §11.5, NotebookLM strategy to §11.6.

### 2.1 — 2026-05-13

- **7.7** — Split Anthropic API key into PROD (IP-locked) and DEV (capped) for WSL2 dev.
- **7.7** — Added Stripe webhook IP allowlist at Nginx level.
- **10.1** — Upgraded V1.0 host from Hostinger KVM1 to KVM2 (6 vCPU / 16 GB RAM).
- **10.5** — Consolidated frontend onto the VPS (Vercel deferred to V1.5).
- **10.3** — Rewrote backup strategy: off-account provider (Backblaze B2), `age` encryption, automated monthly restoration drill.
- **8.10** — Daily cost guard raised from €5 to €15 to accommodate clustered AO deadlines; soft warning at 70%, Coach explainer on block.
- **11.2** — Model IDs flagged as implementation-time verifiable via SDK `models.list()`.

### 2.0 — 2026-05-13

- Initial release. Multi-model architecture, 85 modular skills, NotebookLM build-time integration.

---

*End of Architecture — Synorix v2.4*
