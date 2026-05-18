# PRD — Synorix v2.0

**Product Requirements Document — Official Specification**

| Field | Value |
|---|---|
| Document version | 2.4 |
| Status | Active — drives the v2.0 refactor (`refactor-v2` branch) |
| Owner | Mohamed (Founder) |
| Audience | Engineering, Design, future contributors, Claude Code |
| Last updated | 2026-05-13 |
| Supersedes | `PRD_SAAS_AO_BTP.md` (v1, MVP phase) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Personas and Use Cases](#2-personas-and-use-cases)
3. [Pipeline AO — 6 Steps](#3-pipeline-ao--6-steps)
   - 3.1. [Step 1 — DCE Upload](#31-step-1--dce-upload)
   - 3.2. [Step 2 — Lot Detection](#32-step-2--lot-detection)
   - 3.3. [Step 3 — AI Analysis](#33-step-3--ai-analysis)
   - 3.4. [Step 4 — Technical Memorandum](#34-step-4--technical-memorandum-the-star)
   - 3.5. [Step 5 — Final Verification](#35-step-5--final-verification)
   - 3.6. [Step 6 — Export & Submission](#36-step-6--export--submission)
4. [Sidebar — 5 Permanent Sections](#4-sidebar--5-permanent-sections)
5. [Synorix Coach — Level 3 Chatbot](#5-synorix-coach--level-3-chatbot)
6. [Business Model & Plans](#6-business-model--plans)
7. [Tone & Product Communication Rules](#7-tone--product-communication-rules)
8. [V2.0 Success Criteria](#8-v20-success-criteria)
9. [Roadmap V1 / V1.5 / V2.5](#9-roadmap)
10. [Appendices — Reference Materials](#10-appendices)
11. [Changelog](#11-changelog)

---

## 1. Executive Summary

### 1.1 Vision

Synorix becomes the **global reference SaaS for public-tender response in the BTP industry**, starting with France. It compresses what currently takes a small construction firm 3 to 7 days of expert work into a guided pipeline that delivers a depositable bid in under one afternoon — at a quality level a senior bid manager would sign off on.

### 1.2 Mission

> *Transform the public-tender response process for French BTP companies into something 5× faster and accessible to beginners, through an AI pipeline that walks the user step by step from a raw DCE zip to a deposit-ready dossier.*

### 1.3 Why Now

The French public-procurement market for BTP is large, fragmented, and dominated by either:

- **Expensive consultants** (€2,000–€8,000 per response, outsourced)
- **Manual SaaS tools** (SPIGAO, Intescia) — administrative-questionnaire helpers that do **not** generate technical memoranda

Synorix's wedge is the **automated generation of personalised, deposit-grade technical memoranda** (~20+ pages), grounded in the customer's own profile, references, and library — a category nobody else serves today.

### 1.4 What Makes Synorix Different

| Dimension | SPIGAO / Intescia | Consultants | **Synorix v2.0** |
|---|---|---|---|
| DCE analysis | Manual questionnaires | Manual | **AI-driven extraction with source highlighting** |
| Technical memo | ❌ Not generated | Manual | ✅ **Generated, personalised, editable** |
| Pricing per response | — | €2k–€8k | €299–€499 **per month, unlimited responses** |
| Onboarding | Heavy | N/A | **Progressive — onboarded while working** |
| Coaching | None | Human consultant | **Synorix Coach** chatbot (BTP-trained) |
| Vendor-side personalisation | Generic | Personalised | **Auto-pulled from sidebar (company / refs / library)** |

### 1.5 Product Promise

> **"Synorix is the AI that turns a public-tender response into a 5× faster process, accessible even to beginners, through step-by-step guidance."**

### 1.6 V2.0 Scope at a Glance

- **6-step Pipeline AO** — Upload → Lots → AI Analysis → Memo → Verification → Export
- **5-section persistent Sidebar** — Mes AO / Mon entreprise / Mes références / Ma bibliothèque mémoire / Mon coffre-fort
- **Synorix Coach** — level-3 strategic chatbot
- **86 modular skills V1** — each grounded in real BTP expertise from 8 validated NotebookLM notebooks (193 curated sources) <!-- v2.1 - notebooks 17/5/26 -->
- **Multi-model AI stack** — Haiku 4.5 / Sonnet 4.6 / Opus 4.7 — target cost **~€0.77 per complete tender response**
- **Two plans** — Pro (€299/mo, 1 seat) and Business (€499/mo, 5 seats)

### 1.7 Differentiators — Notebook-validated <!-- v2.1 - notebooks 17/5/26 -->

The following 15 product differentiators are grounded in the 8 NotebookLM notebooks created on 2026-05-17 (see [NOTEBOOKS_REGISTRY.md](./NOTEBOOKS_REGISTRY.md)). Each is backed by a specific jurisprudence or article of the Code de la commande publique (CCP) — no Synorix competitor surfaces this level of legal grounding.

| # | Differentiator | Legal / source anchor | Skill |
|---|---|---|---|
| D1 | Citation jurisprudence 2024-2026 dans chaque analyse | CE 474772, TA Montpellier 2405722, CAA Nantes pondération 90/10 | all extraction skills |
| D2 | Validation ZIP avant dépôt (corruption = rejet irrégularisable) | TA Montpellier 29/10/2024 n°2405722 | Skill #74 |
| D3 | Vérification signature individuelle des pièces vs signature ZIP | TA Toulouse 9/3/2011 n°1100792 | Skill #69 |
| D4 | Diligence prouvable horodatée du candidat | CE 2/10/2025 SFRS n°501204 | Skill #72 |
| D5 | Copie de sauvegarde R2132-11 CCP générée systématiquement | R2132-11 CCP | Skill #71 |
| D6 | Simulateur 3 formules prix DAJ (linéaire / inversement proportionnelle / variante) | Guides DAJ | `simulateur-prix-DAJ` — **PENDING_ID** (collision flagged, see [SKILLS_REGISTRY V1 Differentiators §Collision Flag](./SKILLS_REGISTRY_V2.md)) |
| D7 | Calculateur OAB temps réel (méthode double moyenne) | L2152-5, R2152-3 à R2152-5 CCP | **Skill #95** (STUB) |
| D8 | RAO Prédictif (simulation rapport d'analyse de l'acheteur) | R2152-6 à R2152-8 CCP | `RAO-predictif` — **PENDING_ID** |
| D9 | Détection contradictions DCE | CE 18/7/2024 NAYMA n°492938 (devoir de vigilance du candidat) | Skill #16 |
| D10 | Détection critères disproportionnés (capacité non liée / proportionnée) | L2142-1 CCP | `detection-criteres-disproportionnes` — **PENDING_ID** |
| D11 | Conseil recours après éviction (3 référés) | L551 CJA + CE 4/4/2014 Tarn-et-Garonne + TA Nantes 19/5/2025 Verchéenne n°2506407 | `conseil-recours-eviction` — **PENDING_ID** |
| D12 | **Mode Groupement GME** (cotraitance conjoint / solidaire) | R2142-20 CCP | **Skill #89** (NEW V1) |
| D13 | **Auto-suggestions RSE 2026** (Loi Climat 22/8/2026) | Loi Climat 22/8/2026 | **Skill #92** (NEW V1) |
| D14 | Justification OAB auto-générée (réponse 21 jours) | L2152-5 + R2152-3 à R2152-5 CCP | Skill #84 |
| D15 | Détection RGE Qualibat 8632/8633 expirant 30/9/2026 → migration Certibat | Référentiel RGE 2025 (transition Certibat) | Skill #2 |

**Why this matters commercially:** Synorix is the only SaaS that lets a small BTP firm cite Conseil d'État rulings in their bid — turning legal sophistication into a competitive advantage they couldn't buy from a consultant for less than several thousand euros per AO.

---

## 2. Personas and Use Cases

### 2.1 Persona A — "The Pro"

| Attribute | Value |
|---|---|
| Role | Engineering office (BE), construction manager, bid manager |
| Company size | 20–200 employees |
| Frequency | Responds to 5–15 tenders per month |
| Sophistication | High — knows DCE structure, CCAG-T, scoring criteria |
| Primary pain | **Time spent**, not lack of knowledge |
| Wants from Synorix | Speed, expert-grade output, no hand-holding, full editorial control |
| Behaviour | Will jump straight to results, edit aggressively, judge by output quality |

**Key expectation:** Synorix must keep up with their expertise — no infantilising prompts, no generic boilerplate, every detail must be defensible to an evaluator.

### 2.2 Persona B — "The Ambitious Beginner"

| Attribute | Value |
|---|---|
| Role | PME owner, often craftsman-founder |
| Company size | 5–15 employees |
| Frequency | 1–3 tenders per month, currently losing most |
| Sophistication | Low to medium — feels overwhelmed by DCE volume and admin terminology |
| Primary pain | **Doesn't know where to start**, fears rejection on formality |
| Wants from Synorix | Step-by-step accompaniment, validation, confidence |
| Behaviour | Will read every prompt, follow the flow, panic if anything looks "missing" |

**Key expectation:** Synorix must never expose the beginner to anxiety-inducing language ("missing", "incomplete") — see [Section 7](#7-tone--product-communication-rules).

### 2.3 Why a Single Mode (not Pro/Beginner toggle)

The team chose **not** to ship a pro/beginner mode toggle. Reasoning:

- A toggle forces the user to self-identify, which the beginner often gets wrong (under-rating themselves).
- The Pro is annoyed by simplified UI; the Beginner is paralysed by Pro UI. A toggle ships the worst of both.
- The **Synorix Coach** chatbot (Section 5) adapts conversationally per user — context-aware, not mode-locked.
- The pipeline UI itself is the same for everyone; it's *the help layer* that flexes.

### 2.4 Reference Use Cases

#### UC-1 — The Pro: "I want to bid on lot 3 of a Paris school renovation"

1. Drops the DCE ZIP into Synorix.
2. Selects only lot 3 (façade) from the auto-detected list.
3. Reviews the AI analysis tab — confirms the 12 admin pieces, 4 offer documents, and 28 technical requirements are correctly extracted.
4. Verifies the coffre-fort auto-link picked the right Kbis (< 3 months) and assurance décennale. Uploads a fresh attestation URSSAF directly into the coffre-fort via the "à téléverser" CTA.
5. Opens the DPGF in Synorix's spreadsheet editor — fills in 23 lines (quantities pre-filled from CCTP extraction). Total auto-computed.
6. Reviews the AE — downloads it for offline signature using the company's existing process, re-uploads the signed PDF (eIDAS-compliant in-app signature deferred to V1.5).
7. Triggers memo generation with **Détaillé / Très technique** settings.
8. Edits the methodology section using "Réécrire avec instructions" — strengthens the environmental angle.
9. Runs Step 5 verification — Synorix Score 87/100. Fixes 1 flagged item (missing SOGED reference).
10. Exports ZIP — deposits on PLACE via the deep-link.

**Total wall time:** ~2 hours instead of ~3 days.

#### UC-2 — The Beginner: "I just received my first DCE"

1. Drops the ZIP. Synorix shows a friendly upload-progress and an *estimation of analysis time*.
2. Synorix Coach surfaces a discreet suggestion: *"Voulez-vous que je vous guide pour cette première candidature ?"*
3. Lot detection runs. The user is told plainly: *"Choisissez vos lots pour lancer l'analyse"*.
4. Step 3 surfaces the **administrative pieces** tab first — Synorix has already linked anything the user previously uploaded to the coffre-fort.
5. Each missing piece presents a positive call-to-action *"Téléverser pour le coffre-fort"* — never *"manquant"*.
6. The AE (Acte d'Engagement) is downloaded for signature via the company's existing process and re-uploaded as a signed PDF (in-app eIDAS-compliant signature ships in V1.5).
7. Step 4 récapitulatif clearly shows which company information is being reused.
8. Memo generated with **Standard / Vulgarisé** settings.
9. Step 5 returns a Synorix Score. Suggestions are written as *positive improvement options*, not faults.
10. User exports — Coach offers a 1-minute tutorial for PLACE.

---

## 3. Pipeline AO — 6 Steps

This is the core user flow. Every step is **a dedicated page**, with state persisted server-side so the user can leave and resume freely. All 6 steps live under one `Project` entity (one AO = one Project). Multiple projects run in parallel from the Dashboard.

### 3.1 Step 1 — DCE Upload

#### 3.1.1 Product Need

A French DCE typically arrives as a ZIP file with a mix of:

- Administrative documents (RC, AE, CCAP, DC1/DC2/AE templates, attestations templates)
- Technical documents (CCTP, plans, annexes)
- Financial documents (DPGF, BPU, DQE)
- Plates (plans, photos, surveys) sometimes nested in 2–4 levels of subfolders
- Mixed encodings (CP437 from old Windows zips, Latin-1, UTF-8) and broken filename characters
- Files up to several GB total

Synorix must accept all of this without friction.

#### 3.1.2 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-UPL-01 | Single-file ZIP upload, up to **5 GB** |
| FR-UPL-02 | Recursive extraction (subfolders preserved) |
| FR-UPL-03 | Mixed-encoding filename handling (CP437 / Latin-1 / UTF-8) |
| FR-UPL-04 | Per-document type detection (RC, CCAP, CCTP, DPGF, etc.) — types list **deferred to NotebookLM skill `recherche-types-documents`** |
| FR-UPL-05 | Duplicate detection (hash + filename heuristics) and version detection (v1/v2, "annule et remplace") |
| FR-UPL-06 | Mark any document that fails text extraction as **"Document illisible — à vérifier !"** with explicit user-visible flag |
| FR-UPL-07 | Once Step 3 launches, display real-time pipeline progress with named-step checkpoints (no percentage bar) — see §3.3.7 |
| FR-UPL-08 | Detect deposit deadline (date + time) — extraction **deferred to skill `detection-date-limite`** |
| FR-UPL-09 | Detect deposit platform (PLACE, AWS, profil acheteur) — **deferred to skill `detection-plateforme-depot`** |
| FR-UPL-10 | Detect mandatory site-visit requirement — **deferred to skill `detection-visite-obligatoire`** |
| FR-UPL-11 | Multiple projects run in parallel from Dashboard with independent upload progress |

#### 3.1.3 UX Specification

Page layout (top to bottom):

```
┌────────────────────────────────────────────────────────────────────┐
│  🚨 ALERTES — Date limite : 17/06/2026 à 12h00 (Heure de Paris)    │
│              Dépôt sur : Plateforme PLACE                           │
│              Visite obligatoire : 03/06/2026 à 14h00 — sur site     │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  📊 [1 RC] [1 CCAP] [1 CCTP] [15 plans] [1 DPGF] [3 annexes]       │
│   ← clickable tiles, filter the list below                          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  📄 Liste des documents                                              │
│  ✅ RC_marche_2026_xx.pdf            [Voir]   ✓ Extrait              │
│  ✅ CCAP.pdf                          [Voir]   ✓ Extrait              │
│  ⚠️  Plan_façade_v2.dwg              [Voir]   ⚠ Document illisible   │
│  📑 CCTP_lot3.pdf                     [Voir]   ✓ Extrait              │
│  🔁 RC.pdf (doublon ancien)            [Voir]   • Doublon détecté    │
└────────────────────────────────────────────────────────────────────┘

  [← Modifier le ZIP]              [Continuer → Détection des lots]
```

**Status iconography per document:**

| State | Icon | Treatment |
|---|---|---|
| Extracted OK | ✓ green | normal |
| Unreadable | ⚠ red | flagged at top, retained in list, user can preview anyway |
| Duplicate detected | 🔁 grey | secondary opacity, kept for traceability |
| New version detected | 🆕 orange | both kept, old marked "annulé" if "annule et remplace" found |

**Live progress display (during Step 3):**

Once the user has selected lots and launched the analysis, Synorix displays a named-step checkpoint panel (no percentage bar — see §3.3.7 for rationale and full specification).

#### 3.1.4 Edge Cases

- **ZIP > 5 GB** → reject upfront with explicit message; suggest splitting (V1.5 may raise the limit).
- **Encrypted / password-protected ZIP** → reject with explicit message.
- **Zero readable text in the entire DCE** → escalate to Coach, surface as critical alert.
- **Truncated upload (connection drop)** → resume not supported in V1; full re-upload required (V1.5 adds tus-based resume).

#### 3.1.5 Skills Mobilised (5)

See [SKILLS_REGISTRY_V2.md §Step 1](./SKILLS_REGISTRY_V2.md) — `recherche-types-documents`, `detection-date-limite`, `detection-doublons-versions`, `detection-plateforme-depot`, `detection-visite-obligatoire`.

---

### 3.2 Step 2 — Lot Detection

#### 3.2.1 Product Need

French BTP tenders are organised in **lots** (e.g., lot 1 — VRD, lot 2 — gros œuvre, lot 3 — façade). A respondent picks one or more lots; each chosen lot produces its own technical memo. Synorix must:

- Detect all lots automatically.
- Cross-validate using **two independent sources**: the RC and the DPGF.
- Allow multi-select.
- Allow the user to **add a missing lot manually** (rare, for ill-structured DCEs).
- Surface estimated lot amount only **if reliably extractable**.

#### 3.2.2 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-LOT-01 | Auto-detect lots from RC (textual list) and DPGF (line-item structure) |
| FR-LOT-02 | Internal cross-validation confidence score — **NOT shown to user** |
| FR-LOT-03 | If RC and DPGF disagree, flag internally and surface a soft warning **only if the disagreement is material** — detection logic deferred to skill `detection-incoherences-lots` |
| FR-LOT-04 | Per-lot card: number, label, corps de métier, optional estimated amount |
| FR-LOT-05 | Multi-select with checkboxes; one memo will be generated per selected lot |
| FR-LOT-06 | Discreet `+ Ajouter un lot manuellement` button at the bottom |
| FR-LOT-07 | Detect corps de métier (façade, GO, élec, CVC, plomberie, peinture, etc.) — list deferred to skill `detection-corps-de-metier-lot` |
| FR-LOT-08 | Extract précise lot description from CCTP — deferred to skill `extraction-description-lot` |

#### 3.2.3 UX Specification

```
┌────────────────────────────────────────────────────────────────────┐
│  Choisissez vos lots pour lancer l'analyse                          │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ ☐ Lot 01 — VRD       │  │ ☐ Lot 02 — Gros œuvre│                 │
│  │ Corps : VRD          │  │ Corps : GO            │                 │
│  │ Estim. : 250 000 €   │  │ Estim. : —            │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ ☑ Lot 03 — Façade    │  │ ☐ Lot 04 — CVC        │                 │
│  │ Corps : Façade / ITE │  │ Corps : CVC           │                 │
│  │ Estim. : 480 000 €   │  │ Estim. : 320 000 €   │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                      │
│  [+ Ajouter un lot manuellement]   (discreet, bottom-aligned)        │
│                                                                      │
│             [Continuer l'analyse →]                                  │
└────────────────────────────────────────────────────────────────────┘
```

**Design rules:**

- **No confidence score** ever rendered (this was a deliberate decision — exposing confidence to the user undermines premium-silent positioning, see Section 7).
- Cards width-uniform; selected state = subtle blue border, *not* a heavy fill.
- Estimated amount line **omitted entirely** (not "—" placeholder) when unavailable.

#### 3.2.4 Skills Mobilised (4)

`recherche-lots`, `detection-corps-de-metier-lot`, `extraction-description-lot`, `detection-incoherences-lots`.

---

### 3.3 Step 3 — AI Analysis

> **The most strategic step in Synorix.** Everything downstream depends on getting this right.

#### 3.3.1 Product Need

Transform a raw DCE into a concrete, actionable plan:

- **Extract every requirement** (administrative / offer pieces / technical).
- **Identify traps and critical alerts** (caution amount, mandatory visit, exotic clauses).
- **Auto-link to the coffre-fort** — if the user already has a valid Kbis, the line is green; if not, surface a positive upload CTA.
- **Identify documents to be filled by the company** (DPGF, BPU, DC1, DC2, AE).
- **Enable in-place editing** of those documents — never force the user into external Excel or Word.

This is the page where most of the AI cost is spent (~€0.40 / response, Sonnet 4.6).

#### 3.3.2 UX Architecture — Three Zones

```
╔════════════════════════════════════════════════════════════════════╗
║  ZONE 1 — DCE KEY INFO BANNER (top, sticky)                         ║
║                                                                      ║
║  ⏰ 17/06/2026 à 12h00      🏗 Réhabilitation école primaire X       ║
║  🎯 Critères : Prix 40% / Valeur technique 50% / Délai 10%          ║
║  🚶 Visite obligatoire : 03/06/2026 14h00                            ║
║  💰 Cautionnement : 5% du montant HT      🔒 RG : 5%                 ║
║  🚨 3 pièges détectés     🧮 [Calculatrice retenue / pénalités]     ║
╚════════════════════════════════════════════════════════════════════╝

┌───────────────────────┬──────────────────────┬──────────────────────┐
│ ZONE 2 — TABS (3 cat) │                      │                      │
│                                                                      │
│  ┃Exigences admin (12)┃   Pièces de l'offre (4)   Exigences tech (28)
│  ━━━━━━━━━━━━━━━━━━━━                                                │
│  active tab grows / others shrink — only one tab content shows below │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ZONE 3 — REQUIREMENT DETAIL (filtered by active tab)                  │
│                                                                        │
│  📍 RC page 4    🟦 (admin)                                           │
│  « Le candidat fournira un extrait Kbis de moins de 3 mois. »         │
│  Coffre-fort : ✅ Kbis (07/04/2026) — valide                         │
│  [Visualiser] [Complété ✓]                                            │
│                                                                        │
│  📍 CCAP page 12  🟦 (admin)                                          │
│  « Attestation URSSAF de moins de 6 mois. »                           │
│  Coffre-fort : ⚠ Aucune correspondance                               │
│  [Téléverser pour le coffre-fort →]                                   │
│                                                                        │
│  📍 RC page 7    🟥 (piège)                                           │
│  « Le marché impose un délai global de 90 jours fermes,               │
│    sans intempéries. »                                                │
│  [À compléter] [Détail du piège]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.3.3 Tab Behaviour

The 3 tabs are visually side by side. When the user clicks one:

- The **active** tab grows: larger typography, bolder weight, subtle background.
- The **inactive** tabs shrink: smaller typography, muted colour, still clickable.
- The content area below the tabs **swaps entirely** to that tab's requirement list.

```
[Exigences admin (12)]   Pièces de l'offre (4)   Exigences tech (28)
─────────────────────                                              
                ▲ active                                            
```

#### 3.3.4 Source Click → Highlighted PDF

Every requirement card has a **clickable source citation** (e.g., `📍 RC page 4`). Clicking it opens the original PDF, scrolls to the exact page, and **highlights the full requirement sentence in yellow** — not just the beginning, the entire sentence/clause.

| Category | Highlight colour |
|---|---|
| Admin | 🟦 Blue |
| Offer pieces | 🟧 Orange |
| Technical | 🟩 Green |
| Trap / critical | 🟥 Red |

> **Exact highlighting is non-trivial.** PDFs may contain mixed character encoding, line breaks, hyphenation, multi-column layouts. The full-sentence extraction logic is deferred to skill `surlignage-exigence-complete`.

#### 3.3.5 Coffre-fort Auto-Link

For every administrative requirement, Synorix attempts to match an existing item from the user's coffre-fort:

| State | Card colour | Action |
|---|---|---|
| Match + valid | green | `[Complété ✓]` |
| Match + expired or expiring soon | amber | `[Renouveler]` |
| No match | neutral | `[Téléverser pour le coffre-fort →]` (positive framing — never "missing") |

Validity rules (e.g., "Kbis < 3 months", "URSSAF < 6 months") are **not invented here** — they are deferred to skill `validation-piece-coffre-fort`.

#### 3.3.6 Native Document Editing

Synorix must **never** ask the user to download an Excel file, edit it, and re-upload. The platform feels broken the moment it does. Therefore:

| DCE document type | In-Synorix editing experience |
|---|---|
| DPGF / BPU / DQE | Embedded spreadsheet (Google-Sheets-style), auto-save, real-time totals HT / TTC |
| DC1 / DC2 / AE (Cerfa PDFs) | UI form → server-side PDF generation, pre-filled from sidebar "Mon entreprise" |
| Free-form attestation templates | Rich-text editor with pre-filled fields |

Per-cell editing on DPGF must remember the user's last cell on tab switch.

#### 3.3.7 Live Progress Display

Synorix never displays a percentage progress bar during pipeline execution. Two reasons:

1. **Honesty.** AI-driven analysis has high variance per document. A predicted percentage is always wrong; "70% in 4 minutes" followed by "70% in 6 minutes" actively erodes trust.
2. **Premium-silent.** A percentage bar that jumps backward or stalls looks amateurish — incompatible with the positioning defined in §7.1.

**The replacement: named-step checkpoints with live results.**

The user sees a vertical list of steps (each prefixed by ✅ done, ⏳ current, or ⏸ pending). Done steps display a one-line summary of their result (e.g., *"Classification des documents → 3 RC, 1 CCAP, 12 plans, 1 DPGF, 8 annexes"*). The current step shows sub-checkpoints as they emerge from the skill (e.g., *"5 lots identifiés"*, *"Réconciliation RC ↔ DPGF en cours..."*). Pending steps are greyed without any time estimate. Below the list, the Coach surfaces a calm, premium-silent message during long-running steps.

**Rules:**

- ✅ Done step: shows the result count or summary inline; timestamp available on hover.
- ⏳ Current step: shows sub-checkpoints as they emerge from the skill (e.g., *"5 lots identifiés"*, *"Réconciliation..."*).
- ⏸ Pending step: greyed, no time estimate.
- **Coach explainer** surfaces automatically on any step running longer than 60 seconds, with a calm, premium-silent message that humanises the wait — never an apology, never a time estimate.
- Results stream into the right-side panel **as they are produced** (skeleton screens fill in progressively).

**Technical realisation:** the backend emits Server-Sent Events (SSE) at every real checkpoint of every skill invocation. The frontend listens and updates the UI on event arrival only — no animated interpolation, no client-side guessing. See ARCHITECTURE §5 for the event schema.

#### 3.3.8 Auto-Completion Detection

The AI continuously inspects the state of in-Synorix-edited documents. When a document is **detectably complete** (signature placeholder filled, every required line populated, totals match), the requirement card flips to `[Complété ✓]` **without a manual click**. Detection rules deferred to skill `validation-completude-document`.

#### 3.3.9 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-ANA-01 | Extract administrative requirements with source citation |
| FR-ANA-02 | Extract offer pieces with source citation |
| FR-ANA-03 | Extract technical requirements with source citation |
| FR-ANA-04 | Extract jugement criteria & weights (banner) |
| FR-ANA-05 | Detect mandatory site visit (banner) |
| FR-ANA-06 | Detect caution & financial guarantees (banner) |
| FR-ANA-07 | Detect traps / léonin clauses (banner counter + red cards) |
| FR-ANA-08 | Detect inconsistencies between DCE documents |
| FR-ANA-09 | Auto-link coffre-fort items per requirement |
| FR-ANA-10 | Full-sentence highlight on PDF source click |
| FR-ANA-11 | Detect which DCE docs must be filled by company |
| FR-ANA-12 | Native editing for DPGF / Cerfa / templates |
| FR-ANA-13 | Auto-detect completion of edited documents |
| FR-ANA-14 | Calculator for retenue de garantie + pénalités |

#### 3.3.10 Skills Mobilised (26)

See [SKILLS_REGISTRY_V2.md §Step 3](./SKILLS_REGISTRY_V2.md) — 4 extraction skills, 4 alert-detection skills, 5 linkage skills, 2 synthesis skills, 10 corps-de-métier experts, 1 piece-validation skill.

---

### 3.4 Step 4 — Technical Memorandum (THE STAR)

> **The differentiator vs SPIGAO / Intescia. This is what people pay €299–€499 / month for.**

#### 3.4.1 Product Need — and the Non-Negotiable

The technical memo must be **personalised to the company**. Never generic. The memo:

- Pulls **automatically** from sidebar data — `Mon entreprise`, `Mes références`, `Ma bibliothèque mémoire`, `Mon coffre-fort`.
- Reflects the company's real voice, real history, real references.
- Adapts to the specific lot / corps de métier of the AO.

> **🔒 Non-negotiable:** If Synorix generates without connecting to company info, **the company churns**. Mohamed has stated this is the line in the sand.

#### 3.4.2 Knowledge Architecture

```
                 ┌─────────────────────────────────┐
                 │  STEP 4 — MEMO GENERATION       │
                 └─────────────────────────────────┘
                       ▲       ▲       ▲       ▲
                       │       │       │       │
   ┌───────────────────┘       │       │       └────────────────────┐
   │                           │       │                            │
┌──────────────┐   ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐
│ Mon          │   │ Mes références  │  │ Ma bibliothèque  │  │ Coffre-fort │
│ entreprise   │   │ chantiers       │  │ mémoire          │  │ (annexes)   │
│  • presentation  │   │  • sélection auto│ │  • phrases types │  │ • attest.  │
│  • effectifs │   │  • par pertinence│  │  • mémoires      │  │ • RC, RIB  │
│  • CA / certif.  │   │                 │  │    importés      │  │            │
└──────────────┘   └──────────────────┘  └──────────────────┘  └────────────┘
```

#### 3.4.3 Hybrid Memo Structure

**Always present:**

- **PRÉAMBULE** (~1 page)
- **PARTIE A — Présentation entreprise** (~5–7 pages)
- **PARTIE B — Présentation de la prestation** (~4–6 pages)
- **PARTIE C — Méthodologie d'exécution** (~5–8 pages) — *the most heavily scored section*

**Conditionally added (only if DCE asks):**

- PARTIE D — Moyens humains et matériels dédiés
- PARTIE E — Planning prévisionnel détaillé
- PARTIE F — Sécurité & prévention (PPSPS)
- PARTIE G — Environnement & SOGED
- PARTIE H — Qualité (PAQ)
- PARTIE I — Innovation / RSE
- ANNEXES — attestations, CV, photos, etc.

The exact section weights and "must-have vs nice-to-have" tagging is **deferred to skill `recherche-criteres-evaluation-memoire`**.

#### 3.4.4 UX — Pre-Generation Récapitulatif

```
╔════════════════════════════════════════════════════════════════════╗
║  Avant de générer votre mémoire technique                           ║
╚════════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────┐
│ 📋 Informations reprises de votre entreprise          [Modifier]    │
│ ✅ Raison sociale, SIRET, adresse                                   │
│ ✅ Effectifs et qualifications                                      │
│ ✅ CA des 3 derniers exercices                                      │
│ ✅ Assurances + Certifications                                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 📂 Références chantiers sélectionnées                               │
│ Sélection automatique des plus pertinentes pour cet AO              │
│ • Réhabilitation école Jean Moulin — 2024 — 420 k€ HT               │
│ • ITE résidence Les Lilas — 2023 — 580 k€ HT                        │
│ • Façade lycée Voltaire — 2024 — 920 k€ HT                          │
│ [Voir toutes les références] [Modifier la sélection]                │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 🎯 Options à ajouter à votre mémoire                                │
│                                                                      │
│  ☐ Organigramme dédié au chantier                                   │
│  ☐ Planning Gantt prévisionnel                                      │
│  ☐ Photos de chantiers similaires                                   │
│  ☐ PPSPS spécifique                                                 │
│  ☐ SOGED (gestion des déchets)                                      │
│  ☐ PAQ (Plan d'Assurance Qualité)                                   │
│  ☐ Note d'innovation                                                │
│  ☐ Note RSE                                                          │
│  ☐ Plan d'installation de chantier                                  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ ⚙ Paramètres de génération                                          │
│ Longueur :   ( ) Court  (•) Standard  ( ) Détaillé                  │
│ Ton :        ( ) Professionnel  (•) Très formel  ( ) Engageant      │
│ Technique :  ( ) Vulgarisé  (•) Standard  ( ) Très technique        │
└────────────────────────────────────────────────────────────────────┘

              [ ✨  GÉNÉRER LE MÉMOIRE TECHNIQUE ]
```

#### 3.4.5 Critical Wording Rules (Options Block)

The options block lists **add-ons**. It must NEVER use the words *manquant / absent / incomplet / défaillant*. Every line is framed as a positive add:

| ❌ Forbidden | ✅ Required |
|---|---|
| "Organigramme manquant" | "Ajouter un organigramme dédié au chantier" |
| "Aucun PPSPS détecté" | "Ajouter un PPSPS spécifique" |
| "Documents incomplets" | "Options à ajouter à votre mémoire" |

**Justification:** Adil confirmed that small companies (the beginner persona) often legitimately have no organigramme; framing it as "missing" insults the customer.

#### 3.4.6 Post-Generation Editing

After generation, the memo opens in a section-by-section editor:

```
┌─────────────────────────────────────────────────────┐
│ PARTIE C — Méthodologie d'exécution     [Régénérer]│
│                                          [Modifier] │
│                                          [Supprimer]│
│  ─────────────────────────────────────────────────  │
│  La phase préparatoire consiste à mettre en place   │
│  les installations de chantier conformément au      │
│  ▼ ... (rich text editor) ...                      │
│                                                      │
│  [Sélectionner un paragraphe → Réécrire avec        │
│   instructions]                                     │
└─────────────────────────────────────────────────────┘
```

The **"Réécrire avec instructions"** action takes a selected paragraph plus a free-text instruction (e.g., *"insiste davantage sur le respect de l'environnement urbain"*) and rewrites just that paragraph via Opus 4.7.

#### 3.4.7 Output Formats

| Format | Use |
|---|---|
| `.docx` | Editable working copy (the user may want to tweak after export) |
| `.pdf` | Official deposit format |

#### 3.4.8 Memo Library Behaviour

When a user imports a past memo (e.g., one they previously wrote in Word):

1. The memo is structurally parsed — each section identified.
2. Phrases / paragraphs are tagged by section type (méthodologie, sécurité, etc.) and by corps de métier (façade, ITE, etc.).
3. Stored in `Ma bibliothèque mémoire`.
4. On the next AO with a matching corps de métier, those phrases are **automatically pulled in** as preferred wording — so the company's voice persists.

Structure extraction logic is deferred to skill `extraction-memoire-importe`.

#### 3.4.9 Visual Reference — Cariso Façade

A real memo from Adil's company (Cariso Façade) is the visual benchmark for the **NOS RÉFÉRENCES** section:

- Heading: orange uppercase ("NOS RÉFÉRENCES")
- Table columns: `Année | Intitulé | Adresse | MOA | MOE | Lot | Montant HT`
- Table header background: pale pink
- Typography: Times New Roman, **italic** for the intitulé
- No photos (Adil deliberately omitted them)
- 30+ references on multiple years

This is **reference, not template** — Synorix produces the same information *quality*, in a layout that matches Synorix's own design system.

#### 3.4.10 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-MEM-01 | Auto-pull from `Mon entreprise` — all relevant legal & capacity data |
| FR-MEM-02 | Auto-select most relevant references per AO from `Mes références` |
| FR-MEM-03 | Auto-inject pertinent phrases from `Ma bibliothèque mémoire` |
| FR-MEM-04 | Pre-generation récapitulatif with **Modifier** affordance everywhere |
| FR-MEM-05 | Option block — always positive framing, never "missing" |
| FR-MEM-06 | Generation parameters: length / tone / technical level |
| FR-MEM-07 | Section-by-section editor with régénérer / modifier / supprimer |
| FR-MEM-08 | "Réécrire avec instructions" on any selected paragraph |
| FR-MEM-09 | Export `.docx` and `.pdf` |
| FR-MEM-10 | Memo library auto-extraction on import |
| FR-MEM-11 | Library phrase reuse on new memo with matching corps de métier |

#### 3.4.11 Skills Mobilised (28)

See [SKILLS_REGISTRY_V2.md §Step 4](./SKILLS_REGISTRY_V2.md) — 4 data-pull skills, 10 section writers, 8 option generators, 4 editing/quality skills, 2 export skills.

---

### 3.5 Step 5 — Final Verification

#### 3.5.1 Product Need

A **mandatory** gate before export. The bid is automatically inspected for:

- Missing or expired administrative pieces
- Incomplete editable documents (DPGF, Cerfa)
- Memo quality, via the **Synorix Score** (/100)
- Compliance with naming and structure conventions
- Coherence with the DCE's stated requirements

The user receives a clear **rapport de conformité** and a remediation queue.

#### 3.5.2 Synorix Score — Dual Surface

| Surface | Audience | Purpose |
|---|---|---|
| **Pipeline Step 5** | Active customer | Quality gate on the memo they just generated |
| **Dedicated standalone page** | Anyone (lead-magnet candidate for V1.5) | Upload **any memo** (even non-Synorix) and get a /100 score with suggestions |

The standalone page is a marketing wedge — competitors don't offer this — but the V2.0 launch only requires the **in-pipeline** integration.

Scoring criteria, weights, and the rubric are **deferred to skill `synorix-score-evaluateur`** — built on real evaluation-commission data via NotebookLM, **never invented**.

#### 3.5.3 Submission Envelope Preparation

Step 5 also prepares the *deposit-ready* envelope:

- Generates a single ZIP with all pieces in the correct order
- Renames files to comply with the RC's nomenclature
- Builds the right subfolder structure
- Provides a `[Déposer sur PLACE]` / `[Déposer sur AWS]` deep-link and a short tutorial
- Generates a deposit checklist

ZIP structure, file-naming conventions, and tutorials are **deferred to skills** `recherche-format-zip-ao-pro`, `recherche-nomenclature-fichiers-ao`, `recherche-procedures-depot-plateformes`.

Electronic signature is **deferred to V1.5**.

#### 3.5.4 UX Specification

```
╔════════════════════════════════════════════════════════════════════╗
║  Vérification finale                                                 ║
╚════════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────┐
│  🎯 Synorix Score                                                    │
│                                                                      │
│              ┌──────────┐                                            │
│              │   84     │  / 100                                     │
│              └──────────┘                                            │
│                                                                      │
│  Pondération (exemple — à valider par skill                          │
│  `synorix-score-evaluateur` selon les critères réels CCAG-T) :       │
│                                                                      │
│  • Méthodologie d'exécution      (35%)  →  88                        │
│  • Moyens humains et matériels   (20%)  →  80                        │
│  • Sécurité et PPSPS             (15%)  →  86                        │
│  • Environnement et SOGED        (15%)  →  78                        │
│  • Innovation et RSE             (15%)  →  82                        │
│                                                                      │
│  Total pondéré : 0.35×88 + 0.20×80 + 0.15×86 +                       │
│                  0.15×78 + 0.15×82 = 84.0                            │
│                                                                      │
│  3 suggestions d'amélioration disponibles  [Voir le détail]         │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  📦 Pièces de la candidature                                         │
│  ✅ Kbis (07/04/2026) — valide                                       │
│  ✅ Attestation URSSAF (01/05/2026) — valide                         │
│  ⚠ Attestation fiscale (15/10/2025) — expire le 15/04/2026          │
│     [Téléverser une version à jour →]                                │
│  ✅ DPGF complétée                                                   │
│  ✅ AE renseigné et signé                                            │
│  ✅ Mémoire technique généré (24 pages)                              │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  📁 Enveloppe de dépôt                                               │
│  Structure conforme. Nommage prêt.                                   │
│  [Télécharger le ZIP]   [Déposer sur PLACE →]                        │
└────────────────────────────────────────────────────────────────────┘
```

**Note importante :** the weights above (35/20/15/15/15) are a plausible example based on CCAG-T 2021 practice. The **authoritative weights** are delivered by skill `synorix-score-evaluateur`, which sources real evaluation-commission criteria via NotebookLM. The PRD mockup is a UI reference only; the skill's output is the source of truth at runtime.

#### 3.5.5 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-VER-01 | Cross-check every DCE requirement vs the candidate's prepared dossier |
| FR-VER-02 | Validate expiry of admin pieces against deposit date |
| FR-VER-03 | Compute Synorix Score (/100) with per-axis breakdown |
| FR-VER-04 | Generate improvement suggestions (positive framing) |
| FR-VER-05 | Prepare ZIP with correct structure and file naming |
| FR-VER-06 | Provide deposit deep-link + tutorial per platform |
| FR-VER-07 | Re-run on demand after fixes |

#### 3.5.6 Skills Mobilised (8)

`recherche-format-rapport-conformite`, `recherche-criteres-evaluation-memoire`, `recherche-nomenclature-fichiers-ao`, `recherche-procedures-depot-plateformes`, `detection-pieces-manquantes-vs-ao`, `detection-validite-pieces-administratives`, `synorix-score-evaluateur`, `synorix-score-suggestions`.

---

### 3.6 Step 6 — Export & Submission

#### 3.6.1 Product Need

The final, user-facing handoff: produce the deposit-ready file, allow re-export at any time, and track the project lifecycle post-deposit.

#### 3.6.2 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-EXP-01 | Generate complete ZIP, ready for deposit |
| FR-EXP-02 | Allow re-export at any time (with regenerated timestamps if needed) |
| FR-EXP-03 | Include a generated **page de garde** for the memo |
| FR-EXP-04 | Include a **deposit checklist** as a top-level file in the ZIP |
| FR-EXP-05 | Transition project to status `Déposé` once the user confirms deposit |
| FR-EXP-06 | Trigger follow-up reminders 30 days after deposit |

#### 3.6.3 Post-Deposit Tracking (UX)

```
┌────────────────────────────────────────────────────────────────────┐
│  Projet : Réhabilitation école Jean Moulin                          │
│  Statut : Déposé le 15/06/2026 sur PLACE                            │
│                                                                      │
│  Synorix vous redemandera des nouvelles dans ~30 jours.             │
└────────────────────────────────────────────────────────────────────┘
```

After 30 days, the Coach (Section 5) proactively asks:

> *"Bonjour, votre AO sur le projet « Réhabilitation école Jean Moulin » a été déposé il y a 30 jours. Avez-vous eu un retour ?"*

After 7 days post-deposit, the project transitions automatically to `En cours d'évaluation`. The user then updates manually to `Gagné`, `Perdu`, or `Sans réponse` when they have news (or the system auto-flags `Sans réponse` after 120 days). **BOAMP / DECP integration for automatic status updates is V1.5.**

#### 3.6.4 Skills Mobilised (4)

`recherche-format-zip-ao-pro`, `recherche-page-garde-memoire`, `recherche-checklist-depot-plateforme`, `recherche-suivi-post-depot`.

---

### 3.7 Emergent V1 Features — Notebook-validated <!-- v2.1 - notebooks 17/5/26 -->

Two cross-cutting features emerged from the validated NotebookLM notebooks N7 + N8 as **mandatory for V1**, beyond the original 6-step pipeline. They are not bound to a single step — they span the whole project lifecycle.

#### 3.7.1 Mode Groupement GME (Skill #89 — `cotraitance-groupement`)

**Product need.** Many BTP tenders > 1 M€ HT are out of reach for a single PME but accessible to a *groupement momentané d'entreprises* (GME). The CCP article R2142-20 allows two regimes:

- **Groupement conjoint** — each member responsible only for its lot share.
- **Groupement solidaire** — every member liable for the entire performance.

**Functional requirements:**

| Req ID | Requirement |
|---|---|
| FR-GME-01 | Toggle "Mode Groupement" on a project; on activation, Synorix asks: regime (`conjoint` / `solidaire`), mandataire, list of co-traitants (with each one's SIRET). |
| FR-GME-02 | Each co-traitant's SIRET is validated against INSEE SIRENE (see ARCH §11.4). |
| FR-GME-03 | The candidature pieces (DC1/DC2/DC4) are generated per co-traitant; Synorix tracks which pieces are received from each. |
| FR-GME-04 | The technical memo presents the GME with a dedicated section: roles, responsibilities, combined references, combined capacities. |
| FR-GME-05 | At Step 5 verification, capacities are summed across the GME (financial, technical, human) and checked against the DCE's stated requirements (R2142-1 CCP). |
| FR-GME-06 | Synorix Coach surfaces a proactive suggestion to *consider* GME when the lot amount > 60% of the company's annual CA, or when a single capacity criterion is missed individually but reachable jointly. |

**Trigger heuristics** (Coach proactivity): based on N8 — *if `lot_amount > 0.6 × company.revenue_3y[-1]` OR a R2142-1 capacity criterion is unmet by the user alone but met by a saved partner*, surface the suggestion.

**Skill location:** see [SKILLS_REGISTRY_V2.md Skill #89](./SKILLS_REGISTRY_V2.md). Skill #89 lives in the **Coach** category.

#### 3.7.2 Auto-suggestions RSE 2026 (Skill #92 — `criteres-RSE-2026`)

**Product need.** The Loi Climat et Résilience, fully applied from **22/8/2026**, makes RSE criteria mandatory in public procurement above defined thresholds (low-carbon construction, biosourced materials, waste valorisation, social insertion, sustainable mobility). A non-RSE-aware bid post 22/8/2026 risks systematic eviction even at competitive pricing.

**Functional requirements:**

| Req ID | Requirement |
|---|---|
| FR-RSE-01 | At Step 3 extraction, Synorix flags every RSE criterion in the DCE (with article citation: CCP, CCAP RSE clauses). |
| FR-RSE-02 | At Step 4 memo generation, Synorix auto-suggests RSE engagement content for 5 standard categories: déchets / carbone / biosourcés / insertion / mobilité. |
| FR-RSE-03 | Suggestions are sourced from the user's sidebar (past RSE engagements, certifications) — *never invented*. |
| FR-RSE-04 | Each suggestion carries an indicator-chiffré field (taux de valorisation des déchets, kg CO₂eq/m², % matériaux biosourcés) — the user fills the number, Synorix never invents it. |
| FR-RSE-05 | At Step 5 verification, the memo's RSE section is cross-checked against the DCE's RSE expectations; gaps trigger 🟡 Recommended or 🔴 Blocking severity (PRD §7.2.1). |

**Skill location:** see [SKILLS_REGISTRY_V2.md Skill #92](./SKILLS_REGISTRY_V2.md). Skill #92 lives in the **Step 4 Memo** category.

---

## 4. Sidebar — 5 Permanent Sections

Synorix's left rail is **permanent** across all pages — even inside an active pipeline. It hosts five rubriques. Each is a first-class workspace, not a settings page.

### 4.1 📋 Mes AO

**Purpose:** the source of truth for every tender the user has touched.

**Project lifecycle — 8 statuses + 1 flag:**

| Status | Trigger | UI hint |
|---|---|---|
| `Brouillon` | Project created, pipeline not started | grey |
| `En cours` | At least step 1 started | blue |
| `Prêt à déposer` | Step 5 validated (Synorix Score shown) | light green |
| `Déposé` | User confirms deposit in step 6 | green |
| `En cours d'évaluation` | Auto, 7 days after `Déposé` | deep blue |
| `Gagné` | User updates manually | vivid green |
| `Perdu` | User updates manually | muted red |
| `Sans réponse` | User updates manually, or auto after 120 days | grey |

Independent flag: `archived` (boolean) — any status can be archived. Default list view excludes archived; a separate **"Archivés"** view shows them.

**Functional requirements:**

- List view filterable by any of the 8 statuses; default excludes `archived`.
- Each AO links to its full pipeline state — user can re-enter any step.
- Statuses are updated **manually in V1** except for the two automatic transitions above; BOAMP/DECP-driven auto-update is V1.5.
- 360° link: from any reference chantier the user can see in which AOs it was used (back-reference).
- **Proactive 30-day follow-up** by the Coach — see [§3.6.3](#363-post-deposit-tracking-ux).

**Tone of the follow-up — strict rules:**

| ✅ Correct | ❌ Forbidden |
|---|---|
| *"Avez-vous eu un retour ?"* | *"Cela nous aide à comprendre ce qui fait gagner un AO."* |
| *"Si vous voulez, je peux vous aider à analyser les retours."* | *"Pour améliorer l'IA pour toutes les entreprises Synorix."* |
| *"Je vous redemanderai dans 30 jours."* | *"Aidez-nous à enrichir notre base de données."* |

The follow-up exists to show **care for this customer** — never to extract data, never to invoke other customers.

### 4.2 🏢 Mon entreprise

**Purpose:** centralised company profile that feeds DC1/DC2 and the memo.

**Functional sub-sections:**

1. **Identité légale** — raison sociale, SIRET, forme juridique, capital social, adresse, représentant légal
2. **Effectifs** — cadres / employés / ouvriers, breakdown per qualification
3. **Capacités financières** — CA 3 derniers exercices, capacité technique
4. **Capacités techniques** — domaines d'intervention, certifications (Qualibat, RGE, etc.)
5. **Assurances** — décennale, RC, TRC, DO — with attached PDFs (auto-stored in coffre-fort)
6. **Équipe & moyens** — staff list, equipment list, fleet

**Impact downstream:**

- Pre-fills DC2 in Step 3
- Feeds *PARTIE A — Présentation entreprise* of the memo in Step 4
- Drives the "Informations reprises de votre entreprise" recap in Step 4

### 4.3 📂 Mes références chantiers

**Purpose:** the company's portfolio.

**Functional requirements:**

- Tabular format, columns: `Année | Intitulé | Adresse | MOA | MOE | Lot | Montant HT` — modelled on the Cariso reference.
- Unlimited capacity (50+ references is the design target).
- Optional **photos** per reference (Adil omitted them; some users want them).
- Optional **attestations de bonne exécution** attachable.
- Auto-selection in Step 4 based on relevance to the active AO (corps de métier, montant range, récence) — selection logic deferred to skill `selection-references-pertinentes`.
- Back-reference: each reference shows which AOs used it.

### 4.4 📝 Ma bibliothèque mémoire

**Purpose:** the company's writing memory — the voice of the company.

**Functional requirements:**

- Stores re-usable phrases per section (méthodologie, sécurité, qualité, environnement, etc.) and per corps de métier.
- Supports **import of past memos** — Synorix structurally parses them and tags each paragraph.
- On future memo generation, the engine prefers stored phrases over freshly-generated ones when a match exists.
- Editable: the user can promote, demote, or delete any stored phrase.
- Surfaces a *"Utiliser comme référence"* action on any past memo.

### 4.5 🔐 Mon coffre-fort

**Purpose:** secure storage for every administrative artefact.

**Default categories** (derived from the Cariso reference, **to be completed by `recherche-coffre-fort-pieces-administratives`**):

```
AGREMENT
ASSURANCES
ATTESTATION FISCALE
ATTESTATION PRO BTP
ATTESTATION URSSAF
CACES
CAISSE DE CONGES
CHIFFRE D'AFFAIRES
DECLARATION SUR L'HONNEUR
EFFECTIF MOYENS
KBIS
ORGANIGRAMME
QUALIBAT RGE
REFERENCES
RIB
SALARIES ETRANGERS
SS4 AMIANTE
TAMPON
TAUX ACCIDENT DE TRAVAIL
TRAVAILLEURS HANDICAPÉS
```

**Functional requirements:**

- User can **add custom categories**.
- **Validity is auto-checked** per document (validity rules deferred to `validation-piece-coffre-fort`).
- **Pre-expiry alerts** sent via in-app notification + email — *e.g.,* Kbis approaching 3 months, attestation approaching 6 months.
- Every coffre-fort document carries a back-reference: which AOs it was used in, which requirement it satisfied.
- Files are **server-side encrypted** at rest (see [ARCHITECTURE_V2.md §Sécurité](./ARCHITECTURE_V2.md)).

### 4.6 Sidebar Access Controls

- **V1.0:** all 5 sections accessible to any signed-in user on the account.
- **V1.5:** 2FA when opening the coffre-fort.
- **Plan Pro:** 1 seat. **Plan Business:** 5 seats with role-based read/write (admin / member).

### 4.7 Skills Mobilised (5)

`recherche-structure-profil-entreprise-btp`, `recherche-format-references-chantiers`, `recherche-bibliotheque-phrases-memoire`, `recherche-coffre-fort-pieces-administratives`, `analyse-historique-ao-entreprise`.

---

## 5. Synorix Coach — Level 3 Chatbot

### 5.1 What "Level 3" Means

Three rising levels of helpfulness, of which Synorix ships **Level 3** in V2.0:

| Level | Knows | Behaviour |
|---|---|---|
| 1 | Generic chatbot — answers from base LLM | Useless for AO BTP |
| 2 | Knows the product UI — can guide clicks | Better but shallow |
| **3 (V2.0)** | Knows pipeline state **+** BTP métier **+** active AO analysis **+** can audit a memo **+** can suggest strategy | The Coach |

V1.5 will introduce **Synorix Brief audio** (NotebookLM-style daily audio briefing of the user's portfolio).

### 5.2 Surfaces

| Surface | Behaviour |
|---|---|
| **Floating bubble** (bottom-right, every page) | Click → 60% screen-height panel slides up, conversational |
| **Dedicated "Coach" sidebar entry** | Full-page workspace — long sessions, strategic deep-dives |

Both share the same conversation history.

### 5.3 Modes

- **Reactive** — user asks, Coach answers
- **Proactive (light)** — Coach surfaces discreet suggestions in-context (e.g., on Step 3, *"3 pièges détectés. Voulez-vous que je vous explique le plus critique ?"*) — never modal, never blocking

**Proactivity rules — deferred to skill `recherche-mode-coaching-ao-btp`** (when to intervene, how, in what tone).

### 5.4 Conversation Context

- **Global history** persists across sessions.
- **Per-AO history** — when the user is inside a project, the Coach has implicit context of that AO's analysis.
- Sensitive operations (e.g., "show me the coffre-fort contents") require user confirmation in chat.

### 5.5 Functional Requirements

| Req ID | Requirement |
|---|---|
| FR-COA-01 | Floating bubble on every page (sticky) |
| FR-COA-02 | Dedicated Coach page in sidebar |
| FR-COA-03 | Global + per-AO conversation history |
| FR-COA-04 | Read-access to user's pipeline state + sidebar data |
| FR-COA-05 | Proactive in-page suggestions, dismissible |
| FR-COA-06 | Memo audit on demand (links to Synorix Score) |
| FR-COA-07 | Strategic suggestions (which lots to pick, which references to use, etc.) |
| FR-COA-08 | Streaming responses (no blocking spinner > 2s) |

### 5.6 Skills Mobilised (4)

`recherche-architecture-chatbot-saas-pro`, `recherche-mode-coaching-ao-btp`, `recherche-suggestions-strategiques-ao`, `recherche-suivi-resultat-ao`.

---

## 6. Business Model & Plans

### 6.1 Plans

| Feature | **Pro €299/mo** | **Business €499/mo** | Enterprise (V2.5) |
|---|---|---|---|
| **Seats** | 1 | 5 | Unlimited |
| **AO included / month** | **30** | **120** | Unlimited |
| **Additional AO** | €15 / AO | €10 / AO | — |
| **Coffre-fort storage** | 5 GB | 50 GB | Unlimited |
| **Memo library imports** | 10 memos | Unlimited | Unlimited |
| **References chantiers** | 50 max | Unlimited | Unlimited |
| **Synorix Coach** | Reactive + light suggestions | + **Proactive AO audit (running tenders)** | + Weekly strategy agent |
| **Synorix Score** | In-pipeline only | + **Public API to score external memos** (lead-gen) | + White-label |
| **Multi-user workflow** | — | **Admin/member roles, validation flow, shared history** | + SSO, SAML |
| **Coffre-fort security** | Standard | + **Mandatory 2FA, audit log** | + Custom retention policy |
| **Support** | Email (48h) | Email **priority (24h)** + chat | Email + **dedicated account manager** |
| **Onboarding** | Self-service | **Free 1-hour live session** | + team training |
| **Custom memo templates** | Synorix standard | **Per-trade custom templates** saved in library | + Synorix agency designs a bespoke template |

Both plans include: full 6-step pipeline, full sidebar (5 sections), Synorix Coach (Level 3 — modes differ as shown above), Synorix Score (in-pipeline), SIRET-validated account.

**Design intent:** every line above is a deliberate reason for a Pro customer to upgrade to Business as soon as a second person joins, volume rises, or clients ask to see Synorix Score on the company's website. No artificial gating; each Business-only feature unlocks real value for the next growth stage.

### 6.2 Unit Economics

Per-AO AI cost target: **~€0.77** (Haiku 0.02 + Sonnet 0.05 + Sonnet 0.40 + Opus 0.30 + Sonnet incl. + 0 export). Three usage scenarios drive the margin analysis:

| Scenario | AO/month | AI cost/month | Margin Pro (€299) | Margin Business (€499) |
|---|---|---|---|---|
| **Light** (median target) | 7 | ~€5.40 | **98.2%** | 98.9% |
| **Normal** (high target) | 15 | ~€11.55 | **96.1%** | 97.7% |
| **Heavy** (at fair-use cap) | 30 (Pro) / 120 (Business) | ~€23.10 / €92.40 | **92.3%** | **81.5%** |

**Hard cap** (cost-guard, see ARCHITECTURE §8.10): blocks consumption beyond ~130 AO/month on Pro (~€100 AI ceiling) and ~390 AO/month on Business (~€300 AI ceiling). Reaching the cap triggers a Coach explainer; no silent block.

Beyond included AO, the customer pays per-AO overage:

- Pro: €15 per additional AO
- Business: €10 per additional AO

### 6.3 Onboarding & Billing

Synorix ships **no free trial in the classical sense**. Instead, every new account gets **1 complete AO offered** to experience the full pipeline before committing.

**Sign-up flow:**

1. Email + name + **SIRET** (14 digits, validated against the official INSEE SIRENE API).
2. The SIRET's **NAF code** must start with 41, 42, or 43 (the BTP sector). Non-BTP SIRETs see a polite message: *"Synorix est spécialisé BTP. Contactez-nous si vous souhaitez tester pour un autre secteur."*
3. Active SIRET status required (no liquidation, no closure).

**Free trial scope (1 AO offered):**

- Full pipeline access: Upload → Lots → AI Analysis → Memo → Verification.
- Editing, regeneration, Coach access — all included.
- **The export ZIP is locked** until the user subscribes. The user sees the generated memo, can scroll it, can edit it, but cannot download a deposit-ready dossier.

**Conversion CTA:** appears after the user has experienced the memo:

> *"Débloquez l'export et lancez autant d'AO que vous voulez — €299/mois"*

**Why no money-back guarantee:** Free AO at sign-up + SIRET gate covers the trust gap upfront. Customer-service refund decisions are handled case by case, human, rare — a signal of quality, not a contractual escape hatch.

Stripe drives all paid subscriptions, prorated upgrades/downgrades, monthly recurring billing.

### 6.4 Future Plans (out of V2.0 scope)

- **Enterprise** (€999+/mo, 20 seats, SSO, custom templates) — V2.5
- **One-shot pay-per-response** (e.g., €99/response) — explicitly **rejected** to keep positioning as a recurring tool, not a consultancy substitute.

---

## 7. Tone & Product Communication Rules

These rules govern **all customer-facing text** — UI strings, emails, Coach replies, error messages, marketing copy.

### 7.1 Premium-Silent Positioning

Synorix is **paid software**. The customer pays €299–€499 per month. The product must therefore **do the work** — not ask the customer for services.

| Principle | Implementation |
|---|---|
| Synorix works for you | Verbs in 3rd person — *"Synorix analyse"*, *"Synorix prépare"* |
| Synorix doesn't ask favours | No *"Aidez-nous à…"* / *"Cela nous aiderait à…"* |
| Synorix shows care, not nosiness | Follow-ups frame the customer, not the platform |

### 7.2 Forbidden Words and Constructions

| ❌ Forbidden | ✅ Required alternative |
|---|---|
| "manquant" / "absent" / "incomplet" / "défaillant" | "À ajouter" / "À téléverser" / "Option à ajouter" |
| "Score de fiabilité : 87%" (user-visible) | (do not show — keep internal) |
| "Pour aider les autres entreprises Synorix" | (delete entirely — never invoke the customer base) |
| "Aidez-nous à améliorer l'IA" | (delete entirely) |
| "Vos données nous permettent…" | (delete entirely — confidentiality framing instead) |
| "Mode débutant" / "Mode pro" | (delete — single mode, Coach adapts) |

### 7.2.1 Severity Scale for Required Pieces

Synorix communicates required items on a three-level scale, never as alarms:

| Severity | When | Wording template | UI |
|---|---|---|---|
| 🟢 **Optional** | Not required by the DCE; would strengthen the bid | *"Ajouter [item]"* | Neutral grey |
| 🟡 **Recommended** | Mentioned in the DCE without being mandatory | *"À téléverser pour renforcer votre dossier"* | Soft blue |
| 🔴 **Blocking** | Formally required by the DCE | *"À téléverser pour finaliser le dossier — [factual citation, e.g., RC art. 5.2]"* | Muted red |

**Rules for the blocking level (🔴):**

- Start with the action verb: **À téléverser**, **À compléter**, **À fournir**.
- Include the factual citation in the middle: *"Le RC exige un Kbis de moins de 3 mois (page 4, article 5.2)"*.
- No exclamation marks. No *"Attention !"*. No *"URGENT"*.
- The Coach can surface it proactively in a calm tone: *"Synorix a identifié 2 documents requis qui ne sont pas encore dans votre coffre-fort. Je vous mets le premier ?"*

**Behaviour in Step 5 (Verification):**

- If any 🔴 item exists → Synorix Score is shown **but** the export ZIP action is disabled, with the message *"Téléversez les pièces requises pour activer le dépôt"* + list.
- The Coach surfaces the blockers in a single message, never as a stack of alerts.

**Behaviour in Step 6 (Export):**

- If the user clicks *"Télécharger ZIP"* while 🔴 items remain → confirmation modal: *"Le dossier sera incomplet. Préférez-vous d'abord téléverser les pièces requises ?"* with `[Téléverser maintenant]` / `[Télécharger quand même]` buttons.
- Export remains technically possible (the Pro persona may want the memo only, knowing what they do).

### 7.3 Confidentiality Framing

Customer data is never publicly aggregated. **No** copy ever implies that one customer's data benefits another. *"Vos données restent confidentielles"* is the default stance. The customer should *feel* — without it being explicit — that the data trajectory stays inside their account.

### 7.4 Care, not Surveillance

The 30-day follow-up exists because **a good account manager would also ask**. The wording must echo that:

> ✅ *"Bonjour, votre AO sur le projet X a été déposé il y a 30 jours. Avez-vous eu un retour ?"*

That's it. No additional sentence about why. Curiosity is the implicit norm.

### 7.5 Action-Oriented, Never Anxious

Every error / friction / mismatch surfaces with an **action**, not an alarm.

| ❌ Anxious | ✅ Action-oriented |
|---|---|
| "Attention : votre Kbis est expiré !" | "Téléverser un Kbis récent →" |
| "Document illisible !" | "Document illisible — à vérifier" + `[Voir]` button |
| "Aucune référence détectée" | "Ajouter une référence chantier →" |

### 7.6 Language Conventions

- "Synorix" — capitalised, never "le SaaS"
- "AO" — accepted abbreviation, never "appel d'offres" in body copy after first mention
- "skill" — never *compétence* or *module*
- "coffre-fort" — never *vault* (French stays French)
- "lot" — never *batch* or *parcel*

### 7.7 Voice Examples

```
✅ "Synorix a préparé votre dossier. Vous pouvez le télécharger."
❌ "Votre dossier est prêt. Veuillez le télécharger."

✅ "3 pièges détectés. Synorix vous les a marqués en rouge."
❌ "Attention ! Le DCE contient 3 pièges. Soyez vigilant."

✅ "Avez-vous eu un retour ?"
❌ "Pourriez-vous nous communiquer le résultat afin d'enrichir notre base ?"
```

---

## 8. V2.0 Success Criteria

V2.0 ships when **all four** of the following are true:

1. ✅ **Adil (expert tester) uses Synorix end-to-end and is impressed.** *"Bluffé"* is the bar — not "OK", not "useful". Specifically: a complete AO response generated in Synorix with the memo achieving a Synorix Score ≥ 80 and Adil himself rating it ≥ 80 in blind review.

2. ✅ **Ozcan refers Synorix to at least 5 contacts within 14 days of his first paid usage.** This is the organic signal — referrals from a paying customer who has just experienced the product.

3. ✅ **Zero critical bugs in production for 7 consecutive days post-launch.** Critical = blocks pipeline progression, data loss, payment failure, security breach. Tracked in Sentry; daily review.

4. ✅ **Production deployed at `synorix.tech`** with monitoring, backups, and the full pipeline operational.

### 8.1 Out-of-Scope for V2.0

- Mobile app
- Belgium / Switzerland markets
- Electronic signature
- BOAMP / DECP integration
- Audio briefings (Synorix Brief)
- Multi-language UI
- Custom enterprise templates

---

## 9. Roadmap

### 9.1 V1.0 (V2.0 of Synorix, this PRD) — Target: launch within the next development cycle

| Block | Status |
|---|---|
| Refactor of legacy 9 project skills → 86 modular skills | In progress — 8 NotebookLM notebooks validated 2026-05-17 (193 sources) <!-- v2.1 - notebooks 17/5/26 --> |
| 6-step pipeline UI | To do |
| Sidebar with 5 sections | To do |
| Synorix Coach (Level 3) | To do |
| **Mode Groupement GME (Skill #89)** <!-- v2.1 --> | To do — emergent V1 from N8 |
| **Auto-suggestions RSE 2026 (Skill #92)** <!-- v2.1 --> | To do — mandatory from 22/8/2026 (Loi Climat) |
| Stripe live (Pro + Business) | To do |
| Production deployment on `synorix.tech` | To do |

### 9.2 V1.5 — 2–3 months post-V1

- BOAMP / DECP auto-import (status updates)
- Electronic signature (eIDAS-compliant)
- 2FA on coffre-fort
- Tus-based resumable uploads
- Synorix Brief audio (daily personalised audio digest)
- Synorix Score standalone page (lead magnet)
- Multi-currency support (€/CHF) groundwork

### 9.3 V2.5 — 6+ months post-V1

- **Belgium** — adapt to Belgian public-procurement rules (Cahier Spécial des Charges, Procurement Act)
- **Switzerland** — adapt to SIA norms, RPA
- **Enterprise plan** with SSO, custom templates
- Marketplace de templates (community-contributed memo phrasings, moderated)

### 9.4 V2 Skills Roadmap — Notebook-emergent <!-- v2.1 - notebooks 17/5/26 -->

Four skills emerged from notebook validation but are **deferred post-launch** (post-first-win). They unlock post-attribution and growth flows, not the initial bid pipeline:

| Skill ID | Name | Purpose | Source notebook |
|---|---|---|---|
| #90 | `chorus-pro-facturation` | Post-attribution invoicing via Chorus Pro (mandatory for public market suppliers) | N8 |
| #91 | `choix-TCE-vs-allotissement` | Strategic decision aid: respond Tous Corps d'État vs lot-by-lot | N8 |
| #93 | `sourcing-amont` | Sourcing intelligence — identify upcoming AOs via R2111-1 CCP early signals | N8 |
| #94 | `strategie-croissance-MP` | Growth strategy: which lot families to target next based on win/loss history | N8 |

Gap IDs (#85–#88) are reserved for future expansion; they are intentionally unallocated to keep semantic numbering stable for V1 references.

### 9.5 Data Strategy — NotebookLM static snapshot <!-- v2.1 - notebooks 17/5/26 -->

**The strategy in one sentence:** NotebookLM is the source of expert truth at **build time**; at runtime, Synorix consults nothing.

| Phase | NotebookLM role | Synorix runtime |
|---|---|---|
| **Dev (skill generation)** | Source of validated BTP expertise (8 notebooks, 193 sources) | — |
| **Dev (skill update)** | Re-queried when a notebook receives new sources (jurisprudence, DTU revision) | — |
| **Production runtime** | Not consulted | Skills carry baked-in prompts derived from NotebookLM answers |

**Why a static snapshot rather than live queries:**

1. **Determinism.** Runtime queries to NotebookLM would introduce variance in skill behaviour — incompatible with reproducibility, A/B testing, and Synorix Score consistency.
2. **Cost.** A live NotebookLM call per skill invocation would add €0.05–€0.20 per AO, eroding margin.
3. **Latency.** NotebookLM queries take 5–15s — incompatible with the live SSE progress UX (PRD §3.3.7).
4. **Compliance auditability.** A frozen prompt can be inspected, version-controlled, replayed; a live RAG response cannot.

**Process for refreshing skill knowledge** (e.g., new jurisprudence, DTU revision):

1. Add the new source to the relevant notebook on `magaaa.dev@gmail.com` (NotebookLM workspace).
2. Re-validate the notebook with its standard test questions.
3. Re-generate the affected SKILL.md from the updated notebook.
4. Bump the skill `version` field (ARCH §6.5); deploy.

**Post-launch V2 ambition** (out of V1 scope): build an Obsidian + RSS regulatory-watch system that auto-suggests new sources to add to NotebookLM when CE/CAA/TA decisions, DTU updates, or DAJ guides are published.

---

## 10. Appendices

### 10.1 Reference: Cariso Façade Memo (Adil)

**File:** `/mnt/c/saas-ao/docs/MEMOIRE_TECHNIQUE_CAR_ISO_FACADE_REFERENCE.docx`

Real memorandum from a French BTP company specialising in **façade and ITE**, used as a *style and structure benchmark* — not a template.

**Key elements to inspect:**

- "NOS RÉFÉRENCES" table:
  - Orange uppercase heading
  - Header row pale-pink background
  - Columns `Année | Intitulé | Adresse | MOA | MOE | Lot | Montant HT`
  - Times New Roman, italic for the intitulé
  - 30+ entries spanning multiple years
  - No photos
- Section ordering (préambule → présentation entreprise → présentation prestation → méthodologie)
- Tone — formal but plain, avoids jargon stuffing
- Length — multi-page memo, not a one-pager

**Use as reference for skills:** `redacteur-references-chantiers`, `redacteur-presentation-entreprise`, `redacteur-methodologie`.

### 10.2 Legacy Skills to be Retired

The following 8 project-level skills are **deprecated** and will be **deleted** as the 85 modular skills replace them:

```
analyse-dce-expert
reglementation-marches-publics
normes-dtu-btp
scoring-offres-expert
dpgf-chiffrage-expert
conformite-candidature
memoire-technique-expert
pieges-dce-detecteur
```

**Rationale:** monolithic skills mix concerns (extraction + generation + scoring), are hard to evaluate independently, and were built without NotebookLM-grounded expertise. The new modular skills are scope-narrow, individually testable, and each grounded in real BTP expertise via NotebookLM.

**Note on `synorix-design-system`:** removed from this list entirely. A design system is not an AI skill — it lives in code. See §10.6 for how Synorix v2.0 handles design.

### 10.3 Skills Count Summary

| Block | Skill count |
|---|---|
| Step 1 — Upload | 5 |
| Step 2 — Lots | 4 |
| Step 3 — AI Analysis | 26 (incl. 10 corps-de-métier experts) |
| Step 4 — Memo | 28 |
| Step 5 — Verification | 8 |
| Step 6 — Export | 4 |
| Sidebar | 5 |
| Coach | 4 |
| **Total** | **84** |

### 10.4 Tech Reference

See companion documents:

- [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md) — stack, data model, security, performance, deployment
- [`SKILLS_REGISTRY_V2.md`](./SKILLS_REGISTRY_V2.md) — full specification of all 85 skills

### 10.5 Glossary

| Term | Meaning |
|---|---|
| **AO** | Appel d'offres — public-procurement tender |
| **BPU** | Bordereau des Prix Unitaires |
| **CCAG-T** | Cahier des Clauses Administratives Générales — Travaux |
| **CCAP** | Cahier des Clauses Administratives Particulières |
| **CCTP** | Cahier des Clauses Techniques Particulières |
| **DC1 / DC2 / AE** | French Cerfa procurement forms |
| **DCE** | Dossier de Consultation des Entreprises |
| **DPGF** | Décomposition du Prix Global et Forfaitaire |
| **DQE** | Détail Quantitatif Estimatif |
| **ITE** | Isolation Thermique par l'Extérieur |
| **MOA / MOE** | Maître d'Ouvrage / Maître d'Œuvre |
| **NAF** | Nomenclature d'Activités Française — INSEE sector code |
| **PAQ** | Plan d'Assurance Qualité |
| **PLACE** | Plateforme des Achats de l'État |
| **PPSPS** | Plan Particulier de Sécurité et de Protection de la Santé |
| **RC** | Règlement de la Consultation |
| **RG** | Retenue de Garantie |
| **SIRENE** | Système Informatique pour le Répertoire des ENtreprises et des Établissements (INSEE) |
| **SIRET** | 14-digit French establishment identifier |
| **SOGED** | Schéma d'Organisation et de Gestion des Déchets |
| **VRD** | Voirie et Réseaux Divers |

### 10.6 Design System Reference

Synorix's design system lives in code, not as an AI skill.

- **Foundation:** existing `/frontend/tailwind.config.ts` is conserved, audited, and refined as needed during the v2.0 refactor.
- **Components:** built progressively in `/frontend/src/components/` — what exists is kept; missing components are built case-by-case using Claude Design (claude.ai/design) for generation, then assembled by Claude Code.
- **Animations:** Framer Motion for pipeline-step transitions, modal slide-ins, and the Coach panel.
- **Theme:** Light **and** Dark mode toggle ships in V1.0. Theme persists per user via Clerk metadata. Default = light. The toggle lives in the user menu (top-right).
- **Premium visual content** (hero landing, demo videos, illustrations): generated via Higgsfield MCP (`https://mcp.higgsfield.ai/mcp`) during the Design Phase (post-skills creation). Brand kit configured in Higgsfield for consistency.
- **Aesthetic direction:** *premium-technical, futuristic-without-gadgetry*. Reference SaaS for tone: Linear, Vercel, Cursor (not literal style, but the conviction that every pixel earns its place).

**Frontend rules:**

- No Inter, no Roboto, no default Tailwind blue, no purple gradients on white.
- Distinctive display font + clean body sans-serif; verify both render well in dark and light.
- Animations 200–300 ms ease-out; no bouncing, no excessive parallax.
- Theme switch must not break any component — every color uses Tailwind dark variants or CSS variables.

---

## 11. Changelog

### 2.4 — 2026-05-18 (later same day, patch follow-up)

- **§1.7 Differentiators table** — D7 column updated (Skill #82 → **Skill #95**, STUB). D6 / D8 / D10 / D11 marked **PENDING_ID** (collision flagged in SKILLS_REGISTRY §Collision Flag). The originally proposed IDs (#79, #80, #75, #77) are already occupied; resolution pending Mohamed's arbitration.

### 2.3 — 2026-05-18

Integration of the 8 validated NotebookLM notebooks (193 sources, created & validated on 2026-05-17 on the `magaaa.dev@gmail.com` workspace). See [NOTEBOOKS_REGISTRY.md](./NOTEBOOKS_REGISTRY.md).

- **§1.6** — Skills count updated to 86 V1 (was 85 placeholder, now reflects two emergent V1 skills below).
- **§1.7** — NEW. 15 product differentiators with legal/jurisprudence anchors (CE / TA / CAA decisions 2024-2026 + CCP articles).
- **§3.7** — NEW. Two emergent V1 features beyond the original pipeline:
  - **§3.7.1** Mode Groupement GME (Skill #89, R2142-20 CCP)
  - **§3.7.2** Auto-suggestions RSE 2026 (Skill #92, Loi Climat 22/8/2026)
- **§9.1** — Refactor count 85 → 86; explicit lines for #89 GME and #92 RSE; status updated to reflect notebooks validated.
- **§9.4** — NEW. V2 Skills Roadmap (#90 Chorus Pro, #91 TCE-vs-allotissement, #93 sourcing amont, #94 stratégie croissance MP).
- **§9.5** — NEW. NotebookLM static-snapshot strategy (build-time only, no runtime queries).

### 2.2 — 2026-05-13

- **§3.1.2 + §3.1.3 + §3.3.7** — Removed estimated analysis time. Replaced by live named-step checkpoints with SSE streaming and Coach explainer (no percentage bar — honesty + premium-silent).
- **§10.3** — Skills count updated to 84 (Step 1 Upload: 5 skills, `estimation-temps-analyse` removed).

### 2.1 — 2026-05-13

- **§2.4** — UC-1 rewritten (10 steps) with native DPGF editing, URSSAF upload, offline AE signature (eSign deferred to V1.5). UC-2 kept consistent.
- **§3.5.4** — Synorix Score mockup made arithmetically coherent (weighted average 35/20/15/15/15 = 84.0). Marked weights as "example to be authoritatively defined by skill `synorix-score-evaluateur`".
- **§3.6.3 + §4.1** — Project status lifecycle unified to 8 statuses + `archived` flag.
- **§6.1** — Plans differentiated across 12 axes (seats, AO included, overage price, storage, library, references, Coach mode, Score API, multi-user workflow, 2FA, support tier, onboarding, custom templates).
- **§6.2** — Unit economics restructured into 3 scenarios (Light/Normal/Heavy) + hard cap row.
- **§6.3** — Trial replaced by SIRET-gated freemium (1 AO offered, NAF 41/42/43, export locked until paid). Money-back removed.
- **§7.2.1** — Severity scale added (Optional/Recommended/Blocking) with behaviour rules for Steps 5 and 6.
- **§10.2** — Removed `synorix-design-system` from legacy skill list.
- **§10.6** — Added Design System Reference section (Tailwind + shadcn/ui + Framer Motion + Light/Dark toggle V1 + Higgsfield phase Design).

### 2.0 — 2026-05-13

- Initial v2.0 PRD.

---

*End of PRD — Synorix v2.4*
