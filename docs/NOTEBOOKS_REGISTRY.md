# NOTEBOOKS_REGISTRY — Synorix v2.1

**Inventory of the 8 validated NotebookLM notebooks that ground Synorix's skill expertise.**

| Field | Value |
|---|---|
| Document version | 1.2 |
| Status | Active — source of truth for skill-building expertise |
| Workspace | `magaaa.dev@gmail.com` (NotebookLM, free tier) |
| Created & validated | 2026-05-17 |
| Last updated | 2026-05-18 (v1.2 — D6/D8/D10/D11 PENDING_ID resolved → Skills #85/#86/#87/#88) |
| Companion to | [`PRD_SYNORIX_V2.md`](./PRD_SYNORIX_V2.md), [`SKILLS_REGISTRY_V2.md`](./SKILLS_REGISTRY_V2.md), [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md) |

---

## Table of Contents

- [Why this registry exists](#why-this-registry-exists)
- [Notebooks overview](#notebooks-overview)
- [N1 — Réglementaire MP BTP](#n1--réglementaire-mp-btp)
- [N2 — Pièces administratives BTP](#n2--pièces-administratives-btp)
- [N3 — Mémoires gagnants BTP](#n3--mémoires-gagnants-btp)
- [N4 — Normes DTU (10 corps de métier)](#n4--normes-dtu-10-corps-de-métier)
- [N5 — Plateformes de dépôt](#n5--plateformes-de-dépôt)
- [N6 — Pièges + Jurisprudence](#n6--pièges--jurisprudence)
- [N7 — Scoring / Évaluation](#n7--scoring--évaluation)
- [N8 — Coach / Conseil](#n8--coach--conseil)
- [Skill ↔ Notebook map](#skill--notebook-map)
- [Refresh process](#refresh-process)

---

## Why this registry exists

Synorix is built on **real BTP expertise**, not assumptions. The 8 notebooks below are the **single source of validated expert truth** consulted at build time when generating each skill's frozen prompt (see [ARCHITECTURE §6.6](./ARCHITECTURE_V2.md#66-skill-generation-strategy--notebooklm-static-snapshot)).

At runtime, NotebookLM is **never** consulted — the skill prompts carry the baked-in expertise. The registry serves three purposes:

1. **Auditability** — anyone can verify which sources back each skill.
2. **Refresh** — when new jurisprudence or DTU revisions are published, this registry tells us which skills to regenerate.
3. **Compliance** — for AO BTP, citing the source of legal claims is non-negotiable. The chain is: skill → SKILL.md prompt → NotebookLM source → original document.

---

## Notebooks overview

| ID | Title | Sources | Validation | Primary skill domains |
|---|---|---|---|---|
| **N1** | Réglementaire MP BTP | 15 | 9 / 10 | Base juridique CCP, seuils 2026 |
| **N2** | Pièces administratives BTP | 15 | 9 / 10 | DC1/DC2/DC4, attestations, RGE transition |
| **N3** | Mémoires gagnants BTP | 20 | 9.7 / 10 | Structure mémoire, finitions A/B/C, jurisprudence CE 474772 |
| **N4** | Normes DTU 10 corps de métier | 48 | 9.7 / 10 | DTU complets + AQC + SYCODES sinistralité |
| **N5** | Plateformes dépôt | 24 | 9.8 / 10 | PLACE/AWS/Maximilien, eIDAS, signature, R2132-11 |
| **N6** | Pièges + Jurisprudence | 30 | 10 / 10 | 5 arrêts CE/TA 2024-2026, référés L551 CJA |
| **N7** | Scoring / Évaluation | 24 | 10 / 10 | 3 formules DAJ, OAB L2152-5, double moyenne, RSE 2026 |
| **N8** | Coach / Conseil | 17 | 10 / 10 | Onboarding PME, GME R2142-20, TCE vs allotissement, Chorus Pro |

**Total sources curated: 193.** Average validation score: **9.65 / 10**.

---

## N1 — Réglementaire MP BTP

- **NotebookLM URL:** _(à compléter par Mohamed)_ `https://notebooklm.google.com/notebook/<UUID>`
- **Date création :** 2026-05-17
- **Sources :** 15
- **Score de validation :** 9 / 10
- **Domaine couvert :** Code de la commande publique (parties législative et réglementaire), seuils européens 2026, procédures de passation, principes fondamentaux (égalité, transparence, mise en concurrence).

**Skills alimentées (mapping):**

- Skill #15 (analyse-side `detection-visite-obligatoire`) — CCP article references
- **Skill #87 STUB** `detection-criteres-disproportionnes` — L2142-1 CCP
- **Skill #95 STUB** `calculateur-OAB-temps-reel` — articles L2152-5 + R2152-3 à R2152-5
- Other CCP-anchored citations across the registry

**Liste des sources** _(à compléter par Mohamed depuis NotebookLM)_:

1. _(titre)_ — _(URL)_
2. _(titre)_ — _(URL)_
3. ... (15 entries total)

**Questions de validation utilisées :**

- « Quels sont les seuils de procédure des marchés publics en France en 2026 (procédure adaptée vs formalisée) ? »
- « Quelles sont les obligations de mise en concurrence préalable au-delà de 90 000 € HT ? »

**Apprentissages clés :**

- Seuils européens MAPA inchangés en 2026 mais à confirmer en cas de révision UE.
- Distinction MAPA / appel d'offres ouvert / restreint / négocié — pivot pour orienter la stratégie utilisateur dès Step 3.

---

## N2 — Pièces administratives BTP

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 15
- **Score de validation :** 9 / 10
- **Domaine couvert :** Pièces administratives à fournir (DC1, DC2, DC4, attestations URSSAF / fiscale / Pro BTP), durées de validité, transition RGE Qualibat 8632/8633 → Certibat au **30/9/2026**.

**Skills alimentées (mapping):**

- Skill #1 `recherche-types-documents`
- Skill #2 `detection-date-limite` (Differentiator **D15** — détection RGE expirante)
- Skill #11 `extraction-pieces-offre`
- Skill #35 `validation-piece-coffre-fort`
- Skill #69 `detection-pieces-manquantes-vs-ao`
- Skill #70 `detection-validite-pieces-administratives`

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (15 entries)

**Questions de validation utilisées :**

- « Quelle est la durée de validité d'un Kbis pour une candidature marché public BTP en 2026 ? »
- « Quels sont les changements RGE Qualibat 8632/8633 → Certibat à partir du 30/9/2026 ? »

**Apprentissages clés :**

- La transition RGE 8632/8633 → Certibat au 30/9/2026 est une **date couperet** — Skill #2 doit alerter dès qu'un Kbis utilisateur cite l'un de ces deux référentiels.
- DC4 spécifique aux groupements — alimente Skill #89.

---

## N3 — Mémoires gagnants BTP

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 20
- **Score de validation :** 9.7 / 10
- **Domaine couvert :** Structure type d'un mémoire technique gagnant, finitions de niveau A/B/C, jurisprudence CE 474772 (irrégularité matérielle vs formelle), critères de différenciation reconnus par les commissions.

**Skills alimentées (mapping):**

- Skills #40 à #49 (rédacteurs sections mémoire)
- Skills #50 à #57 (générateurs d'options : organigramme, Gantt, PPSPS, SOGED, PAQ, innovation, RSE)
- Skill #58 `editeur-section-regeneration`
- Skill #61 `suggestion-plus-values`
- Skill #71 `synorix-score-evaluateur`
- Skills experts métier #25 à #34 (cross-reference with N4)

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (20 entries)

**Questions de validation utilisées :**

- « Quels éléments distinguent un mémoire technique noté 9-10/10 d'un mémoire noté 5-6/10 dans les marchés publics BTP français ? »
- « Comment l'arrêt CE 474772 a-t-il redéfini la frontière entre irrégularité matérielle et formelle ? »

**Apprentissages clés :**

- La hiérarchisation A/B/C des finitions est une convention répandue — Synorix Score doit la respecter.
- Présence d'un PPSPS spécifique au chantier (pas générique) = critère discriminant.

---

## N4 — Normes DTU 10 corps de métier

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 48
- **Score de validation :** 9.7 / 10
- **Domaine couvert :** Liste complète des NF DTU applicables par corps de métier (façade, ITE, gros œuvre, électricité, CVC, plomberie, peinture, VRD, menuiserie, étanchéité), rapports AQC sinistralité, statistiques SYCODES.

**Skills alimentées (mapping):**

- Skills #25 à #34 (10 experts métier — chacun puise ses DTU dans N4)
- Skill #45 `redacteur-methodologie` (cite les DTU dans la méthodologie d'exécution)
- Skill #60 `detection-phrases-risque` (avertit si engagement contraire à DTU)

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (48 entries — la plus volumineuse)

**Questions de validation utilisées :**

- « Quels DTU sont applicables à un lot ITE en 2026 et quelles sont les évolutions récentes ? »
- « Quels sont les pathologies les plus fréquemment observées par l'AQC sur les chantiers gros œuvre ? »

**Apprentissages clés :**

- Plusieurs DTU récemment révisés (à signaler dans les skills concernées avec date de révision).
- Sinistralité AQC = base solide pour les *pièges* signalés par les experts.

---

## N5 — Plateformes de dépôt

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 24
- **Score de validation :** 9.8 / 10
- **Domaine couvert :** Plateformes officielles (PLACE, AWS Achatpublic, Maximilien, marches-securises.fr), signature électronique eIDAS, formats acceptés, contrainte de taille, **copie de sauvegarde R2132-11 CCP**, retours d'expérience opérationnels.

**Skills alimentées (mapping):**

- Skill #4 `detection-plateforme-depot`
- Skill #67 `recherche-nomenclature-fichiers-ao`
- Skill #68 `recherche-procedures-depot-plateformes`
- Skill #71 `synorix-score-evaluateur` (Differentiator **D5** — copie sauvegarde R2132-11)
- Skill #73 `recherche-format-zip-ao-pro` (Differentiator **D2** — validation ZIP avant dépôt, TA Montpellier 2405722)
- Skill #74 `recherche-page-garde-memoire`
- Skill #75 `recherche-checklist-depot-plateforme`

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (24 entries)

**Questions de validation utilisées :**

- « Quels formats de fichier et tailles sont acceptés par PLACE en 2026 ? »
- « Quelle est la procédure officielle de constitution d'une copie de sauvegarde R2132-11 CCP ? »

**Apprentissages clés :**

- Limites techniques (taille ZIP) **non communiquées** par certaines plateformes — lever un flag Synorix Coach (CE 13/11/2025 AP-HP n°506640).
- Signature mixte autorisée (CE 2/10/2025 SFRS n°501204) — Synorix doit valider la cohérence signature ZIP / signature pièces.

---

## N6 — Pièges + Jurisprudence

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 30
- **Score de validation :** 10 / 10
- **Domaine couvert :** Décisions Conseil d'État, CAA, TA 2024-2026 sur les AO publics BTP ; référés précontractuel / contractuel L551-1 à L551-12 CJA ; recours candidat évincé.

**Skills alimentées (mapping):**

- Skill #16 `detection-pieges-dce` (Differentiator **D9** — CE NAYMA 2024 contradictions)
- Skill #17 `detection-incoherences-dce`
- Skill #60 `detection-phrases-risque`
- Skill #71 `synorix-score-evaluateur`
- Skill #72 `synorix-score-suggestions` (Differentiator **D4** — diligence prouvable horodatée, CE 2025)
- **Skill #88 STUB** `conseil-recours-eviction` (Differentiator **D11**)
- Skill #89 `cotraitance-groupement` (jurisprudence GME)
- Almost every skill that cites jurisprudence in its output (Differentiator **D1** — cross-cutting)

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (30 entries)

**Décisions clés référencées (à inscrire dans la table `jurisprudence` ARCH §4) :**

| Décision | Date | N° | Principe |
|---|---|---|---|
| TA Montpellier | 29/10/2024 | 2405722 | ZIP corrompu = rejet irrégularisable |
| TA Toulouse | 9/3/2011 | 1100792 | Signature ZIP ≠ signature des pièces |
| CE SFRS | 2/10/2025 | 501204 | Signature mixte autorisée |
| CE AP-HP | 13/11/2025 | 506640 | Limite technique non communiquée |
| CE Actor France | 12/6/2024 | 475214 | Offre inacceptable = budget communiqué |
| CE NAYMA | 18/7/2024 | 492938 | Devoir vigilance candidat sur contradictions DCE |
| CE Tarn-et-Garonne | 4/4/2014 | — | Recours candidat évincé |
| TA Nantes Verchéenne | 19/5/2025 | 2506407 | Rejet OAB sans contradictoire = annulation |
| CAA Nantes | — | — | Pondération 90/10 illégale sans justification |

**Questions de validation utilisées :**

- « Quelles décisions du Conseil d'État entre 2024 et 2026 ont précisé les obligations de l'acheteur en matière d'OAB ? »
- « Quel est le délai de référé précontractuel L551-1 CJA et quelles preuves de diligence le candidat doit-il conserver ? »

**Apprentissages clés :**

- Jurisprudence 2024-2026 inflexion en faveur du candidat sur la traçabilité (horodatage diligence).
- Référé précontractuel L551-1 = arme défensive ; Synorix doit guider l'utilisateur quand pertinent (**Skill #88** STUB `conseil-recours-eviction`).

---

## N7 — Scoring / Évaluation

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 24
- **Score de validation :** 10 / 10
- **Domaine couvert :** 3 formules DAJ de notation du prix (linéaire, inversement proportionnelle, variante), méthode de **double moyenne** pour OAB (L2152-5 CCP), critères d'attribution R2152-6 à R2152-8, RSE 2026 (Loi Climat 22/8/2026).

**Skills alimentées (mapping):**

- Skill #14 `extraction-criteres-jugement`
- Skill #66 `recherche-criteres-evaluation-memoire`
- Skill #71 `synorix-score-evaluateur`
- Skill #72 `synorix-score-suggestions`
- **Skill #85 STUB** `simulateur-prix-DAJ` (Differentiator **D6**)
- **Skill #86 STUB** `RAO-predictif` (Differentiator **D8**)
- **Skill #95 STUB** `calculateur-OAB-temps-reel` (Differentiator **D7**)
- Skill #84 `recherche-suggestions-strategiques-ao` (Differentiator **D14** — justification OAB)
- Skill #92 `criteres-RSE-2026` (Differentiator **D13**)

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (24 entries)

**Questions de validation utilisées :**

- « Quelles sont les 3 formules de notation du prix recommandées par la DAJ et quand chacune s'applique-t-elle ? »
- « Décris la méthode de la double moyenne pour qualifier une offre anormalement basse selon L2152-5 CCP. »
- « Quels sont les critères RSE rendus obligatoires par la Loi Climat à partir du 22/8/2026 ? »

**Apprentissages clés :**

- Formule inversement proportionnelle = pénalise plus les écarts → favoriser quand l'acheteur veut écarter les outliers.
- Double moyenne pour OAB = seuil glissant relatif à la moyenne des offres → **Skill #95** doit calculer en temps réel selon les offres concurrentes (estimation Bayésienne hors V1).

---

## N8 — Coach / Conseil

- **NotebookLM URL:** _(à compléter par Mohamed)_
- **Date création :** 2026-05-17
- **Sources :** 17
- **Score de validation :** 10 / 10
- **Domaine couvert :** Onboarding PME aux marchés publics, **GME R2142-20 CCP**, choix TCE vs allotissement, Chorus Pro, stratégie de croissance.

**Skills alimentées (mapping):**

- Skill #82 (Coach) `recherche-architecture-chatbot-saas-pro`
- Skill #83 (Coach) `recherche-mode-coaching-ao-btp`
- Skill #84 (Coach) `recherche-suggestions-strategiques-ao`
- Skill #85 (Coach) `recherche-suivi-resultat-ao`
- **Skill #89** `cotraitance-groupement` (NEW V1 — Differentiator **D12**)
- Skill #90 (V2 roadmap) `chorus-pro-facturation`
- Skill #91 (V2 roadmap) `choix-TCE-vs-allotissement`
- Skill #92 `criteres-RSE-2026` (NEW V1 — co-sourced with N7)
- Skill #93 (V2 roadmap) `sourcing-amont`
- Skill #94 (V2 roadmap) `strategie-croissance-MP`

**Liste des sources** _(à compléter)_:

1. _(titre)_ — _(URL)_
2. ... (17 entries)

**Questions de validation utilisées :**

- « Comment guider une PME du BTP qui répond à son premier marché public en 2026 ? »
- « Quels sont les pièges et bonnes pratiques d'un GME conjoint vs solidaire au sens R2142-20 CCP ? »

**Apprentissages clés :**

- L'onboarding PME a un séquencement précis (sourcing → première candidature → premier marché → Chorus Pro → croissance) ; Synorix Coach respecte cette progression.
- GME = levier d'accès aux marchés > 1 M€ HT pour PME — **emergent V1**.

---

## Skill ↔ Notebook map

The canonical mapping is also embedded in each skill's `Notebook source` field in [SKILLS_REGISTRY_V2.md](./SKILLS_REGISTRY_V2.md). This table is the inverted view, by notebook:

| Notebook | Primary skills (non-exhaustive) |
|---|---|
| N1 | #15, **#87 STUB**, **#95 STUB**, broad CCP citations |
| N2 | #1, #2, #11, #35, #69, #70 |
| N3 | #40–#49, #50–#57, #58, #61, #71 |
| N4 | #25–#34, #45, #60 |
| N5 | #4, #67, #68, #71, #73, #74 |
| N6 | #16, #17, #60, #72, **#87 STUB**, **#88 STUB**, every jurisprudence citation |
| N7 | #14, #66, #71, #72, **#85 STUB**, **#86 STUB**, **#95 STUB**, #84, #92 |
| N8 | Coach skills #81–#84, **#89**, #90/91/93/94 (V2), #92 |

---

## Refresh process

When a new source must be added (new CE ruling, DTU revision, DAJ guide update):

1. **Add the source** to the relevant notebook in NotebookLM workspace (`magaaa.dev@gmail.com`).
2. **Re-validate** the notebook by asking its standard validation questions; score must remain ≥ 9/10.
3. **Identify affected skills** via the Skill ↔ Notebook map above.
4. **Regenerate** the affected `prompts/<skill>.md` from the updated notebook.
5. **Bump skill `version`** (ARCH §6.5); deploy.
6. **Update this registry** — add the source to the notebook's "Liste des sources", note the date in `Last updated` at the top.

**V2 ambition** (out of V1 scope): an Obsidian + RSS regulatory-watch pipeline that auto-suggests new sources for inclusion when a new CE/CAA/TA decision, DTU revision, or DAJ guide is published.

---

## ⚠ Placeholders to complete

- All notebook URLs are placeholders — Mohamed will paste the actual NotebookLM URLs from the `magaaa.dev@gmail.com` workspace.
- All "Liste des sources" sections are placeholders — Mohamed will copy each notebook's source list (titre + URL) from NotebookLM into the corresponding section here.

Once those are filled in, the registry becomes the definitive build-time reference for any skill regeneration.

---

*End of NOTEBOOKS_REGISTRY — Synorix v2.1 (registry doc v1.2)*
