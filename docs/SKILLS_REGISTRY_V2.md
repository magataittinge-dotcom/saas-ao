# Skills Registry — Synorix v2.0

**Authoritative catalogue of the 91 modular skills that power Synorix v2.0 (86 fully specified + 5 differentiator stubs at #85/#86/#87/#88/#95).**

| Field | Value |
|---|---|
| Document version | 2.5 |
| Status | Active — registry for the `refactor-v2` skills build |
| Companion to | [`PRD_SYNORIX_V2.md`](./PRD_SYNORIX_V2.md), [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md) |
| Last updated | 2026-05-27 |

<!--
====================================================================
v2.5 (2026-05-27) — Taxonomy alignment: prose categories → 9 pipeline-aware code categories
(source of truth = backend/synorix/skills/<cat>/). Applied to all 91 skills.

Conversion table (old "Catégorie :" → new pipeline category : count of skills):

  Génération            -> memoire        : 23
  Coaching              -> expert-metier  : 10
  Extraction            -> extraction     :  6
  Détection             -> extraction     :  5
  Recherche             -> sidebar        :  4
  Recherche             -> verification   :  4
  Coaching              -> chatbot        :  3
  Détection             -> lots           :  3
  Détection             -> upload         :  3
  Recherche             -> export         :  3
  Validation            -> extraction     :  3
  Extraction            -> memoire        :  2
  Synthèse              -> extraction     :  2
  Coaching              -> memoire        :  1
  Coaching              -> verification   :  1
  Détection             -> memoire        :  1
  Détection             -> verification   :  1
  Extraction            -> lots           :  1
  Extraction            -> sidebar        :  1
  Extraction            -> upload         :  1
  Recherche             -> chatbot        :  1
  Recherche             -> upload         :  1
  Recherche / Coaching  -> chatbot        :  1
  Recherche / Coaching  -> export         :  1
  Synthèse              -> memoire        :  1
  Synthèse              -> sidebar        :  1
  Synthèse              -> verification   :  1
  Validation            -> verification   :  1
  (stub format) #85,#86,#95 -> verification     : 3
  (stub format) #87       -> extraction       : 1
  (stub format) #88       -> export           : 1

Total: 86 prose Catégorie rewrites + 5 stub-table additions = 91 skills.
Unmapped: 0. No skill required manual reclassification.
====================================================================
-->

---

## Global Rules for All Skills

These rules apply to every skill in this registry, regardless of category.

1. **Fail loudly, never hallucinate.** If a skill cannot extract or determine an output with confidence, it MUST return a structured indication of failure (`not_found: true`, `confidence: <0.5`, or equivalent typed signal). Never invent a plausible-looking value.

2. **Internal confidence scores are persisted, never displayed.** Every skill that produces a confidence metric stores it in `skill_invocations.metadata` (see ARCHITECTURE §4) for later re-evaluation. User-facing UI never exposes raw confidence scores (see PRD §3.2.3).

3. **Source citation is mandatory for every extracted fact.** Every skill that extracts a textual fact (date, amount, requirement, clause) must output the source document and page number. No source = output is invalid.

4. **Cost-effective model selection.** Use Haiku 4.5 by default. Step up to Sonnet 4.6 when the task requires multi-document reasoning, nuanced judgement, or complex extraction — **including the memo generator skills (Step 4), which run on Sonnet 4.6** (full-Sonnet, ~7× cheaper than Opus). Use Opus 4.7 only for targeted paragraph rewrite (editeur) and the Synorix Score evaluation.

---

## Table of Contents

- [Global Rules for All Skills](#global-rules-for-all-skills)
- [Philosophy](#philosophy)
- [Skill Schema](#skill-schema)
- [Step 1 — Upload (5 skills)](#step-1--upload-5-skills)
- [Step 2 — Lot Detection (4 skills)](#step-2--lot-detection-4-skills)
- [Step 3 — AI Analysis (26 skills)](#step-3--ai-analysis-26-skills)
- [Step 4 — Technical Memo (28 skills)](#step-4--technical-memo-28-skills)
- [Step 5 — Final Verification (8 skills)](#step-5--final-verification-8-skills)
- [Step 6 — Export (4 skills)](#step-6--export-4-skills)
- [Sidebar (5 skills)](#sidebar-5-skills)
- [Synorix Coach (4 skills)](#synorix-coach-4-skills)
- [Legacy Skills to Retire](#legacy-skills-to-retire)
- [Changelog](#changelog)

---

## Philosophy

### Skills are modular, not monolithic

Each skill has one job. `extraction-exigences-administratives` extracts admin requirements. It does not also score them, summarise them, or link them — those are other skills' jobs. Composition over conflation.

### Skills are NotebookLM-grounded, not LLM-invented

**Synorix is built on real BTP expertise — not assumptions.**

Every skill in this registry carries a **Question NotebookLM** field. When the skill is built, Claude Code will:

1. Open the NotebookLM MCP.
2. Ingest the sources listed in **Sources NotebookLM suggérées**.
3. Ask the **Question NotebookLM**.
4. Build the skill's prompt and logic from the resulting expert knowledge.

This means **no business rule in this registry is invented**. Durations, formats, weights, thresholds, conventions — all are deferred to NotebookLM at skill-creation time.

### Skills are individually evaluable

Each skill has explicit **Inputs attendus** and **Outputs produits**, so it can be unit-tested in isolation against fixtures. A skill is "done" when it satisfies its **Critères de qualité** — not when it merely compiles.

### Skills declare their preferred model

The measured multi-model cost of **~€1 per complete AO** (mémoire en full-Sonnet) is achieved by **assigning the cheapest sufficient model to each skill**:

| Model | Use case | Per-call ballpark |
|---|---|---|
| **Haiku 4.5** | Lightweight classification, deterministic extraction, fast routing | €0.005–0.02 |
| **Sonnet 4.6** | Bulk analysis, structured extraction with reasoning, **long-form memo composition** (Step 4) | €0.02–0.90 |
| **Opus 4.7** | Targeted paragraph rewrite (editeur), high-stakes synthesis (Synorix Score) | €0.10–0.30 |

The recommended model per skill is **a default, not a contract** — A/B testing post-launch may downgrade or upgrade individual skills.

---

## Skill Schema

Every skill in this registry follows this template:

```markdown
### Skill #N — `nom-de-la-skill`

**Catégorie :** [upload / lots / extraction / expert-metier / memoire / verification / export / sidebar / chatbot]
**Étape :** [Upload / Lots / Analyse / Mémoire / Vérification / Export / Sidebar / Coach]
**Modèle IA recommandé :** [Haiku 4.5 / Sonnet 4.6 / Opus 4.7 / aucun]
**Status :** À créer
**Notebook source :** [N1 / N2 / N3 / N4 / N5 / N6 / N7 / N8 / combinations, e.g., "N3+N4"]   <!-- v2.1 - notebooks 17/5/26 -->
**Validated :** [true / false]   <!-- v2.1 - true = notebooks ingested; false = pending -->
**Différenciateur :** [Dn ID from PRD §1.7, or 0 if not a differentiator]   <!-- v2.1 -->

**Mission :**
[What this skill does and why it matters.]

**Déclenchement :**
[When this skill fires in the pipeline.]

**Inputs attendus :**
- [Typed inputs the skill needs.]

**Outputs produits :**
- [Typed outputs the skill returns.]

**Question NotebookLM :**
"[Precise question to ask NotebookLM during skill build.]"

**Sources NotebookLM suggérées :**
- [Concrete source types to ingest.]

**Critères de qualité :**
- [How we know the skill is well built.]
```

> **v2.1 retrofit note** — the three new fields (`Notebook source`, `Validated`, `Différenciateur`) are introduced in this version. Skills #89 and #92 below carry them already. The retrofit on the 84 previously catalogued skills is tracked separately (one-shot Python pass against the [NOTEBOOKS_REGISTRY.md](./NOTEBOOKS_REGISTRY.md) source map); the registry itself is the single source of truth at runtime regardless.

---

## Step 1 — Upload (5 skills)

### Skill #1 — `recherche-types-documents`

**Catégorie :** upload
**Étape :** Upload
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Identifier la liste exhaustive des types de documents qu'on peut rencontrer dans un DCE BTP français (RC, CCAP, CCTP, DPGF, BPU, DQE, AE, DC1, DC2, plans, annexes, attestations templates, etc.), avec leurs synonymes, abréviations et patterns de nommage.

**Déclenchement :**
À l'extraction du ZIP, pour chaque fichier détecté.

**Inputs attendus :**
- Nom du fichier (avec extension)
- Premières 2000 caractères du contenu textuel
- Métadonnées (taille, type MIME)

**Outputs produits :**
- Type canonique du document (énuméré)
- Catégorie (administratif / technique / financier / annexe / plan)
- Score de confiance interne (non exposé à l'utilisateur)

**Question NotebookLM :**
"Quels sont tous les types de documents possibles dans un DCE BTP français en 2026 ? Pour chaque type, donne-moi : les noms courants, les abréviations, les patterns de nommage de fichier les plus fréquents, et 5 phrases d'incipit typiques permettant de le reconnaître."

**Sources NotebookLM suggérées :**
- Guides DAJ (Direction des Affaires Juridiques)
- Vade-mecum acheteurs publics
- Exemples de DCE réels anonymisés (10+)
- Formations YouTube experts marchés publics
- Code de la commande publique (sections relatives aux pièces de marché)

**Critères de qualité :**
- Couvre tous les types listés dans le PRD plus ceux émergents (Cerfa récents).
- Détecte correctement même les fichiers mal nommés (test sur 50+ DCE réels).
- Faux positif < 5% sur un dataset de validation.

> **Modèle :** Haiku 4.5 — la classification multi-classes sur nom de fichier + premiers 2000 caractères est un signal fort qui ne nécessite pas le raisonnement de Sonnet. Économie ~10× vs Sonnet sur un DCE typique de 50 documents.

---

### Skill #2 — `detection-date-limite`

**Catégorie :** upload
**Étape :** Upload
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire la date et l'heure limites de remise des offres depuis le RC (et croisement avec l'AE et le CCAP si nécessaire).

**Déclenchement :**
Après détection du RC.

**Inputs attendus :**
- Texte intégral du RC
- Texte de l'AE si disponible
- Texte du CCAP si disponible

**Outputs produits :**
- Date limite (`YYYY-MM-DD`) ou `null` si non détectée
- Heure limite (`HH:MM`) ou `null` si non détectée
- Fuseau horaire (par défaut Europe/Paris)
- Source citée (document + page) — obligatoire si date trouvée
- `not_found: bool` — true si extraction impossible avec confiance
- `confidence: float` (0.0–1.0) — confiance globale

**Question NotebookLM :**
"Où précisément trouve-t-on la date et l'heure limites de remise des offres dans un RC français ? Quelles sont les formulations exactes employées ? Comment gérer les divergences entre RC et AE ? Quelles sont les conventions de fuseau horaire ?"

**Sources NotebookLM suggérées :**
- 50+ RC réels (extraits anonymisés)
- Guides DAJ
- CCAG-Travaux 2021

**Critères de qualité :**
- 99%+ d'extraction correcte sur fixtures DCE bien structurés.
- En cas d'ambiguïté → `not_found: true`, jamais de date inventée.
- Si `not_found: true`, le frontend affiche *"Date limite à confirmer manuellement"* avec champ éditable (cf. PRD §3.1.3).

---

### Skill #3 — `detection-doublons-versions`

**Catégorie :** upload
**Étape :** Upload
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Détecter les doublons (même fichier sous deux noms) et les nouvelles versions d'un même document ("annule et remplace", "v2", "modifié le …").

**Déclenchement :**
Sur l'ensemble des fichiers extraits après upload.

**Inputs attendus :**
- Liste des fichiers extraits, pour chacun : nom, taille, **hash SHA-256 calculé sur les bytes complets du fichier original** (pour doublons exacts), premiers 2000 caractères du texte extrait (pour détection de versions textuelles), date de modification si présente dans le ZIP.

**Outputs produits :**
- Groupes de fichiers liés
- Pour chaque groupe : fichier "canonique" (le plus récent / valide), fichiers "annulés"

**Question NotebookLM :**
"Comment, dans la pratique professionnelle des bureaux d'études BTP, détecte-t-on qu'un document du DCE est une nouvelle version d'un précédent ? Quels sont les marqueurs textuels et les patterns de nommage utilisés par les acheteurs publics ?"

**Sources NotebookLM suggérées :**
- Pratiques internes BE (formations)
- Exemples de modifications de DCE en cours de consultation

**Critères de qualité :**
- Doublons exacts (SHA-256 identique sur bytes complets) → détectés à 100%, déterministe.
- Détecte les nouvelles versions textuellement marquées à 95%+.
- Ne génère pas de faux positifs sur des documents légitimement similaires.

---

### Skill #4 — `detection-plateforme-depot`

**Catégorie :** upload
**Étape :** Upload
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Identifier la plateforme officielle de dépôt (PLACE, AWS, profil acheteur dédié, Maximilien, etc.) à partir du RC.

**Déclenchement :**
Après détection du RC.

**Inputs attendus :**
- Texte intégral du RC
- URL éventuellement présente dans le RC

**Outputs produits :**
- Plateforme identifiée (énuméré + libre si inconnue)
- URL canonique de la plateforme (vérifiée contre l'allowlist Synorix des plateformes officielles : PLACE, AWS Achatpublic, Maximilien, marches-securises.fr, etc.)
- Si l'URL extraite ne correspond à AUCUNE plateforme connue → retourner uniquement le libellé textuel, jamais l'URL brute.
- Source citée

**Question NotebookLM :**
"Quelles sont toutes les plateformes de dépôt d'offres marchés publics en France en 2026 ? Comment chacune est-elle citée dans un RC ? Quels sont les URLs canoniques et les variantes ?"

**Sources NotebookLM suggérées :**
- Annuaire des profils d'acheteur (data.gouv)
- Documentation PLACE, AWS, Maximilien
- Articles experts marchés publics

**Critères de qualité :**
- Couvre les 10+ plateformes les plus fréquentes.
- En cas d'inconnu, retourne le libellé brut sans inventer.
- **Sécurité :** une URL extraite du DCE n'est jamais affichée cliquable à l'utilisateur sans validation contre l'allowlist. Le frontend résout le nom canonique vers l'URL officielle stockée côté Synorix.

---

### Skill #5 — `detection-visite-obligatoire`

**Catégorie :** upload
**Étape :** Upload
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Détecter si la consultation impose une **visite obligatoire de site**, et le cas échéant extraire date, heure, lieu, modalités d'inscription, sanction en cas de non-visite.

**Déclenchement :**
Sur le RC et le CCAP.

**Inputs attendus :**
- Texte intégral RC + CCAP

**Outputs produits :**
- `isMandatory: bool`
- Date(s), heure(s), lieu, modalités d'inscription
- Sanction explicitée (souvent : "candidature irrecevable")
- Source citée

**Question NotebookLM :**
"Comment une visite de site obligatoire est-elle stipulée dans un RC ou CCAP français ? Quelles sont les formulations qui font qu'elle est obligatoire vs facultative ? Quelles conséquences exactes si non respectée ?"

**Sources NotebookLM suggérées :**
- Jurisprudence tribunaux administratifs (rejets d'offres pour non-visite)
- Guides DAJ
- CCAG-T 2021

**Critères de qualité :**
- Distingue correctement obligatoire / facultative / fortement recommandée.
- Extrait la sanction quand exprimée.

---

> **Note on real-time progress display:** Synorix does NOT estimate pipeline duration with an AI skill (the estimation problem is fundamentally noisy and a wrong estimate erodes trust). Instead, the pipeline emits live named-step events via SSE — see PRD §3.3.7 and ARCHITECTURE §5.

---

## Step 2 — Lot Detection (4 skills)

### Skill #6 — `recherche-lots`

**Catégorie :** lots
**Étape :** Lots
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Détecter tous les lots du marché, par double-source (RC + DPGF), avec un scoring de confiance **interne uniquement** (jamais exposé à l'utilisateur).

**Déclenchement :**
Après upload et classification réussie d'au moins un RC ou une DPGF.

**Inputs attendus :**
- Texte du RC
- Structure de la DPGF (lignes, sections)
- Texte du CCAP si disponible

**Outputs produits :**
- Liste de lots : numéro, intitulé, source d'extraction (RC / DPGF / les deux)
- Score de confiance interne (0.0–1.0) **persisté dans `skill_invocations.metadata`, jamais exposé à l'UI** (cf. PRD §3.2.3 + ARCHITECTURE §4).

**Question NotebookLM :**
"Comment les bureaux d'études professionnels détectent-ils la structure des lots d'un marché public BTP ? Comment réconcilient-ils les divergences entre le RC et la DPGF ? Quels sont les patterns de numérotation rencontrés (numérique, lettré, tranches, sous-lots) ?"

**Sources NotebookLM suggérées :**
- Méthodologies BE (formations)
- DCE réels multi-lots (10+)
- Guides DAJ

**Critères de qualité :**
- 95%+ de précision sur DCE bien structurés.
- Détecte les conventions atypiques (lots lettrés, tranches conditionnelles, sous-lots).

---

### Skill #7 — `detection-corps-de-metier-lot`

**Catégorie :** lots
**Étape :** Lots
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Identifier le corps de métier principal de chaque lot (façade, gros œuvre, électricité, CVC, plomberie, peinture, VRD, menuiserie, étanchéité, ITE).

**Déclenchement :**
Pour chaque lot détecté.

**Inputs attendus :**
- Intitulé du lot
- Premier paragraphe du CCTP du lot

**Outputs produits :**
- Corps de métier principal : `'facade' | 'gros_oeuvre' | 'electricite' | 'cvc' | 'plomberie' | 'peinture' | 'vrd' | 'menuiserie' | 'etancheite' | 'ite' | 'autre'` (10 corps mappés aux skills expertes du Step 3 + `'autre'` avec libellé libre)
- Si `'autre'`, le champ `libelle_libre: string` doit être renseigné.
- Corps de métier secondaires éventuels (même énuméré)

**Question NotebookLM :**
"Quelle est la taxonomie professionnelle des corps de métier BTP en France ? Comment chaque corps de métier est-il typiquement intitulé dans un lot de marché public ?"

**Sources NotebookLM suggérées :**
- Référentiel CAPEB / FFB
- Codes NAF BTP

**Critères de qualité :**
- Mappe systématiquement vers l'un des 10 corps de métier ayant une skill experte dédiée en Step 3, ou retourne `'autre'` avec un libellé libre — jamais d'invention de catégorie hors mapping.
- Pas d'invention sur des intitulés ambigus → retourne `'autre'` + libellé libre.

---

### Skill #8 — `extraction-description-lot`

**Catégorie :** lots
**Étape :** Lots
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire la description précise et synthétique de chaque lot depuis le CCTP du lot.

**Déclenchement :**
Pour chaque lot, après que sa documentation a été identifiée.

**Inputs attendus :**
- CCTP complet du lot
- Intitulé du lot

**Outputs produits :**
- Description synthétique (3-5 phrases)
- Liste des prestations clés
- Montant estimé si présent

**Question NotebookLM :**
"Quelle est la structure type d'un CCTP de lot BTP ? Où trouver la description synthétique des prestations ? Quels mots-clés signalent les prestations principales vs accessoires ?"

**Sources NotebookLM suggérées :**
- CCTP réels (10+ par corps de métier)
- Normes NF DTU

**Critères de qualité :**
- Description fidèle au CCTP, jamais inventée.
- Source citée systématiquement.

---

### Skill #9 — `detection-incoherences-lots`

**Catégorie :** lots
**Étape :** Lots
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Alerter en cas d'incohérence matérielle entre les lots listés dans le RC et ceux présents dans la DPGF.

**Déclenchement :**
Après détection des lots par les deux sources.

**Inputs attendus :**
- Lots détectés depuis RC
- Lots détectés depuis DPGF

**Outputs produits :**
- Liste des incohérences (lot présent d'un côté, absent de l'autre, renommé, etc.)
- `severity: 'critical' | 'warning' | 'info'` — aligné sur l'échelle de sévérité globale du PRD §7.2.1 :
  - `critical` : incohérence matérielle (lot dans RC mais pas dans DPGF, ou inverse — risque de rejet)
  - `warning` : renommage substantiel du lot entre RC et DPGF
  - `info` : différence cosmétique (casse, ponctuation, accents)

**Question NotebookLM :**
"Dans la pratique, quelles incohérences entre RC et DPGF sont matérielles (risque de rejet) vs cosmétiques (simple renommage) ? Quelle est la jurisprudence en cas de divergence ?"

**Sources NotebookLM suggérées :**
- Jurisprudence (tribunaux administratifs)
- Guides DAJ
- Forums experts marchés publics

**Critères de qualité :**
- Pas de surinflation des alertes (seuil de matérialité respecté).
- Ne déclenche pas d'alerte pour de simples reformulations.
- Le frontend ne surface une alerte utilisateur QUE pour `critical`. Les niveaux `warning` et `info` restent en log interne et accessibles via le Coach sur demande.

---

## Step 3 — AI Analysis (26 skills)

### Catégorie A — Extraction (4 skills)

### Skill #10 — `extraction-exigences-administratives`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire toutes les exigences administratives du DCE (pièces à fournir : Kbis, attestations URSSAF, fiscale, assurance décennale, RIB, déclaration sur l'honneur, etc.).

**Déclenchement :**
Après ouverture de Step 3, sur le RC, CCAP, et tout document administratif détecté.

**Inputs attendus :**
- Texte complet du RC + CCAP + AE

**Outputs produits :**
- Liste structurée : `{type_piece, description, page_source, document_source, categorie: "admin"}`

**Question NotebookLM :**
"Quelle est la liste exhaustive des pièces administratives potentiellement demandées dans un marché public BTP français ? Pour chaque pièce : nom canonique, description, durée de validité requise, alternatives acceptées."

**Sources NotebookLM suggérées :**
- Guides DAJ
- Code de la commande publique (articles relatifs aux candidatures)
- Vade-mecum acheteurs

**Critères de qualité :**
- Rappel ≥ 95% sur fixtures.
- Aucune invention d'exigence non présente dans le DCE.

---

### Skill #11 — `extraction-pieces-offre`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire toutes les pièces constitutives de l'offre (AE signé, DPGF complétée, BPU complété, mémoire technique, planning, organigramme, etc.) — distinctes des exigences administratives.

**Déclenchement :**
Step 3, sur RC, CCAP, AE.

**Inputs attendus :**
- Texte du RC, CCAP, AE

**Outputs produits :**
- Liste structurée : `{nom_piece, description, format_attendu, page_source, categorie: "offre"}`

**Question NotebookLM :**
"Quelle est la distinction exacte entre 'pièces de la candidature' (administratives) et 'pièces de l'offre' dans un marché public BTP ? Liste exhaustive des pièces de l'offre attendues, avec leur format précis."

**Sources NotebookLM suggérées :**
- Guides DAJ
- CCAG-T 2021
- DCE réels (10+)

**Critères de qualité :**
- Distinction admin / offre nette.
- Format attendu extrait correctement (.docx, .pdf, papier, électronique).

---

### Skill #12 — `extraction-exigences-techniques`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire toutes les exigences techniques du CCTP (méthodologie, matériaux, qualifications, certifications, normes, échéances intermédiaires).

**Déclenchement :**
Step 3, sur le CCTP du lot sélectionné.

**Inputs attendus :**
- Texte complet du CCTP du lot

**Outputs produits :**
- Liste structurée des exigences techniques avec source page

**Question NotebookLM :**
"Quels types d'exigences techniques rencontre-t-on dans un CCTP BTP ? Comment les classifier (qualification, certification, norme produit, méthodologie, performance) ? Quelles sont les NF DTU les plus fréquemment citées par corps de métier ?"

**Sources NotebookLM suggérées :**
- Référentiel NF DTU
- CCTP réels par corps de métier (10+ par CdM)
- Guides AQC (Agence Qualité Construction)

**Critères de qualité :**
- Rappel ≥ 90% sur fixtures.
- Classification correcte par sous-type.

---

### Skill #13 — `extraction-criteres-jugement`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Extraire les critères de jugement des offres avec leurs **pondérations exactes** (ex. Prix 40% / Valeur technique 50% / Délai 10%) et les sous-critères s'ils existent.

**Déclenchement :**
Step 3, sur le RC.

**Inputs attendus :**
- Texte complet du RC

**Outputs produits :**
- Liste : `{critere, ponderation, sous_criteres: [...], formule_prix_si_applicable, source}`

**Question NotebookLM :**
"Comment sont structurés les critères de jugement dans un RC français ? Quelles formules de notation du prix sont utilisées (linéaire, inversement proportionnelle, etc.) ? Que faire si les pondérations ne sont pas explicitement données ?"

**Sources NotebookLM suggérées :**
- Code de la commande publique (articles sur la pondération)
- Jurisprudence sur les critères de jugement
- Guides DAJ

**Critères de qualité :**
- Extraction des pondérations à 100% quand explicitement données.
- Identification correcte de la formule de notation du prix.

---

### Catégorie B — Détection alertes (4 skills)

### Skill #14 — `detection-visite-obligatoire` (Analyse-side)

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Surface dans la zone 1 (bandeau) si une visite obligatoire est requise. Réutilise les outputs de la skill #5 mais formatte pour affichage critique.

**Note :** *Cette skill est distincte de #5 — #5 fait l'extraction au moment de l'upload, celle-ci affine et formatte pour l'écran d'analyse.*

**Déclenchement :**
Au rendu de Step 3.

**Inputs attendus :**
- Outputs de la skill #5

**Outputs produits :**
- Bloc UI : date, heure, lieu, modalités, sanction, lien vers contact

**Question NotebookLM :**
"Comment formuler une alerte 'visite obligatoire' pour un professionnel BTP français, en restant factuel, premium, et action-oriented ?"

**Sources NotebookLM suggérées :**
- Best practices UX SaaS B2B
- Témoignages utilisateurs BE

**Critères de qualité :**
- Information complète, ton premium-silent (cf. PRD §7).

---

### Skill #15 — `detection-cautionnement-garanties`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Détecter et chiffrer le cautionnement requis, la retenue de garantie, la garantie de parfait achèvement, la garantie décennale, et toute autre garantie financière exigée.

**Déclenchement :**
Step 3, sur le RC + CCAP.

**Inputs attendus :**
- Texte RC + CCAP

**Outputs produits :**
- Pour chaque garantie : `{type, taux_ou_montant, base_de_calcul, modalites, source}`

**Question NotebookLM :**
"Quelles garanties financières peut exiger un acheteur public BTP français ? Pour chacune : régime juridique, taux usuel, modalités de constitution, modalités de libération, et formulations exactes rencontrées."

**Sources NotebookLM suggérées :**
- CCAG-T 2021 (articles 122-126)
- Code de la commande publique
- Notes DAJ
- Pratiques BE

**Critères de qualité :**
- Distinction nette entre cautionnement, RG, GPA, garanties spécifiques.
- Calcul de base correct (HT vs TTC).

---

### Skill #16 — `detection-pieges-dce`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Détecter les **pièges classiques** d'un DCE (délais fermes sans intempéries, pénalités déséquilibrées, clauses léonines, exigences hors marché, qualifications introuvables, dérives possibles).

**Déclenchement :**
Step 3, sur tous les documents.

**Inputs attendus :**
- Texte intégral du DCE

**Outputs produits :**
- Liste des pièges détectés : `{type, gravite, description, source}`

**Question NotebookLM :**
"Quels sont les 'pièges' classiques rencontrés dans les DCE BTP ? Donne-moi les 30+ pièges les plus fréquents, classés par gravité, avec leurs formulations types et la jurisprudence éventuelle."

**Sources NotebookLM suggérées :**
- Retours d'expérience BE et entreprises ayant perdu des marchés
- Jurisprudence des tribunaux administratifs
- Articles experts marchés publics

**Critères de qualité :**
- Couverture des 30+ pièges typés.
- Pas de cris au loup — chaque alerte est étayée.

---

### Skill #17 — `detection-incoherences-dce`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Détecter les incohérences matérielles entre les pièces du DCE (ex. délai différent dans RC vs CCAP, pondérations qui ne totalisent pas 100%, lot manquant dans la DPGF).

**Déclenchement :**
Step 3, après extraction par toutes les skills précédentes.

**Inputs attendus :**
- Outputs structurés des skills #10–#15

**Outputs produits :**
- Liste des incohérences matérielles + suggestion d'action (demander une précision à l'acheteur, etc.)

**Question NotebookLM :**
"Quelles incohérences inter-pièces d'un DCE sont matérielles (peuvent entraîner contestation ou rejet) ? Quel est le bon réflexe pour le candidat : demander une précision ? Signaler par recours ?"

**Sources NotebookLM suggérées :**
- Jurisprudence
- Guides DAJ
- CCAG-T 2021

**Critères de qualité :**
- Identifie les incohérences matérielles à 90%+.
- Suggestion d'action toujours fournie.

---

### Catégorie C — Liaisons & enrichissement (5 skills)

### Skill #18 — `liaison-coffre-fort`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Pour chaque exigence administrative extraite, chercher dans le coffre-fort de l'entreprise un document correspondant, et déterminer s'il est valide.

**Déclenchement :**
Step 3, pour chaque output de #10.

**Inputs attendus :**
- Type d'exigence (output de #10)
- Index du coffre-fort de l'utilisateur

**Outputs produits :**
- Pour chaque exigence : `{statut: matched_valid | matched_expired | unmatched, document_id_lié, expiration}`

**Question NotebookLM :**
"Comment apparier sémantiquement un type d'exigence DCE (ex. 'attestation URSSAF de moins de 6 mois') à un document du coffre-fort de l'entreprise ? Quels sont les pièges d'appariement (faux positifs, synonymes) ?"

**Sources NotebookLM suggérées :**
- Pratiques BE (gestion des coffres-forts numériques)

**Critères de qualité :**
- 0 faux positif (mieux vaut un "unmatched" qu'un mauvais matching).
- Validation d'expiration fiable.

---

### Skill #19 — `enrichissement-source-document`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Pour chaque exigence extraite, garantir la citation **document + numéro de page exact** où elle est référencée.

**Déclenchement :**
Step 3, en post-traitement des skills d'extraction.

**Inputs attendus :**
- Exigence extraite avec offset texte
- Mapping offset → page

**Outputs produits :**
- `{document, page, offset_debut, offset_fin}`

**Question NotebookLM :**
"Comment, dans un PDF DCE multi-pages, identifier de manière fiable le numéro de page (page imprimée, pas page logique) d'une chaîne de texte ?"

**Sources NotebookLM suggérées :**
- Documentation PDF (PyMuPDF, pdfplumber)

**Critères de qualité :**
- Page correcte à 99%+ sur fixtures.

---

### Skill #20 — `surlignage-exigence-complete`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Quand l'utilisateur clique sur la source d'une exigence, surligner **la phrase complète** dans le PDF — pas juste le début. Gère les ruptures de ligne, la hyphenation, les colonnes multiples.

**Déclenchement :**
Au clic utilisateur sur `📍 RC page 4` dans Zone 3.

**Inputs attendus :**
- Référence d'exigence (#19)
- PDF source

**Outputs produits :**
- Coordonnées de tous les rectangles de surlignage couvrant la phrase complète

**Question NotebookLM :**
"Quelle est la meilleure technique pour surligner une phrase complète dans un PDF, sachant qu'elle peut s'étendre sur plusieurs lignes, contenir des césures, et être dans une mise en page multi-colonnes ?"

**Sources NotebookLM suggérées :**
- Documentation PyMuPDF (search_for, get_text("dict"))
- Articles techniques PDF.js highlighting

**Critères de qualité :**
- Surligne la phrase entière, pas juste le début.
- Multi-couleur selon catégorie (bleu / orange / vert / rouge).

---

### Skill #21 — `detection-documents-a-completer`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Identifier parmi les documents du DCE ceux qui sont **des templates** à compléter par l'entreprise (DPGF, BPU, DC1, DC2, AE, attestations templates, etc.).

**Déclenchement :**
Step 3, sur l'ensemble des documents extraits.

**Inputs attendus :**
- Liste des documents avec leur type (output de #1)
- Premières pages de chaque document

**Outputs produits :**
- Liste des documents à compléter avec leur format d'édition (tableau / Cerfa / texte libre)

**Question NotebookLM :**
"Quels documents d'un DCE BTP sont systématiquement des templates à compléter par le candidat ? Pour chacun, quel est le format d'édition usuel (tableau Excel, formulaire Cerfa, texte) ?"

**Sources NotebookLM suggérées :**
- Liste des Cerfa DC1/DC2/AE et leurs équivalents 2026
- Exemples de DPGF / BPU
- Pratiques BE

**Critères de qualité :**
- Détecte 100% des templates standards.
- Identifie correctement le format d'édition.

---

### Skill #22 — `validation-completude-document`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Pour chaque document édité dans Synorix (DPGF, Cerfa, etc.), détecter si l'utilisateur l'a réellement complété (cases remplies, signature présente, totaux non nuls).

**Déclenchement :**
À chaque modification du document édité (auto-save).

**Inputs attendus :**
- Snapshot du document édité

**Outputs produits :**
- `isComplete: bool`
- Liste des champs manquants si incomplet

**Question NotebookLM :**
"Pour une DPGF / BPU / Cerfa donné, quels sont les champs **obligatoires** (rejet si vides) vs facultatifs ? Comment détecter la présence d'une signature ?"

**Sources NotebookLM suggérées :**
- Cerfa officiels (DC1, DC2, AE 2026)
- Pratiques BE

**Critères de qualité :**
- 0 faux "complete" (un document marqué complet doit l'être).

---

### Catégorie D — Synthèse (2 skills)

### Skill #23 — `synthese-executive-dce`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Produire le **bandeau infos clés** (zone 1 de Step 3) : date limite, nom chantier, critères + pondérations, visite, cautionnement, garanties, nombre de pièges détectés.

**Déclenchement :**
Step 3, après que les skills #10–#17 ont produit leurs outputs.

**Inputs attendus :**
- Outputs structurés des skills #2, #4, #5, #13, #15, #16

**Outputs produits :**
- Bloc UI prêt à afficher (JSON)

**Question NotebookLM :**
"Quelles sont les informations CRITIQUES à afficher en bandeau pour un professionnel BTP qui prépare une candidature ? Quel ordre de priorité ? Quel niveau de détail ?"

**Sources NotebookLM suggérées :**
- Best practices UX SaaS B2B
- Témoignages BE (info qu'ils consultent en premier)

**Critères de qualité :**
- Zéro information inventée — uniquement agrégation.
- Densité d'info élevée, ton premium-silent.

---

### Skill #24 — `calculatrice-retenue-garantie`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** aucun (calcul déterministe + UI)
**Status :** À créer

**Mission :**
Calculatrice qui, à partir du montant HT estimé et des taux extraits, calcule retenue de garantie, pénalités potentielles, intérêts de retard, cautionnement.

**Déclenchement :**
À l'ouverture de l'outil "🧮" depuis Zone 1.

**Inputs attendus :**
- Montant HT
- Taux RG, taux pénalités, base CCAG ou particulière

**Outputs produits :**
- Tableau des montants par poste

**Question NotebookLM :**
"Quelles sont les formules exactes de calcul de la RG, des pénalités de retard, des intérêts moratoires, du cautionnement, selon le CCAG-T 2021 ? Quels sont les pièges (base HT vs TTC, plafond, libération en plusieurs tranches) ?"

**Sources NotebookLM suggérées :**
- CCAG-T 2021 (articles 122-126, 139)
- Code de la commande publique
- Guides DAJ

**Critères de qualité :**
- Formules exactes, vérifiables.
- Cas particuliers (RG remplacée par garantie à première demande) supportés.

---

### Catégorie E — Experts métier (10 skills)

Chacun de ces 10 experts est une skill **spécialisée par corps de métier**. Ils sont mobilisés conditionnellement par les skills de Step 4 (méthodologie, références, etc.) selon le lot sélectionné.

### Skill #25 — `expert-facade`

**Catégorie :** expert-metier
**Étape :** Analyse (déclenche aussi Mémoire)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert numérique du métier de la façade. Connaît les techniques (ITE, bardage, enduit hydraulique, enduit organique, peinture, ravalement), les DTU applicables, les pièges, les phrases types d'un mémoire technique façade.

**Déclenchement :**
Si le lot sélectionné a corps de métier "façade".

**Inputs attendus :**
- Lot + CCTP
- Profil entreprise

**Outputs produits :**
- Analyse façade-spécifique du CCTP
- Suggestions de méthodologie
- Pièges spécifiques façade

**Question NotebookLM :**
"Pour un expert façade BTP français : quels sont les NF DTU applicables (20.1, 26.1, 42.1, 45.1, etc.) ? Quels sont les pièges fréquents (substrat, support, déformations, condensation) ? Quelles formulations gagnantes utiliser en mémoire technique ?"

**Sources NotebookLM suggérées :**
- NF DTU façade (20.1, 26.1, 42.1, 45.1)
- Mémoires gagnants façade
- Formations Cariso Façade (Adil)
- Articles AQC façade

**Critères de qualité :**
- Couvre les 5+ techniques de façade.
- Précision technique vérifiable.

---

### Skill #26 — `expert-ite`

<!-- v2.1: NF DTU 45.1 = bâtiments frigorifiques, PAS l'ITE. Référentiel opérationnel ETICS = CPT 3035 V3 (CSTB). Corrigé suite arbitrage N4/Mohamed 27/5/26. -->

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert ITE (Isolation Thermique par l'Extérieur). Connaît les systèmes (PSE, laine de roche, fibre de bois), les ATEx / ATE, les RGE Qualibat, les pièges de mise en œuvre, les arguments RGE et performance énergétique.

**Déclenchement :**
Lot corps de métier "ITE" ou "façade isolante".

**Inputs attendus :**
- Lot + CCTP

**Outputs produits :**
- Analyse ITE-spécifique
- Suggestions méthodologie + arguments thermiques

**Question NotebookLM :**
"Expert ITE BTP français : systèmes courants, CPT 3035 V3, certifications RGE Qualibat, pièges (ponts thermiques, défauts d'étanchéité), critères de performance R, λ. Quels arguments gagnants en mémoire technique ?"

**Sources NotebookLM suggérées :**
- CPT 3035 V3 (CSTB) — référentiel opérationnel ETICS sous enduit
- Référentiel RGE Qualibat
- ATEx CSTB ITE
- Mémoires gagnants ITE

**Critères de qualité :**
- Maîtrise des certifications et des seuils RGE.

---

### Skill #27 — `expert-gros-oeuvre`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert gros œuvre (fondations, structure béton, maçonnerie). Connaît les NF DTU 13, 20, 21, les Eurocodes, les phases d'exécution, les pièges (sols, contraintes sismiques, fluage).

**Déclenchement :**
Lot corps de métier "gros œuvre".

**Inputs attendus :**
- Lot + CCTP

**Outputs produits :**
- Analyse GO-spécifique, méthodologie, pièges

**Question NotebookLM :**
"Expert gros œuvre BTP français : NF DTU clés, Eurocodes EC2, phases d'exécution standards (terrassement → fondations → élévation → planchers), pièges (études de sol, sismique, fluage)."

**Sources NotebookLM suggérées :**
- NF DTU 13/20/21
- Eurocodes
- Mémoires GO

**Critères de qualité :**
- Maîtrise des étapes et des normes structurelles.

---

### Skill #28 — `expert-electricite`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert électricité bâtiment (NF C 15-100, faible courant, courants forts, sécurité incendie, IRVE).

**Question NotebookLM :**
"Expert électricité BTP français : NF C 15-100, NF C 14-100, normes IRVE, qualifications Qualifelec, phases d'exécution courantes."

**Sources NotebookLM suggérées :**
- NF C 15-100
- Référentiel Qualifelec
- Mémoires électricité

**Critères de qualité :**
- Maîtrise NF C 15-100 et certifications.

---

### Skill #29 — `expert-cvc`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert CVC (Chauffage, Ventilation, Climatisation). Connaît les pompes à chaleur, VMC double flux, RT 2012 / RE 2020, NF DTU 60, 68, 65.

**Question NotebookLM :**
"Expert CVC BTP français : NF DTU 60-65-68, RE 2020, performances pompes à chaleur, VMC, pièges (équilibrage, condensation, acoustique). Mémoire technique CVC gagnant."

**Sources NotebookLM suggérées :**
- NF DTU 60, 65, 68
- Référentiels RE 2020
- Mémoires CVC

**Critères de qualité :**
- Maîtrise RE 2020 et DTU CVC.

---

### Skill #30 — `expert-plomberie`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert plomberie sanitaire et alimentation eau. NF DTU 60.1, 60.11, normes pression, traitement de l'eau, ECS thermodynamique.

**Question NotebookLM :**
"Expert plomberie BTP français : NF DTU 60.1, 60.11, normes ACS, qualifications Qualibat plomberie, pièges (gel, légionellose, équilibrage)."

**Sources NotebookLM suggérées :**
- NF DTU 60.1, 60.11
- Référentiels Qualibat plomberie
- Mémoires plomberie

**Critères de qualité :**
- Maîtrise NF DTU et risques sanitaires.

---

### Skill #31 — `expert-peinture`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert peinture / revêtements intérieurs (NF DTU 59.1, 59.2, 59.3 ; classification COV ; supports ; finitions).

**Question NotebookLM :**
"Expert peinture intérieure BTP français : NF DTU 59.1-59.3, COV / Ecolabel, qualifications, pièges (supports, hygrométrie, accroche)."

**Sources NotebookLM suggérées :**
- NF DTU 59.1, 59.2, 59.3
- Mémoires peinture

**Critères de qualité :**
- Maîtrise DTU peinture.

---

### Skill #32 — `expert-vrd`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert VRD (Voirie et Réseaux Divers) : terrassement, voirie, réseaux EU/EP/AEP/électricité/télécom.

**Question NotebookLM :**
"Expert VRD BTP français : normes NF P 98-XXX, fascicules CCTG 70/71/2, qualifications Qualibat VRD, pièges (DT/DICT, géomètre, sol)."

**Sources NotebookLM suggérées :**
- Fascicules CCTG 70, 71, 2
- NF P 98
- Mémoires VRD

**Critères de qualité :**
- Maîtrise CCTG et DT/DICT.

---

### Skill #33 — `expert-menuiserie`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert menuiserie extérieure et intérieure : alu, bois, PVC, NF DTU 36.5, 36.1, classement AEV.

**Question NotebookLM :**
"Expert menuiserie BTP français : NF DTU 36.5 et 36.1, classement AEV, certifications Acotherm/CEKAL, pièges (étanchéité, isolation acoustique)."

**Sources NotebookLM suggérées :**
- NF DTU 36.5, 36.1
- Mémoires menuiserie

**Critères de qualité :**
- Maîtrise classement AEV et DTU.

---

### Skill #34 — `expert-etancheite`

**Catégorie :** expert-metier
**Étape :** Analyse / Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Expert étanchéité (toitures-terrasses, sous-sols) : NF DTU 43.1 / 43.3 / 43.4 / 43.5, bitume / synthétique, isolation thermique support.

**Question NotebookLM :**
"Expert étanchéité BTP français : NF DTU 43.1-43.5, qualifications Qualibat étanchéité, pièges (relevés, points singuliers, isolation inversée)."

**Sources NotebookLM suggérées :**
- NF DTU 43.1, 43.3, 43.4, 43.5
- Référentiel CSFE
- Mémoires étanchéité

**Critères de qualité :**
- Maîtrise DTU étanchéité.

---

### Catégorie F — Validation pièces (1 skill)

### Skill #35 — `validation-piece-coffre-fort`

**Catégorie :** extraction
**Étape :** Analyse
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Pour chaque document du coffre-fort, vérifier sa validité (Kbis < 3 mois, attestation URSSAF < 6 mois, attestation fiscale < 6 mois, etc.) en fonction de la date de remise des offres.

**Déclenchement :**
À chaque ouverture de Step 3 et à chaque ajout au coffre-fort.

**Inputs attendus :**
- Document du coffre-fort + sa date d'émission
- Date limite de remise (output de #2)

**Outputs produits :**
- `isValid: bool`
- `expiresAt: date`
- `warning?: "expire avant la remise"`

**Question NotebookLM :**
"Pour chaque pièce administrative d'une candidature marché public BTP français, quelle est la durée de validité exigée ? Donne-moi un tableau complet : Kbis, URSSAF, fiscale, AGEFIPH, assurance décennale, RC pro, DC2, etc."

**Sources NotebookLM suggérées :**
- Guides DAJ
- Code de la commande publique
- Pratiques BE

**Critères de qualité :**
- Tableau de validité exhaustif et à jour 2026.
- Détection correcte des pièces qui expirent avant la remise.

---

## Step 4 — Technical Memo (28 skills)

### Catégorie A — Récupération données entreprise (4 skills)

### Skill #36 — `recuperation-profil-entreprise`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Récupérer toutes les données de la rubrique `Mon entreprise` pour pré-remplir le mémoire (identité, effectifs, CA, certifications, assurances).

**Déclenchement :**
Au démarrage de Step 4.

**Inputs attendus :**
- ID utilisateur

**Outputs produits :**
- Objet `CompanyProfile` complet

**Question NotebookLM :**
"Quels sont les champs canoniques d'un profil entreprise BTP utilisés dans un mémoire technique ? Comment les présenter (ordre, format, ton) ?"

**Sources NotebookLM suggérées :**
- DC2 officiel
- Mémoires gagnants
- Pratiques BE

**Critères de qualité :**
- Tous les champs reconnus et pré-remplis correctement.

---

### Skill #37 — `selection-references-pertinentes`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Sélectionner automatiquement les références chantiers les plus pertinentes pour l'AO en cours (corps de métier, montant, récence, MOA similaire).

**Déclenchement :**
Step 4, après chargement du profil entreprise et du contexte AO.

**Inputs attendus :**
- Profil AO (corps de métier, montant estimé, type MOA)
- Toutes les références de l'entreprise

**Outputs produits :**
- Liste classée de références avec score de pertinence interne

**Question NotebookLM :**
"Pour choisir les meilleures références chantiers d'une entreprise BTP à mettre dans un mémoire technique : quels critères de sélection prioriser ? Combien en mettre ? Adil dit 'pas trop' — quelle volumétrie optimale ?"

**Sources NotebookLM suggérées :**
- Pratiques BE (Cariso et autres)
- Critères des commissions d'évaluation
- Témoignages experts (Adil, Ozcan)

**Critères de qualité :**
- Sélection pertinente sur fixtures réelles.
- Respecte la volumétrie optimale (à confier à NotebookLM).

---

### Skill #38 — `recuperation-bibliotheque-memoire`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Récupérer dans la bibliothèque mémoire de l'utilisateur les phrases types pertinentes pour la section et le corps de métier de l'AO en cours.

**Déclenchement :**
Step 4, pour chaque section générée.

**Inputs attendus :**
- Section cible (méthodologie, sécurité, etc.)
- Corps de métier
- ID utilisateur

**Outputs produits :**
- Liste de phrases candidates

**Question NotebookLM :**
"Comment organiser sémantiquement une bibliothèque de phrases types pour mémoire technique BTP, par section ET par corps de métier ? Quelle granularité (phrase, paragraphe, section entière) ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Pratiques BE

**Critères de qualité :**
- Phrases pertinentes priorisées.
- Pas d'inclusion incohérente (vs corps de métier).

---

### Skill #39 — `extraction-memoire-importe`

**Catégorie :** sidebar
**Étape :** Sidebar (Bibliothèque) — utilisée par Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Quand l'utilisateur importe un ancien mémoire (.docx, .pdf), parser sa structure, identifier les sections, tagger les paragraphes par section et corps de métier, puis stocker en bibliothèque.

**Déclenchement :**
Lors d'un upload de mémoire dans `Ma bibliothèque mémoire`.

**Inputs attendus :**
- Fichier mémoire

**Outputs produits :**
- Mémoire structuré (objet par section)
- Tags par paragraphe (section + corps de métier)

**Question NotebookLM :**
"Comment parser structurellement un mémoire technique BTP libre (Word ou PDF) pour identifier ses sections (préambule, présentation, méthodologie, sécurité, etc.) sans table des matières fiable ?"

**Sources NotebookLM suggérées :**
- 20+ mémoires BTP libres
- Articles experts mémoire technique

**Critères de qualité :**
- Identifie correctement 5+ sections classiques.
- Tags corps de métier corrects.

---

### Catégorie B — Génération par section (10 skills)

### Skill #40 — `redacteur-preambule`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Rédiger le préambule du mémoire (1 page) : contexte de la candidature, engagement de l'entreprise, esprit du document.

**Déclenchement :**
Step 4, première section générée.

**Inputs attendus :**
- Profil entreprise
- Données AO (nom chantier, MOA, lot)
- Paramètres (longueur / ton)

**Outputs produits :**
- Section préambule (markdown / docx-ready)

**Question NotebookLM :**
"Comment rédige-t-on un excellent préambule de mémoire technique BTP ? Quelles formulations sont gagnantes, quelles sont à éviter ? Quel ton (formel, engagé) ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Articles experts rédaction marchés publics

**Critères de qualité :**
- Personnalisé à l'entreprise + AO.
- Ton premium, pas générique.

---

### Skill #41 — `redacteur-presentation-entreprise`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Rédiger PARTIE A — Présentation entreprise (5-7 pages) : historique, identité, capacités, certifications, valeurs.

**Inputs attendus :**
- Profil entreprise complet

**Outputs produits :**
- PARTIE A complète

**Question NotebookLM :**
"Quelle structure adopter pour une excellente partie 'Présentation de l'entreprise' dans un mémoire technique BTP ? Quels éléments inclure / éviter ? Comment éviter le 'plaqué corporate' ?"

**Sources NotebookLM suggérées :**
- Mémoire Cariso Façade
- Mémoires gagnants
- Pratiques BE

**Critères de qualité :**
- Cohérent avec le profil saisi (zéro invention).
- Personnalisé, jamais générique.

---

### Skill #42 — `redacteur-equipe-dediee`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger la sous-section "Équipe dédiée au chantier" : conducteur de travaux, chef de chantier, compagnons, CV synthétiques.

**Inputs attendus :**
- Équipe et moyens de `Mon entreprise`
- Profil AO

**Outputs produits :**
- Sous-section complète

**Question NotebookLM :**
"Comment présenter de manière convaincante l'équipe dédiée à un chantier dans un mémoire technique BTP ? Quels éléments factuels prioriser ? Quels éléments éviter ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Critères d'évaluation commission

**Critères de qualité :**
- CV synthétiques, factuels, vérifiables.

---

### Skill #43 — `redacteur-references-chantiers`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger la section "Nos références chantiers" — tableau formaté (Année / Intitulé / Adresse / MOA / MOE / Lot / Montant HT), inspiré du format Cariso.

**Inputs attendus :**
- Références sélectionnées par #37

**Outputs produits :**
- Tableau structuré + courte intro

**Question NotebookLM :**
"Format de tableau de références chantiers le plus efficace pour mémoire technique BTP : colonnes, typographie, photos ou pas, volumétrie. Pratiques chez Cariso et autres entreprises ?"

**Sources NotebookLM suggérées :**
- Mémoire Cariso Façade
- 10+ mémoires gagnants

**Critères de qualité :**
- Format tableau respecté.
- Sélection par #37 fidèlement intégrée.

---

### Skill #44 — `redacteur-presentation-prestation`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Rédiger PARTIE B — Présentation de la prestation (4-6 pages) : compréhension du besoin, périmètre, enjeux, contraintes spécifiques du chantier.

**Inputs attendus :**
- CCTP du lot
- Plans clés
- Données AO

**Outputs produits :**
- PARTIE B complète

**Question NotebookLM :**
"Comment démontrer une excellente 'compréhension de la prestation' dans un mémoire technique BTP ? Quels signaux la commission cherche-t-elle pour distinguer une compréhension réelle d'un copier-coller du CCTP ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Critères d'évaluation commission

**Critères de qualité :**
- Reformulation experte (pas copier-coller CCTP).
- Identifie enjeux et contraintes spécifiques.

---

### Skill #45 — `redacteur-methodologie`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
PARTIE C — Méthodologie d'exécution (5-8 pages). **La section la plus pondérée par les commissions.** Phases d'exécution, choix techniques, points singuliers, autocontrôles.

**Inputs attendus :**
- CCTP du lot
- Corps de métier
- Expert métier mobilisé (skill #25–#34)
- Bibliothèque mémoire

**Outputs produits :**
- PARTIE C complète, structurée par phase chronologique

**Question NotebookLM :**
"Quelle structure 'méthodologie d'exécution' fait passer un mémoire BTP de 70/100 à 90/100 ? Quelles formulations gagnantes par corps de métier ? Quels points singuliers les commissions cherchent-elles ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants par corps de métier
- Critères d'évaluation commission
- Formations Cariso (Adil) sur la méthodologie

**Critères de qualité :**
- Chronologie d'exécution claire.
- Choix techniques justifiés.
- Points singuliers identifiés et traités.
- Autocontrôles explicités.

---

### Skill #46 — `redacteur-securite-ppsps`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger la section sécurité, et si l'option PPSPS est cochée, générer un PPSPS spécifique au chantier.

**Inputs attendus :**
- CCTP, plans, contexte chantier
- Risques identifiés
- Options de génération

**Outputs produits :**
- Section sécurité (toujours) + PPSPS (si option cochée)

**Question NotebookLM :**
"Structure type d'un PPSPS BTP français : risques chantier, équipements, formations, conduite à tenir. Quelles différences entre PPSPS et simple section sécurité du mémoire ?"

**Sources NotebookLM suggérées :**
- INRS — guides PPSPS
- Code du travail (R 4532)
- Mémoires gagnants

**Critères de qualité :**
- Conforme INRS / Code du travail.
- Spécifique au chantier, jamais générique.

---

### Skill #47 — `redacteur-environnement-soged`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger section environnement + SOGED si option cochée.

**Question NotebookLM :**
"Structure SOGED (Schéma d'Organisation et de Gestion des Déchets) BTP : flux déchets, filières, traçabilité, taux de valorisation. Réglementation 2026."

**Sources NotebookLM suggérées :**
- ADEME guides SOGED
- Code environnement (déchets BTP, REP PMCB)
- Mémoires gagnants

**Critères de qualité :**
- Conforme REP PMCB 2026.
- Quantitatif (taux de valorisation cible).

---

### Skill #48 — `redacteur-qualite-paq`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger section qualité + PAQ (Plan d'Assurance Qualité) si option cochée.

**Question NotebookLM :**
"Structure type d'un PAQ BTP : organisation qualité, points d'arrêt, autocontrôles, traçabilité, gestion non-conformités. Pratiques 2026."

**Sources NotebookLM suggérées :**
- ISO 9001 BTP
- Mémoires gagnants
- AQC

**Critères de qualité :**
- Points d'arrêt et autocontrôles explicites.

---

### Skill #49 — `redacteur-planning-gantt`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger la section planning + générer un Gantt prévisionnel si option cochée.

**Inputs attendus :**
- Délais imposés par le CCAP
- Phases d'exécution (skill #45)

**Outputs produits :**
- Section planning + image / SVG Gantt

**Question NotebookLM :**
"Conventions Gantt pour mémoires techniques BTP : granularité, jalons à montrer, gestion des intempéries, présentation visuelle gagnante."

**Sources NotebookLM suggérées :**
- Mémoires gagnants avec Gantt
- Pratiques BE

**Critères de qualité :**
- Gantt cohérent avec délais imposés.
- Lisible visuellement.

---

### Catégorie C — Options à cocher (8 skills)

### Skill #50 — `generateur-organigramme`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Générer un organigramme dédié au chantier (image SVG) à partir de l'équipe `Mon entreprise`.

**Question NotebookLM :**
"Formats d'organigramme gagnants pour mémoire technique BTP : structure, nominal vs fonctionnel, hauteur de hiérarchie, photos ou pas."

**Sources NotebookLM suggérées :**
- Mémoires gagnants

**Critères de qualité :**
- SVG lisible, intégrable .docx et .pdf.

---

### Skill #51 — `generateur-planning-gantt-option`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Variant de #49 pour les cas où la section planning n'est pas demandée mais l'utilisateur veut quand même un Gantt en annexe.

**Question NotebookLM :**
"Quand un Gantt est-il optionnel dans un mémoire BTP ? Quel format si placé en annexe ?"

**Critères de qualité :**
- Format annexe propre.

---

### Skill #52 — `generateur-photos-references`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** aucun (rendu visuel pur)
**Status :** À créer

**Mission :**
Intégrer dans le mémoire les photos de chantiers stockées dans `Mes références`, avec légendes.

**Question NotebookLM :**
"Photos de chantiers en mémoire technique BTP : quels formats, quel ratio, combien par référence, quelles légendes ? Adil n'en mettait pas, certaines entreprises oui — quand est-ce gagnant ?"

**Critères de qualité :**
- Mise en page propre, ratio respecté.

---

### Skill #53 — `generateur-ppsps`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Variant de #46 quand un PPSPS complet (et non juste une section sécurité) est demandé en pièce séparée.

**Question NotebookLM :**
"PPSPS BTP autonome (pièce séparée du mémoire) : structure réglementaire, taille, niveau de détail attendu."

**Sources NotebookLM suggérées :**
- Code du travail R 4532
- INRS

**Critères de qualité :**
- Conformité réglementaire complète.

---

### Skill #54 — `generateur-soged`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Variant de #47 quand un SOGED autonome est demandé.

**Question NotebookLM :**
"SOGED BTP autonome 2026 (intégrant REP PMCB) : structure réglementaire, taille."

**Sources NotebookLM suggérées :**
- ADEME
- REP PMCB

**Critères de qualité :**
- Conformité 2026 (REP PMCB).

---

### Skill #55 — `generateur-paq`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Variant de #48 — PAQ autonome.

**Question NotebookLM :**
"PAQ BTP autonome : structure, points d'arrêt, indicateurs qualité, plan de surveillance."

**Critères de qualité :**
- Indicateurs quantifiés.

---

### Skill #56 — `generateur-note-innovation`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Rédiger une note d'innovation spécifique au chantier — innovations techniques, organisationnelles, environnementales.

**Question NotebookLM :**
"Note d'innovation gagnante en mémoire technique BTP : quels types d'innovations valorisent réellement les commissions ? Pièges (innovation gadget vs innovation utile) ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Veille FFB / CSTB

**Critères de qualité :**
- Innovation pertinente vs gadget.

---

### Skill #57 — `generateur-note-rse`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Rédiger une note RSE — engagement social, environnemental, économique de l'entreprise pour ce chantier.

**Question NotebookLM :**
"Note RSE en mémoire technique BTP : structure, KPIs valorisés par les commissions, pièges (greenwashing)."

**Sources NotebookLM suggérées :**
- Référentiel CSR-D / CSRD
- FFB RSE

**Critères de qualité :**
- KPIs vérifiables, pas de greenwashing.

---

### Catégorie D — Édition & qualité (4 skills)

### Skill #58 — `editeur-section-regeneration`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Régénérer une section entière du mémoire après l'export d'une première version (au clic utilisateur).

**Déclenchement :**
Bouton `[Régénérer]` sur une section.

**Inputs attendus :**
- Section ciblée
- Contexte mémoire complet

**Outputs produits :**
- Nouvelle version de la section

**Question NotebookLM :**
"Comment régénérer une section spécifique d'un mémoire en gardant la cohérence avec les autres sections déjà validées ?"

**Critères de qualité :**
- Cohérence inter-sections préservée.

---

### Skill #59 — `editeur-reecriture-instruction`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Réécrire un paragraphe sélectionné selon une instruction utilisateur libre (ex. "insiste davantage sur l'environnement urbain").

**Déclenchement :**
Sélection paragraphe + bouton `[Réécrire avec instructions]`.

**Inputs attendus :**
- Paragraphe sélectionné
- Instruction utilisateur

**Outputs produits :**
- Paragraphe réécrit

**Question NotebookLM :**
"Comment interpréter une instruction libre de réécriture en mémoire technique BTP (ton, contenu, longueur) sans s'écarter du fond ?"

**Critères de qualité :**
- Instruction respectée.
- Aucune dérive factuelle.

---

### Skill #60 — `detection-phrases-risque`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Avant export, détecter dans le mémoire les phrases à risque (engagements impossibles à tenir, promesses non-quantifiables, contradictions avec le CCTP).

**Question NotebookLM :**
"Quels types de phrases dans un mémoire BTP exposent juridiquement l'entreprise (engagements absolus, promesses sans réserve, contradictions CCTP) ?"

**Sources NotebookLM suggérées :**
- Jurisprudence
- Articles juridiques BTP

**Critères de qualité :**
- Pas de surinflation, détection ciblée.

---

### Skill #61 — `suggestion-plus-values`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Suggérer des plus-values à mettre en avant pour différencier l'offre (innovation marginale, engagement de délai, certification additionnelle, etc.).

**Question NotebookLM :**
"Plus-values dans une offre BTP qui ne coûtent rien mais qui font passer une note de 70 à 85 : quelles sont-elles, par corps de métier ?"

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Témoignages experts (Adil)

**Critères de qualité :**
- Suggestions réalistes, non gadget.

---

### Catégorie E — Export & restitution (2 skills)

### Skill #62 — `exporteur-memoire-docx`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** aucun (rendu pur)
**Status :** À créer

**Mission :**
Exporter le mémoire en `.docx` éditable, avec mise en page conforme à la charte Synorix (inspirée Cariso).

**Question NotebookLM :**
"Mise en page d'un mémoire technique BTP en .docx : police, taille, marges, en-têtes, pieds de page, tableau de références, organigramme, photos. Conventions des mémoires gagnants."

**Sources NotebookLM suggérées :**
- Mémoire Cariso
- Mémoires gagnants

**Critères de qualité :**
- Mise en page identique à la prévisualisation.

---

### Skill #63 — `exporteur-memoire-pdf`

**Catégorie :** memoire
**Étape :** Mémoire
**Modèle IA recommandé :** aucun
**Status :** À créer

**Mission :**
Exporter en `.pdf` finalisé prêt pour dépôt.

**Question NotebookLM :**
"Conventions PDF pour dépôt sur PLACE / AWS : taille max, résolution images, polices embarquées, accessibilité PDF/A obligatoire ou non."

**Sources NotebookLM suggérées :**
- Documentation PLACE / AWS
- Guides DAJ

**Critères de qualité :**
- Conforme aux contraintes plateformes.

---

## Step 5 — Final Verification (8 skills)

### Skill #64 — `recherche-format-rapport-conformite`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir le format du rapport de conformité affiché à l'utilisateur (sections, ordre, criticité, ton).

**Question NotebookLM :**
"Comment les bureaux d'études BTP structurent-ils leur 'rapport de vérification' avant dépôt ? Quelles sections (pièces, signatures, formats, contenus) ?"

**Sources NotebookLM suggérées :**
- Pratiques BE
- Articles experts marchés publics

**Critères de qualité :**
- Structure claire, action-oriented.

---

### Skill #65 — `recherche-criteres-evaluation-memoire`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Connaître les critères et pondérations utilisés par les commissions d'évaluation des AO publics BTP, pour construire le Synorix Score.

**Question NotebookLM :**
"Critères réels des commissions d'évaluation des AO publics BTP français : méthodologie, moyens, sécurité, environnement, qualité, innovation, RSE. Pondérations indicatives par type de marché."

**Sources NotebookLM suggérées :**
- Procès-verbaux de commission anonymisés (si disponibles)
- Guides DAJ
- Formations experts

**Critères de qualité :**
- Pondérations crédibles et justifiées.

---

### Skill #66 — `recherche-nomenclature-fichiers-ao`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Trouver et appliquer la nomenclature de fichiers attendue (selon le RC) pour le ZIP final.

**Question NotebookLM :**
"Conventions de nommage des fichiers dans une candidature marché public BTP français : par RC, par plateforme. Pièges fréquents (espaces, accents, caractères spéciaux)."

**Sources NotebookLM suggérées :**
- Documentation PLACE / AWS
- DCE réels (10+)

**Critères de qualité :**
- Nommage conforme dans 100% des cas standards.

---

### Skill #67 — `recherche-procedures-depot-plateformes`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Pour chaque plateforme (PLACE, AWS, etc.), connaître la procédure de dépôt : étapes, chiffrement requis, certificat éventuel, contraintes de taille.

**Question NotebookLM :**
"Procédures de dépôt sur les plateformes marchés publics BTP français en 2026 : PLACE, AWS, Maximilien, autres. Étape par étape, contraintes techniques, durée typique du dépôt."

**Sources NotebookLM suggérées :**
- Documentation officielle PLACE, AWS
- Tutoriels vidéo experts

**Critères de qualité :**
- Procédure correcte et à jour 2026.

---

### Skill #68 — `detection-pieces-manquantes-vs-ao`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Vérifier que chaque pièce demandée par le DCE est présente dans le dossier prêt à déposer.

**Déclenchement :**
À l'ouverture de Step 5.

**Inputs attendus :**
- Exigences extraites (skills #10, #11)
- Contenu du dossier préparé

**Outputs produits :**
- Liste des pièces manquantes (ton positif : "À ajouter")

**Critères de qualité :**
- 0 faux négatif (toute pièce manquante est détectée).

**Question NotebookLM :**
"Comment matcher sémantiquement 'pièce demandée par le RC' avec 'pièce présente dans le dossier' en évitant les faux positifs (homonymes, synonymes) ?"

**Sources NotebookLM suggérées :**
- Pratiques BE

---

### Skill #69 — `detection-validite-pieces-administratives`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Vérifier que toutes les pièces administratives prêtes au dépôt sont **encore valides à la date de remise** (et resteront valides le jour du dépôt).

**Déclenchement :**
Step 5.

**Inputs attendus :**
- Dossier préparé + dates d'émission
- Date de remise

**Outputs produits :**
- Liste des pièces invalides ou bientôt expirées

**Question NotebookLM :**
(réutilise la table de validité de la skill #35)

**Critères de qualité :**
- 100% de détection des expirations.

---

### Skill #70 — `synorix-score-evaluateur`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Calculer le **Synorix Score** (/100) sur le mémoire technique, ventilé par axe (méthodologie / moyens / sécurité / environnement / innovation / etc.).

**Déclenchement :**
Step 5 (intégré pipeline) + page dédiée standalone.

**Inputs attendus :**
- Mémoire technique généré
- Pondérations (skill #65)

**Outputs produits :**
- Note globale + ventilation par axe
- Justifications par axe

**Question NotebookLM :**
"Comment construire un score crédible (/100) sur un mémoire technique BTP, basé sur les pratiques réelles des commissions d'évaluation ? Quelles métriques par axe ?"

**Sources NotebookLM suggérées :**
- Procès-verbaux de commission
- Mémoires notés par jurys
- Formations experts

**Critères de qualité :**
- Score reproductible (faible variance sur même input).
- Justifications transparentes.

---

### Skill #71 — `synorix-score-suggestions`

**Catégorie :** verification
**Étape :** Vérification
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Pour chaque axe noté en-dessous d'un seuil, produire 1 à 3 suggestions d'amélioration **positives et actionnables**.

**Déclenchement :**
Après calcul Synorix Score.

**Inputs attendus :**
- Score par axe + justifications

**Outputs produits :**
- Liste de suggestions ciblées

**Question NotebookLM :**
"Quelles formulations de suggestions d'amélioration sur un mémoire technique BTP sont actionnables et bien reçues (vs anxiogènes ou vagues) ?"

**Critères de qualité :**
- Suggestions concrètes (pas de "améliorez votre méthodologie").
- Ton positif (cf. PRD §7).

---

## Step 6 — Export (4 skills)

### Skill #72 — `recherche-format-zip-ao-pro`

**Catégorie :** export
**Étape :** Export
**Modèle IA recommandé :** Haiku 4.5
**Status :** À créer

**Mission :**
Définir la structure du ZIP final : sous-dossiers, ordre, racine.

**Question NotebookLM :**
"Structure de ZIP de dépôt d'AO BTP utilisée par les bureaux d'études chevronnés : un seul dossier ? Sous-dossiers par pièce ? Page de garde ? Checklist en racine ? Quelles attentes par plateforme ?"

**Sources NotebookLM suggérées :**
- Pratiques BE
- Documentation PLACE / AWS

**Critères de qualité :**
- Structure compatible avec toutes les plateformes courantes.

---

### Skill #73 — `recherche-page-garde-memoire`

**Catégorie :** export
**Étape :** Export
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Générer une page de garde pour le mémoire (logo entreprise, intitulé AO, lot, MOA, date).

**Question NotebookLM :**
"Page de garde de mémoire technique BTP : éléments obligatoires, conventions de mise en page, taille du logo, formats gagnants."

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Mémoire Cariso

**Critères de qualité :**
- Mise en page propre, professionnelle.

---

### Skill #74 — `recherche-checklist-depot-plateforme`

**Catégorie :** export
**Étape :** Export
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Produire une **checklist** (PDF ou markdown) à inclure dans le ZIP, listant chaque étape de dépôt + une coche utilisateur.

**Question NotebookLM :**
"Checklist de dépôt d'une candidature marché public BTP : quelles étapes vérifier juste avant de cliquer 'envoyer' sur PLACE / AWS ? Pièges fréquents (mauvais lot, mauvais fichier, signature manquante)."

**Sources NotebookLM suggérées :**
- Pratiques BE
- Documentation plateformes

**Critères de qualité :**
- Checklist exhaustive et synthétique.

---

### Skill #75 — `recherche-suivi-post-depot`

**Catégorie :** export
**Étape :** Export
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir le scénario de suivi post-dépôt : J+1 confirmation, J+30 relance amicale par le Coach, J+90 archivage.

**Question NotebookLM :**
"Best practices de suivi post-dépôt d'une candidature marché public BTP : timing des relances, ton, périmètre. Que demander à J+30 sans paraître intrusif ?"

**Sources NotebookLM suggérées :**
- Pratiques BE
- Témoignages utilisateurs

**Critères de qualité :**
- Timing crédible, ton aligné PRD §7.

---

## Sidebar (5 skills)

### Skill #76 — `recherche-structure-profil-entreprise-btp`

**Catégorie :** sidebar
**Étape :** Sidebar (Mon entreprise)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir la structure exacte du profil entreprise BTP (champs canoniques, validations, intégrations avec DC2).

**Question NotebookLM :**
"Profil complet d'une entreprise BTP française tel qu'utilisé dans DC2, DC1, mémoire technique, déclaration sur l'honneur. Liste exhaustive des champs, types, validations."

**Sources NotebookLM suggérées :**
- Cerfa DC1, DC2 2026
- Guides DAJ

**Critères de qualité :**
- Tous les champs DC2 couverts.

---

### Skill #77 — `recherche-format-references-chantiers`

**Catégorie :** sidebar
**Étape :** Sidebar (Mes références)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir le format optimal pour stocker et afficher les références chantiers.

**Question NotebookLM :**
"Format de référence chantier idéal pour réutilisation en mémoire BTP : champs obligatoires, champs optionnels, gestion des photos, gestion des attestations, gestion de la pondération de pertinence."

**Sources NotebookLM suggérées :**
- Mémoire Cariso
- Mémoires gagnants

**Critères de qualité :**
- Compatible Cariso et pratiques courantes.

---

### Skill #78 — `recherche-bibliotheque-phrases-memoire`

**Catégorie :** sidebar
**Étape :** Sidebar (Bibliothèque mémoire)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir la taxonomie de la bibliothèque mémoire (sections, sous-sections, corps de métier, tags).

**Question NotebookLM :**
"Taxonomie d'une bibliothèque de phrases / paragraphes / sections de mémoire technique BTP : axes de classement, niveau de granularité, métadonnées utiles pour la réutilisation automatique."

**Sources NotebookLM suggérées :**
- Mémoires gagnants
- Pratiques BE

**Critères de qualité :**
- Taxonomie cohérente, multi-axes.

---

### Skill #79 — `recherche-coffre-fort-pieces-administratives`

**Catégorie :** sidebar
**Étape :** Sidebar (Coffre-fort)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Compléter la liste des catégories du coffre-fort (au-delà des 20 catégories Cariso de base).

**Question NotebookLM :**
"Liste exhaustive des catégories de documents administratifs qu'une entreprise BTP française doit stocker pour répondre à des marchés publics en 2026. Pour chacune : alias, durée de validité, document type d'origine, alternatives admises."

**Sources NotebookLM suggérées :**
- Cerfa officiels
- Guides DAJ
- Pratiques BE (Cariso et autres)

**Critères de qualité :**
- Couverture > 30 catégories.

---

### Skill #80 — `analyse-historique-ao-entreprise`

**Catégorie :** sidebar
**Étape :** Sidebar (Mes AO)
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Analyser l'historique des AO de l'utilisateur pour produire des insights (taux de réussite, corps de métier les plus gagnants, MOA récurrents, sub-criteria à renforcer).

**Question NotebookLM :**
"Quels indicateurs sur l'historique d'AO d'une entreprise BTP sont les plus utiles pour orienter sa stratégie commerciale ? Comment les présenter sans tomber dans le 'dashboard analytics' froid ?"

**Sources NotebookLM suggérées :**
- Pratiques BE expérimentés
- Articles commercial BTP

**Critères de qualité :**
- Insights actionnables, ton premium.

---

## Synorix Coach (4 skills)

### Skill #81 — `recherche-architecture-chatbot-saas-pro`

**Catégorie :** chatbot
**Étape :** Coach
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir l'architecture conversationnelle du Coach : surfaces, modes, contexte, mémoire, gestion du multi-AO.

**Question NotebookLM :**
"Architecture d'un chatbot SaaS B2B premium en 2026 : bulle flottante vs page dédiée, gestion du contexte multi-projet, mémoire long-terme, streaming, gestion des interruptions, latence cible."

**Sources NotebookLM suggérées :**
- Best practices SaaS B2B IA
- Études UX chatbots professionnels
- Documentation Anthropic sur conversation design

**Critères de qualité :**
- Architecture validée par usage utilisateurs réels.

---

### Skill #82 — `recherche-mode-coaching-ao-btp`

**Catégorie :** chatbot
**Étape :** Coach
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Définir les patterns de coaching propres aux AO BTP : quand surfacer une suggestion, quand se taire, quand approfondir.

**Question NotebookLM :**
"Patterns de coaching pour AO BTP : à quels moments du pipeline un mentor humain interviendrait-il spontanément ? Quel ton (factuel vs encourageant) ? Quelle longueur de réponse ?"

**Sources NotebookLM suggérées :**
- Témoignages experts BE (Adil, Ozcan)
- Études UX coaching SaaS

**Critères de qualité :**
- Patterns adaptés au persona Pro et Beginner.

---

### Skill #83 — `recherche-suggestions-strategiques-ao`

**Catégorie :** chatbot
**Étape :** Coach
**Modèle IA recommandé :** Opus 4.7
**Status :** À créer

**Mission :**
Le Coach propose des suggestions stratégiques (choix de lot, sélection de références, prix, plus-values).

**Question NotebookLM :**
"Suggestions stratégiques que ferait un consultant senior expert AO BTP à une PME, à chaque étape de la candidature : choix du lot, choix des références, stratégie de prix, plus-values à mettre en avant."

**Sources NotebookLM suggérées :**
- Formations consultants AO BTP
- Témoignages experts

**Critères de qualité :**
- Suggestions concrètes, jamais bateau.

---

### Skill #84 — `recherche-suivi-resultat-ao`

**Catégorie :** chatbot
**Étape :** Coach
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer

**Mission :**
Pilote la conversation J+30 de relance amicale, puis l'analyse post-résultat (gagné / perdu) pour aider l'utilisateur à apprendre.

**Question NotebookLM :**
"Après le résultat d'un AO BTP (gagné ou perdu) : quelles questions un mentor poserait-il pour aider l'entreprise à apprendre, sans donner l'impression d'enquêter ? Quelle fréquence et quel format ?"

**Sources NotebookLM suggérées :**
- Pratiques de mentoring B2B
- Témoignages experts

**Critères de qualité :**
- Ton conforme PRD §7 (jamais "pour améliorer l'IA").

---

## Emergent V1 Skills — Notebook-validated <!-- v2.1 - notebooks 17/5/26 -->

The two skills below emerged from the validated NotebookLM notebooks N7 + N8 as **mandatory for V1**, beyond the original 84-skill catalogue. They are cross-cutting (not bound to a single pipeline step) and are documented in the PRD at §3.7.

ID gaps explanation: V1 reserves IDs #85–#88 as expansion buffer; V2 roadmap reserves #90, #91, #93, #94. The two V1 emergent skills are placed at #89 (Coach category) and #92 (Step 4 Memo category) — see §V2 Skills Roadmap below.

### Skill #89 — `cotraitance-groupement`

**Catégorie :** chatbot
**Étape :** Coach
**Modèle IA recommandé :** Sonnet 4.6
**Status :** À créer
**Notebook source :** N8 (Coach/Conseil)   <!-- v2.1 - notebooks 17/5/26 -->
**Validated :** true
**Différenciateur :** D12 (PRD §1.7)

**Mission :**
Permettre à une PME d'envisager et de structurer un *groupement momentané d'entreprises* (GME) en mode **conjoint** ou **solidaire** au sens de l'article **R2142-20 CCP**, pour répondre à des marchés > capacité individuelle. Combine pédagogie (expliquer la différence des régimes), détection (signaler proactivement quand un GME serait pertinent) et orchestration (pré-remplir DC1/DC2/DC4 pour chaque cotraitant).

**Déclenchement :**
- Proactivement par le Coach : si `lot_amount > 0.6 × company.revenue_3y[-1]` OU si une capacité R2142-1 est manquante seul mais accessible jointement.
- Manuellement : toggle « Mode Groupement » sur un projet (PRD §3.7.1).

**Inputs attendus :**
- Profil entreprise utilisateur
- Lot(s) sélectionné(s) avec montant estimé
- Exigences de capacités du DCE (issues de Skill #75 `detection-criteres-disproportionnes`)
- Liste éventuelle de partenaires habituels (sidebar — V2 ajout dans `Mon entreprise`)

**Outputs produits :**
- `is_gme_recommended: bool` + raison (montant / capacité manquante / volonté utilisateur)
- `regime_suggere: 'conjoint' | 'solidaire'` avec justification
- Liste pré-formattée DC1/DC2/DC4 par cotraitant
- Calcul des capacités combinées (CA cumulé, effectifs cumulés, références cumulées) vs exigences DCE
- Mémoire — section GME pré-rédigée (rôles, responsabilités, mandataire)

**Question NotebookLM :**
« Comment structurer un GME conjoint vs solidaire pour répondre à un marché public BTP français en 2026 ? Quels sont les pièges juridiques R2142-20 CCP, les modalités de représentation par mandataire, le partage des responsabilités, et les bonnes pratiques de présentation dans le mémoire technique ? »

**Sources NotebookLM suggérées :**
- N8 (Coach/Conseil) — onboarding PME, GME R2142-20, TCE vs allotissement
- Articles R2142-1 à R2142-20 CCP
- Pratiques BE expérimentés en cotraitance

**Critères de qualité :**
- Suggère un GME uniquement quand pertinent (pas de surinflation).
- Régime `conjoint` recommandé par défaut sauf si le DCE exige `solidaire` — alors clairement signalé.
- Si SIRET du cotraitant invalide à INSEE SIRENE (cf. ARCH §11.4), bloque la candidature et explique pourquoi.

---

### Skill #92 — `criteres-RSE-2026`

**Catégorie :** memoire
**Étape :** Mémoire (cross-cutting — alimente aussi Step 3 extraction et Step 5 vérification)
**Modèle IA recommandé :** Sonnet 4.6 (suggestions structurées sans génération longue)
**Status :** À créer
**Notebook source :** N7 (Scoring/Évaluation) + N8 (Coach/Conseil)   <!-- v2.1 - notebooks 17/5/26 -->
**Validated :** true
**Différenciateur :** D13 (PRD §1.7)

**Mission :**
Détecter les exigences RSE dans le DCE et suggérer des engagements RSE personnalisés pour le mémoire, sur les 5 catégories standards rendues mandatory par la **Loi Climat et Résilience** applicable en plein effet au **22/8/2026** : **déchets, carbone, biosourcés, insertion sociale, mobilité durable**. Toutes les suggestions sont sourcées depuis le profil entreprise utilisateur (`Mon entreprise`, `Mes références`) — jamais inventées.

**Déclenchement :**
- Step 3 (Analyse) : extraction des critères RSE du DCE.
- Step 4 (Mémoire) : génération auto-suggérée de la section RSE.
- Step 5 (Vérification) : gap analysis RSE et severity grading (🟢 / 🟡 / 🔴 selon PRD §7.2.1).

**Inputs attendus :**
- CCTP + CCAP du lot (extraction RSE)
- Profil entreprise (engagements RSE existants, certifications environnementales)
- Mémoires similaires importés (bibliothèque — phrases RSE déjà utilisées)

**Outputs produits :**
- Liste des **critères RSE détectés** dans le DCE (avec citation page + article)
- Par catégorie (déchets / carbone / biosourcés / insertion / mobilité) : suggestion d'engagement + champ `indicateur_chiffré` à remplir par l'utilisateur (jamais inventé)
- Section RSE rédigée pour intégration au mémoire
- Liste des écarts pour Step 5 (avec severity)

**Question NotebookLM :**
« Quels sont les critères RSE obligatoires des marchés publics BTP français à partir du 22/8/2026 (Loi Climat) ? Donne les 5 catégories standards, les indicateurs chiffrés attendus par les acheteurs, les certifications associées (Effinergie, BBCA, NF Habitat, etc.), les engagements gagnants en mémoire technique, et la jurisprudence récente sur l'éviction d'offres pour non-conformité RSE. »

**Sources NotebookLM suggérées :**
- N7 (Scoring/Évaluation) — RSE 2026
- N8 (Coach/Conseil) — engagements gagnants
- Loi Climat et Résilience (texte officiel)
- Mémoires gagnants ayant intégré une section RSE forte

**Critères de qualité :**
- Couvre les 5 catégories standards.
- Détecte les critères implicites RSE même quand non explicitement nommés.
- Tous les indicateurs chiffrés viennent de l'utilisateur — Synorix ne génère JAMAIS un chiffre RSE.
- Section générée < 2 pages (densité d'engagement, pas de remplissage).

---

## Skills V2 Roadmap — Notebook-emergent <!-- v2.1 - notebooks 17/5/26 -->

Four skills emerged from notebook validation but are **deferred to post-launch** (after the first won AO). They unlock post-attribution and strategic-growth flows, not the initial bid pipeline. Reserved IDs:

| ID | Name | Mission (one line) | Source notebook |
|---|---|---|---|
| #90 | `chorus-pro-facturation` | Émission de factures Chorus Pro post-attribution (obligatoire fournisseurs marchés publics) | N8 |
| #91 | `choix-TCE-vs-allotissement` | Aide à la décision : répondre Tous Corps d'État vs lot par lot | N8 |
| #93 | `sourcing-amont` | Sourcing amont — détecter les futurs AOs via signaux R2111-1 CCP | N8 |
| #94 | `strategie-croissance-MP` | Stratégie de croissance : quels lots cibler ensuite selon historique gagne/perte | N8 |

Each V2 skill carries its own future expansion of `Notebook source` and validation status. Gap IDs #85–#88 are intentionally unallocated (expansion buffer).

---

## V1 Differentiators — Mapping <!-- v2.1 - notebooks 17/5/26 -->

The 15 product differentiators defined in [PRD §1.7](./PRD_SYNORIX_V2.md) map to skills as follows. This is the canonical source for the `Différenciateur` field carried by each skill.

| Diff. | Skill(s) involved | Notebook |
|---|---|---|
| D1 | (cross-cutting — every extraction/analysis skill cites jurisprudence when relevant) | N6 |
| D2 | #74 `recherche-page-garde-memoire` + ZIP validator (Step 6 export) | N5+N6 |
| D3 | #69 `detection-pieces-manquantes-vs-ao` (signature per-piece check) | N5+N6 |
| D4 | #72 `synorix-score-suggestions` (horodatage proof of due diligence) | N6+N7 |
| D5 | #71 `synorix-score-evaluateur` (R2132-11 copie sauvegarde) | N5+N6 |
| **D6** | **#85 `simulateur-prix-DAJ`** (3 formules DAJ) — STUB | N7 |
| **D7** | **#95 `calculateur-OAB-temps-reel`** (double moyenne, L2152-5) — STUB | N7 |
| **D8** | **#86 `RAO-predictif`** (grille notation simulée) — STUB | N7 |
| D9 | #16 `detection-pieges-dce` (CE NAYMA 2024 contradictions) | N6 |
| **D10** | **#87 `detection-criteres-disproportionnes`** (L2142-1) — STUB | N1+N6 |
| **D11** | **#88 `conseil-recours-eviction`** (L551 CJA, 3 référés) — STUB | N6 |
| **D12** | **#89 `cotraitance-groupement`** (R2142-20, NEW V1) | N8 |
| **D13** | **#92 `criteres-RSE-2026`** (Loi Climat 22/8/2026, NEW V1) | N7+N8 |
| D14 | #84 `recherche-suggestions-strategiques-ao` (OAB auto-generated justification) | N7 |
| D15 | #2 `detection-date-limite` (RGE Qualibat 8632/8633 → Certibat 30/9/2026 transition) | N2 |

### Collision Flag — D6 / D8 / D10 / D11 — RESOLVED 2026-05-18

The v2.1 commit (75432a9) initially mapped four differentiators (D6, D8, D10, D11) to IDs (#75, #77, #79, #80) that turned out to be **already occupied** by existing skills (post-#6 renumber). The collision was resolved by allocating the four stubs to the expansion-buffer gap **#85–#88** that was deliberately reserved in v2.1 for exactly this kind of need:

| Diff. | Originally assumed | Existing occupant | **Final ID** |
|---|---|---|---|
| D6 | #79 | `recherche-coffre-fort-pieces-administratives` (Sidebar) | **#85** `simulateur-prix-DAJ` |
| D8 | #80 | `analyse-historique-ao-entreprise` (Sidebar) | **#86** `RAO-predictif` |
| D10 | #75 | `recherche-suivi-post-depot` (Step 6 Export) | **#87** `detection-criteres-disproportionnes` |
| D11 | #77 | `recherche-format-references-chantiers` (Sidebar) | **#88** `conseil-recours-eviction` |

D7 (`calculateur-OAB-temps-reel`) was unblocked separately by Mohamed's #82 → **#95** instruction.

The expansion buffer #85–#88, originally introduced in v2.1 (commit 75432a9) "to keep semantic numbering stable for V1 references", is now fully allocated to differentiator stubs.

### Skill #85 — `simulateur-prix-DAJ`   <!-- v2.1 - notebooks 17/5/26 -->

**Status :** 🟡 STUB (full spec to be extracted from NotebookLM in Phase 3)

| Champ | Valeur |
|---|---|
| Mission | Simuler la note prix du candidat selon les 3 formules officielles DAJ (classique, linéaire, moyenne) et identifier la formule la plus favorable. |
| Catégorie pipeline | verification |
| Étape pipeline | Step 3 Analyse IA / Step 5 Vérification |
| Modèle IA | Haiku 4.5 (calculs simples) |
| Notebook source | N7 (Scoring / Évaluation) |
| Validated | false (STUB) |
| Différenciateur | D6 |

**À compléter en Phase 3 :**

- Inputs détaillés (formule détectée dans le RC, prix candidat, prix concurrents si simulés)
- Outputs JSON Schema (note par formule, formule la plus favorable, écart)
- Prompt template
- Validation criteria
- Citation jurisprudence (si applicable — guides DAJ)

---

### Skill #86 — `RAO-predictif`   <!-- v2.1 - notebooks 17/5/26 -->

**Status :** 🟡 STUB (full spec to be extracted from NotebookLM in Phase 3)

| Champ | Valeur |
|---|---|
| Mission | Générer un Rapport d'Analyse d'Offres (RAO) prédictif simulant la grille de notation de l'acheteur public (échelle 0–5 par sous-critère + pondération + classement probable). |
| Catégorie pipeline | verification |
| Étape pipeline | Step 5 Vérification |
| Modèle IA | Sonnet 4.6 |
| Notebook source | N7 (Scoring / Évaluation) |
| Validated | false (STUB) |
| Différenciateur | D8 |

**À compléter en Phase 3 :**

- Inputs détaillés (mémoire généré, critères pondérés extraits du RC, références entreprise)
- Outputs JSON Schema (grille notée 0–5 par sous-critère, classement probable, écarts critiques)
- Prompt template
- Validation criteria (reproductibilité ≥ 90% sur scoring)
- Citation jurisprudence : R2152-6 à R2152-8 CCP

---

### Skill #87 — `detection-criteres-disproportionnes`   <!-- v2.1 - notebooks 17/5/26 -->

**Status :** 🟡 STUB (full spec to be extracted from NotebookLM in Phase 3)

| Champ | Valeur |
|---|---|
| Mission | Détecter dans le RC les critères de capacité (CA, références) disproportionnés par rapport à l'objet du marché (article L2142-1 CCP). |
| Catégorie pipeline | extraction |
| Étape pipeline | Step 3 Analyse IA |
| Modèle IA | Sonnet 4.6 |
| Notebook source | N6 (Pièges + Jurisprudence) |
| Validated | false (STUB) |
| Différenciateur | D10 |

**À compléter en Phase 3 :**

- Inputs détaillés (texte du RC, montant estimé du marché, capacités exigées)
- Outputs JSON Schema (liste critères disproportionnés, niveau de disproportion, citation article)
- Prompt template
- Validation criteria
- Citation jurisprudence : L2142-1 CCP + jurisprudence CE sur disproportion

---

### Skill #88 — `conseil-recours-eviction`   <!-- v2.1 - notebooks 17/5/26 -->

**Status :** 🟡 STUB (full spec to be extracted from NotebookLM in Phase 3)

| Champ | Valeur |
|---|---|
| Mission | Conseiller le candidat évincé sur le bon recours (référé précontractuel L551-1 CJA / référé contractuel L551-13 CJA / recours Tarn-et-Garonne CE 4/4/2014) selon le contexte temporel. |
| Catégorie pipeline | export |
| Étape pipeline | Step 6 Export (post-éviction) |
| Modèle IA | Sonnet 4.6 |
| Notebook source | N6 (Pièges + Jurisprudence) |
| Validated | false (STUB) |
| Différenciateur | D11 |

**À compléter en Phase 3 :**

- Inputs détaillés (date notification d'éviction, motif éviction, signature ou non du marché)
- Outputs JSON Schema (recours recommandé, délai, juridiction compétente, modèle requête)
- Prompt template
- Validation criteria
- Citation jurisprudence : L551-1 / L551-13 CJA + CE 4/4/2014 Tarn-et-Garonne + TA Nantes 19/5/2025 Verchéenne n°2506407

---

### Skill #95 — `calculateur-OAB-temps-reel`   <!-- v2.1 - notebooks 17/5/26 -->

**Status :** 🟡 STUB (full spec to be extracted from NotebookLM in Phase 3)

| Champ | Valeur |
|---|---|
| Mission | Calculer en temps réel le risque OAB selon la méthode de double moyenne (article L2152-5 CCP) : moyenne M1 → exclusion offres >20% M1 → seuil 0,9 × M2. Afficher gauge vert/orange/rouge avec seuil chiffré (€) et marge avant zone OAB. |
| Catégorie pipeline | verification |
| Étape pipeline | Step 5 Vérification |
| Modèle IA | Haiku 4.5 (calculs déterministes) |
| Notebook source | N7 (Scoring / Évaluation) |
| Validated | false (STUB) |
| Différenciateur | D7 |

**À compléter en Phase 3 :**

- Inputs détaillés (prix candidat, prix concurrents si simulés, montant estimé marché)
- Outputs JSON Schema (M1, M2, seuil OAB en €, marge candidat, gauge couleur)
- Prompt template (peu de prompt — calcul déterministe surtout côté backend)
- Validation criteria (équivalence avec méthode officielle DAJ)
- Citation jurisprudence : L2152-5 + R2152-3 à R2152-5 CCP + TA Nantes 19/5/2025 Verchéenne n°2506407 (rejet OAB sans contradictoire = annulation)

---

## Legacy Skills to Retire

The following 9 monolithic project skills are **deprecated** and to be deleted once their successors above ship:

| Legacy skill | Replaced by (selection) |
|---|---|
| `synorix-design-system` | (Replaced by Stack Design phase, not a single skill) |
| `analyse-dce-expert` | #10, #11, #12, #13, #17 |
| `reglementation-marches-publics` | #15, #35, #64, #65, #69 |
| `normes-dtu-btp` | #25–#34 (corps-de-métier experts) |
| `scoring-offres-expert` | #65, #70, #71 |
| `dpgf-chiffrage-expert` | #21, #22 (édition native) + future pricing skills |
| `conformite-candidature` | #64, #68, #69 |
| `memoire-technique-expert` | #40–#63 (full Step 4 stack) |
| `pieges-dce-detecteur` | #16, #17, #60 |

---

## Skills Summary Matrix

| Block | Count | Cumulative |
|---|---|---|
| Step 1 — Upload | 5 | 5 |
| Step 2 — Lots | 4 | 9 |
| Step 3 — AI Analysis | 26 | 35 |
| Step 3 — AI Analysis (stub V1) — **#87 `detection-criteres-disproportionnes`** <!-- v2.1 — D10 --> | 1 | 36 |
| Step 4 — Memo | 28 | 64 |
| Step 4 — Memo (emergent V1) — **#92 `criteres-RSE-2026`** <!-- v2.1 — D13 --> | 1 | 65 |
| Step 5 — Verification | 8 | 73 |
| Step 5 — Verification (stubs V1) — **#85** `simulateur-prix-DAJ` + **#86** `RAO-predictif` + **#95** `calculateur-OAB-temps-reel` <!-- v2.1 — D6/D8/D7 --> | 3 | 76 |
| Step 6 — Export | 4 | 80 |
| Step 6 — Export (stub V1) — **#88 `conseil-recours-eviction`** <!-- v2.1 — D11 --> | 1 | 81 |
| Sidebar | 5 | 86 |
| Coach | 4 | 90 |
| Coach (emergent V1) — **#89 `cotraitance-groupement`** <!-- v2.1 — D12 --> | 1 | **91** |

---

## Changelog

### 2.5 — 2026-05-27 (taxonomy alignment + #26 ETICS correction)

- **All 91 skills** — `Catégorie` field rewritten to one of the 9 pipeline-aware values matching the code packages (`backend/synorix/skills/<cat>/`): `upload`, `lots`, `extraction`, `expert-metier`, `memoire`, `verification`, `export`, `sidebar`, `chatbot`. Conversion table in HTML comment at the top of the file. 86 prose rewrites + 5 stub-table `Catégorie pipeline` rows added. Zero unmapped, zero manual reclassification needed.
- **Schema template** — option list updated to the 9 categories.
- **Skill #26 `expert-ite`** — corrected ETICS referential: `NF DTU 45.1` → **`CPT 3035 V3`** (NotebookLM N4 confirms NF DTU 45.1 covers bâtiments frigorifiques, not ITE). Updated in `Question NotebookLM` and `Sources NotebookLM suggérées`. HTML note added above the fiche.
- **#26 Catégorie** — `Coaching` → `expert-metier` (caught by the global pass).

### 2.4 — 2026-05-18 (final pass — all 5 differentiator stubs)

Mohamed arbitrated collision resolution: the 4 differentiator stubs blocked at #75/#77/#79/#80 are reallocated to the expansion-buffer gap #85–#88. The expansion buffer originally set in v2.1 is now fully spent.

- **Stub #85 `simulateur-prix-DAJ`** (D6) added — Step 5 Verification, Haiku 4.5, N7.
- **Stub #86 `RAO-predictif`** (D8) added — Step 5 Verification, Sonnet 4.6, N7.
- **Stub #87 `detection-criteres-disproportionnes`** (D10) added — Step 3 Analyse IA, Sonnet 4.6, N6.
- **Stub #88 `conseil-recours-eviction`** (D11) added — Step 6 Export, Sonnet 4.6, N6.
- **Stub #95 `calculateur-OAB-temps-reel`** (D7) reformatted to the table-stub format (consistent with #85–#88) + Mission refined (double moyenne explicit, gauge UX) + model changed Sonnet 4.6 → Haiku 4.5 (calculs déterministes).
- **V1 Differentiators Mapping** — D6/D8/D10/D11 lines updated to point to their final IDs (was PENDING_ID).
- **Collision Flag** section — status marked RESOLVED.
- **Skills Summary Matrix** — total 87 → 91 (5 stubs across Step 3, Step 5, Step 6).
- **Subtitle** — clarified count as "86 fully specified + 5 differentiator stubs".

### 2.3 — 2026-05-18 (later same day, patch follow-up)

Collision resolution following Mohamed's arbitration on commit 75432a9.

- **D7 — OAB calculator** unblocked: `calculateur-OAB-temps-reel` assigned to new ID **#95** (was conflicting with existing #82 `recherche-mode-coaching-ao-btp`). Stub entry added.
- **Skill #95** STUB added (Step 5 Verification, N7 source, status STUB pending Phase 3 NotebookLM extraction).
- **D6 / D8 / D10 / D11 collision flag** added in §V1 Differentiators Mapping — the originally proposed IDs (#79, #80, #75, #77) are all already occupied by other existing skills. Suggested resolution: assign to the existing expansion buffer #85, #86, #87, #88. **Pending Mohamed's arbitration.**
- **Skills Summary Matrix** — total 86 → 87 (one stub at #95 in Step 5 Verification).
- **Subtitle** — clarified count as "86 fully specified + 1 stub".

### 2.2 — 2026-05-18

Integration of 8 validated NotebookLM notebooks (193 sources) — see [NOTEBOOKS_REGISTRY.md](./NOTEBOOKS_REGISTRY.md).

- **Skill Schema** — Added 3 new fields: `Notebook source`, `Validated`, `Différenciateur`. Retrofit of the 84 existing skills is queued (one-shot Python pass against NOTEBOOKS_REGISTRY).
- **Skill #89 `cotraitance-groupement`** — NEW V1. Mode GME R2142-20 CCP. Differentiator D12. Source notebook N8.
- **Skill #92 `criteres-RSE-2026`** — NEW V1. Loi Climat 22/8/2026. Differentiator D13. Source notebooks N7+N8.
- **Skills V2 Roadmap** — Added section listing #90 Chorus Pro, #91 TCE-vs-allotissement, #93 sourcing amont, #94 stratégie croissance MP.
- **V1 Differentiators mapping** — Added section listing the 15 PRD §1.7 differentiators with skill mapping (5 carry "future" skill IDs to be formally entered post-extraction).
- **Skills Summary Matrix** — Total 84 → 86 (Step 4 +1 RSE, Coach +1 GME).

### 2.1 — 2026-05-13

- **Global Rules** — Added 4 cross-cutting rules (fail loudly, internal confidence persisted, source citation mandatory, cost-effective model selection).
- **Skill #1** — Model downgraded from Sonnet 4.6 to Haiku 4.5 (classification task on strong signal).
- **Skill #2** — Added `not_found` + `confidence` outputs, anti-hallucination rule enforced.
- **Skill #3** — Hash clarified to SHA-256 on complete file bytes.
- **Skill #4** — URL allowlist enforced for security (anti-phishing).
- **Skill #6 (`estimation-temps-analyse`)** — **REMOVED**. Replaced by real-time SSE-based progress display (PRD §3.3.7, ARCH §5). Total skills 85 → 84.
- **Skill #7 (renamed from #8) — `detection-corps-de-metier-lot`** — Output constrained to the 10 mapped corps de métier + `'autre'`.
- **Skill #9 (renamed from #10) — `detection-incoherences-lots`** — Severity enum aligned with PRD §7.2.1.

### 2.0 — 2026-05-13

- Initial release of the Skills Registry (85 skills).

---

*End of Skills Registry — Synorix v2.5*
