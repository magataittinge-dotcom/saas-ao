# Plan de backport — Contenu des 91 skills B → moteur markdown de A

**Date :** 2026-06-01 · **Voie 2** : garder le moteur `services/ai/` (qui livre 77 exigences traçables, cf. `comparaison-AB/RESULTAT.md`) et y **injecter le contenu sourcé** des skills `synorix/skills/`.
**⚠️ Ce document est un PLAN. Aucun fichier n'a été modifié.**

---

## Étape 1 — Cartographie du moteur A (ce qu'il charge réellement)

Seuls **2 services** chargent des skills (`checklist_matcher.py` et `memoire_importer.py` n'en chargent aucun — vérifié : 0 occurrence) :

### `dce_analyzer.py` — ANALYSE (Step 3)
- `_ALWAYS_LOAD_DCE` (toujours) : **`analyse-dce-expert`**, **`reglementation-marches-publics`**, **`pieges-dce-detecteur`** → injectés dans le system prompt des 2 passes (admin + technique).
- Conditionnel selon le lot : **`normes-dtu-btp`** — chargé par **sections** (`load_skill_section`) via mots-clés du lot, sinon en entier. Inclut toujours la section « Réglementation transversale ».

### `memoire_generator.py` — MÉMOIRE (Step 4)
- `_ALWAYS_LOAD_MEMOIRE` (toujours) : **`memoire-technique-expert`**, **`scoring-offres-expert`**, **`redaction-gagnante-btp`**.
- Si l'entreprise a des références : **`references-intelligentes`**.
- Référentiel méthodo par corps de métier : **`methodologie-par-corps-de-metier/references/NN-*.md`** (`load_skill_reference`) — fichier choisi par mots-clés du lot + **`00-transversal.md`** systématiquement.

### Localisation physique (chemins réels)
`skill_loader._SKILLS_ROOT = <repo>/.claude/skills/`. Skills A = `.claude/skills/<name>/SKILL.md` (+ `references/*.md` pour la méthodo). Tailles : analyse-dce-expert 9 918 c · reglementation-marches-publics 4 977 c · pieges-dce-detecteur 17 640 c · normes-dtu-btp 6 592 c · memoire-technique-expert 12 046 c · scoring-offres-expert 3 884 c · redaction-gagnante-btp 16 043 c · references-intelligentes 14 119 c · methodologie : 9 fichiers `references/` (00-transversal + 01-facades-ite → 08-menuiseries).

### ⚠️ VÉRIF DÉPLOIEMENT — finding bloquant
**`.gitignore` ligne 26 = `.claude/`** → **les 9 skills markdown de A sont NON-TRACKÉS dans git** (vérifié `git ls-files --error-unmatch` → tous « NON-TRACKÉ »).
**Conséquence :** si le backend est déployé depuis git (Vercel/Railway/Render), `skill_loader` ne trouve aucun fichier → `load_skill()` renvoie `""` (échec silencieux gracieux, pas de crash) → **en prod, A tourne probablement SANS enrichissement skill**. Le test local « 77 exigences » a bénéficié des `.claude/skills` **locaux** ; la prod peut être dégradée.
**Implication backport :** le contenu B (`backend/synorix/skills/*/prompts/*.md`) **EST tracké** (sous `backend/`, commité). Backporter le contenu B vers une **cible trackée** (ou dégitignorer les dossiers skills concernés) **résout aussi ce trou de déploiement** — à intégrer au plan.

---

## Étape 2-3 — Mapping A ↔ B

| Skill markdown A | Chargée où (service / étape) | Skill(s) B source | Valeur ajoutée concrète de B (ce que A n'a pas) | Priorité |
|---|---|---|---|---|
| `analyse-dce-expert` | dce_analyzer / ANALYSE (toujours) | `extraction-exigences-administratives` (#10), `extraction-exigences-techniques` (#12), `extraction-pieces-offre` (#11), `extraction-criteres-jugement` (#13) | Schémas de sortie typés par champ (type_piece, validité_requise, valeur_seuil…) ; **3 formules prix DAJ** verbatim (#13) ; discipline anti-invention explicite | ANALYSE |
| `reglementation-marches-publics` | dce_analyzer / ANALYSE (toujours) | `detection-cautionnement-garanties` (#15), `calculatrice-retenue-garantie` (#24) | **CCAG-Travaux 2021 verbatim** : pénalité **1/3000 HT** (Art. 19.2.3), plafond 10 % HT, exonération 1 000 € ; RG 5 %/2 %, assiette TTC (CCP) ; intérêts BCE+8 pts + 40 € | ANALYSE |
| `pieges-dce-detecteur` | dce_analyzer / ANALYSE (toujours) | `detection-pieges-dce` (#16), `detection-incoherences-dce` (#17), `detection-criteres-disproportionnes` (#87) | Jurisprudences verbatim (CE NAYMA n°492938, TA Nantes…) ; **critères disproportionnés L2142-1 / R2142-6 (CA ≤ 2× montant)** + CE 10/4/2024 n°482722 | ANALYSE |
| `normes-dtu-btp` (sections) | dce_analyzer / ANALYSE (conditionnel lot) | 10 `expert-*` (#25-#34) : `expert-etancheite`, `expert-facade`, `expert-ite`, `expert-gros-oeuvre`, `expert-electricite`, `expert-cvc`, `expert-plomberie`, `expert-peinture`, `expert-vrd`, `expert-menuiserie` | **Seuils normés chiffrés verbatim** par métier (ex. étanchéité : SEL **e-Cahier CSTB 3680_V2**, végétalisation RP CSFE éd.3 2018 ; ITE 12 plots/m² ; Rw+Ctr) — c'est l'écart vu en A/B (B plus riche en valeurs-seuils) | ANALYSE |
| `memoire-technique-expert` | memoire_generator / MÉMOIRE (toujours) | 10 rédacteurs B (#40-#49) : preambule, presentation-entreprise, presentation-prestation, methodologie, equipe-dediee, references-chantiers, securite-ppsps, environnement-soged, qualite-paq, planning-gantt | Sections **sourcées N3** (mémoires gagnants) : méthode SPAC, tableau Contraintes=Solutions, anti-plaqué corporate, **PPSPS R.4532/L.4532-9**, **REP PMCB décret 2021-1941**, **KPI ISO 9001** chiffrés | MÉMOIRE |
| `scoring-offres-expert` | memoire_generator / MÉMOIRE (toujours) | `recherche-criteres-evaluation-memoire` (#65), `synorix-score-evaluateur` (#70), `synorix-score-suggestions` (#71) | Grille 0-5 par axe, pondérations, justification « preuve de lecture » (N7) | MÉMOIRE |
| `redaction-gagnante-btp` | memoire_generator / MÉMOIRE (toujours) | `suggestion-plus-values` (#61), `detection-phrases-risque` (#60), `redacteur-*` (formulations) | Formulations gagnantes par corps de métier ; **phrases à risque juridique** + alternatives prudentes (N6) | MÉMOIRE |
| `references-intelligentes` | memoire_generator / MÉMOIRE (si réfs) | `selection-references-pertinentes` (#37), `redacteur-references-chantiers` (#43), `recherche-format-references-chantiers` (#77) | Volumétrie **3-5 strict**, 5 critères « miroir », scoring de pertinence, format tableau Cariso/SERI | MÉMOIRE |
| `methodologie-par-corps-de-metier/references/NN-*.md` | memoire_generator / MÉMOIRE (réf. méthodo) | 10 `expert-*` (#25-#34) — mêmes sources que normes-dtu-btp côté analyse | Méthodologie d'exécution chronologique + autocontrôles + points singuliers chiffrés par métier | MÉMOIRE |

> Granularité : **1 skill A « coarse » ↔ plusieurs skills B « fines »** (ex. `analyse-dce-expert` ↔ 4 skills B ; `normes-dtu-btp` ↔ 10 experts métier).

---

## Section 1 — Enrichissements ANALYSE (chargés par dce_analyzer)
- **`reglementation-marches-publics`** ← #15/#24 : CCAG-Travaux 2021 (1/3000, 10 % HT, 1 000 €), RG assiette TTC, intérêts BCE+8 pts/40 € (CCP R2192-31/D2192-35).
- **`pieges-dce-detecteur`** ← #16/#17/#87 : jurisprudences verbatim + critères disproportionnés (L2142-1, R2142-6 « CA ≤ 2× montant », CE 10/4/2024).
- **`normes-dtu-btp`** ← #25-#34 : **seuils normés chiffrés** par métier (le point fort de B mesuré en A/B : SEL e-Cahier 3680_V2, Rw+Ctr ≥ 40 dB, R thermique, 12 plots/m²…).
- **`analyse-dce-expert`** ← #10-#13 : schémas typés + 3 formules DAJ.

## Section 2 — Enrichissements MÉMOIRE (chargés par memoire_generator)
- **`memoire-technique-expert`** ← #40-#49 (sections sourcées N3 : SPAC, Contraintes=Solutions, PPSPS R.4532, REP PMCB décret 2021-1941, KPI ISO 9001).
- **`scoring-offres-expert`** ← #65/#70/#71 (grille 0-5, pondérations N7).
- **`redaction-gagnante-btp`** ← #60/#61 (plus-values, phrases à risque N6).
- **`references-intelligentes`** ← #37/#43/#77 (3-5 réfs, critères miroir).
- **`methodologie-par-corps-de-metier/references/*`** ← #25-#34 (méthodo chronologique chiffrée).

## Section 3 — Skills B SANS équivalent A = différenciateurs (HORS backport)
À traiter comme **features produit séparées** (nouveaux endpoints/UI), pas comme injection de contenu dans A :
- **`synorix-score-evaluateur` #70 / `synorix-score-suggestions` #71** — Synorix Score /100 (page dédiée).
- **`calculateur-OAB-temps-reel` #95** — gauge OAB double moyenne L2152-5.
- **`RAO-predictif` #86** — grille notation 0-5 prédictive.
- **`detection-criteres-disproportionnes` #87** — (peut aussi enrichir pieges côté analyse).
- **`conseil-recours-eviction` #88** — recours post-éviction (L551 CJA, Tarn-et-Garonne).
- **`cotraitance-groupement` #89** — GME R2142-20.
- **`criteres-RSE-2026` #92** — 5 catégories Loi Climat.
- Toute la catégorie **`chatbot`** (#81-84, #89) — Coach.
- **`export` / `sidebar` / `verification`** structurants (#62-#80) — pipeline étapes 5-6 + sidebars.

---

## Étape 4 — Risques de régression & ordre recommandé

**Référence de non-régression : A livre 77 exigences traçables (28 CCAP + 49 CCTP) sur le DCE Gueux.** Seuil : **rester ≥ 77 exigences avec `source_page` + `source_excerpt`** après chaque injection.

| Enrichissement | Risque de régression de A | Pourquoi |
|---|---|---|
| `reglementation-marches-publics` ← #15/#24 (CCAG-T) | **Faible** | Ajout de faits normatifs cadrés ; n'altère pas la structure de sortie ni le nombre d'exigences |
| `pieges-dce-detecteur` ← #16/#17/#87 | **Faible** | Contenu additif (jurisprudences) ; déjà la skill la plus volumineuse (17 640 c) |
| `normes-dtu-btp` ← #25-#34 (seuils métier) | **Moyen** | Gros volume → surveiller la taille du prompt (budget tokens) et la sélection par section ; fort gain qualité technique |
| `methodologie-par-corps-de-metier` ← #25-#34 | **Moyen** | MÉMOIRE only — pas d'impact sur le compteur d'exigences ANALYSE |
| `memoire-technique-expert` ← #40-#49 | **Moyen** | MÉMOIRE only ; volume important → surveiller troncature mémoire |
| `scoring` / `redaction` / `references` (mémoire) | **Faible** | MÉMOIRE only, additif |
| `analyse-dce-expert` ← #10-#13 (schémas) | **Élevé** | C'est le **cœur** du prompt d'extraction qui produit les 77 exigences ; toute reformulation peut changer la structure/le compte → à traiter **en dernier, avec A/B strict** |

### Ordre recommandé (du plus sûr/fort ROI au plus risqué)
1. **`reglementation-marches-publics`** (#15/#24) — faible risque, corrige des faits (CCAG-T) ; ne touche pas l'extraction.
2. **`pieges-dce-detecteur`** (#16/#17/#87) — faible risque, additif.
3. **`normes-dtu-btp` par sections** (#25-#34) — moyen risque, **le gain qualité technique mesuré en A/B**.
4. **MÉMOIRE** : `methodologie-*`, `memoire-technique-expert`, `scoring`, `redaction`, `references` (#37/#40-#49/#61/#65/#70/#71) — n'impactent pas le compteur d'exigences ANALYSE.
5. **`analyse-dce-expert`** (#10-#13) — **en dernier**, c'est le prompt pivot des 77 exigences.

### Protocole de non-régression (à appliquer après CHAQUE skill enrichie)
1. Re-run analyse Gueux : `scripts/compare_a_analyse.py` (même CCAP + CCTP lot 02).
2. **Garde-fou : ≥ 77 exigences, 100 % avec `source_page` + `source_excerpt`.** Si < 77 ou perte de traçabilité → **rollback** de l'injection.
3. Vérifier `stop_reason=end_turn` (pas de troncature introduite par un prompt trop gros).
4. Diff qualitatif : les nouvelles réfs normées (DTU/CCAG/seuils) apparaissent-elles dans les exigences sans casser les anciennes ?

### Prérequis transverse (à régler avant tout backport)
**Résoudre le trou de déploiement `.claude/` gitignoré** : soit pointer `skill_loader` vers une cible **trackée** (ex. déplacer le contenu enrichi sous `backend/`), soit dégitignorer les 9 dossiers skills concernés. Sans cela, l'enrichissement ne partira jamais en prod (et A y tourne sans skills aujourd'hui).
