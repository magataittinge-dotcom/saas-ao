# Comparaison qualité mémoire — Opus 4.7 vs Sonnet 4.6 (même DCE Gueux lot 02)

**Méthode :** même pipeline réparé (4 appels par partie), même DCE (CCTP étanchéité + CCAP Gueux), même profil entreprise vide (OZDEM TEST), mêmes skills (memoire-technique-expert + scoring + rédaction) + référentiel `07-etancheite-couverture.md`. **Seule variable : le modèle.** Opus = `docs/nuit-rapport/memoire-gueux-REPARE.json` (réutilisé, non régénéré). Sonnet = `memoire-gueux-SONNET.json` (1 génération, ce test).

> ⚠️ Note de lecture : le log affiche « streaming Opus » (libellé statique du code) mais le modèle réellement appelé pour Sonnet était bien `claude-sonnet-4-6` (surcharge `gen.MODEL`, code prod non modifié) — confirmé par le coût et le compteur de tokens.

---

## ÉTAPE 2 — Tableau factuel

| Critère | OPUS 4.7 | SONNET 4.6 |
|---|---|---|
| **Sous-sections présentes** | **26/26** | **26/26** |
| **stop_reason (4 appels)** | end_turn ×4 (0 troncature) | end_turn ×4 (0 troncature) |
| **Longueur totale** | 144 275 chars · **22 007 mots** | 126 489 chars · **19 861 mots** (−10 %) |
| — preambule | 7 289 chars | 3 558 chars (−51 %) |
| — partie_a (présentation) | 39 770 chars · 5 973 mots | 28 270 chars · 4 428 mots (−26 %) |
| — partie_b (prestation) | 34 486 chars · 5 307 mots | 37 754 chars · 5 954 mots (**+9 %**) |
| — partie_c (méthodologie) | 62 726 chars · 9 612 mots | 56 903 chars · 8 940 mots (−7 %) |
| **Données entreprise inventées** | **0** | **0** |
| **[À COMPLÉTER]** | 86 | **119** (Sonnet laisse plus de champs à remplir) |
| **Temps total** | 1 074 s (~17,9 min) | 930 s (~15,5 min) |
| **Tokens sortie cumulés** | 67 892 | 47 975 |
| **Coût réel mesuré** | **≈ 6,71 $** | **≈ 0,97 $** |

### Sections Vague 2 — présence ET précision (nb d'occurrences)

| Marqueur | OPUS | SONNET | Lecture |
|---|---|---|---|
| PPSPS | 25 | 17 | présent des 2 côtés |
| **R.4532** (art. catégorisation SPS) | **1** | **0** | Opus cite `R.4532-1` ; Sonnet cite `L.4532-9`, R408, R457 mais **pas** l'article R.4532-1 |
| SOGED | 7 | 5 | présent des 2 côtés |
| **REP PMCB / AGEC** (déchets) | 92 / 5 | 41 / 3 | **Opus 2× plus dense** |
| DTU 43 (total) | 28 | 19 | Opus plus dense |
| — 43.1 / 43.3 / 43.5 | 10 / 17 / **1** | 8 / 12 / **0** | Sonnet **omet 43.5** |
| ISO 9001 | 18 | 9 | **Opus 2×** |
| PAQ | 20 | 17 | comparable |
| SPAC | 5 | 4 | comparable |

### Spécificité au DCE Gueux (mentions concrètes)

| Référence concrète | OPUS | SONNET |
|---|---|---|
| Gueux / Tilleuls / Moutier | 46 / 17 / 5 | 48 / 19 / 7 |
| école-élémentaire / Commune / ERP | 76 / 14 / 20 | 73 / 22 / 30 |
| étanchéité / couverture | 138 / 70 | 115 / **41** |
| pénalités & € HT (contraintes CCAP réelles) | **55** | 36 |
| produits cités (SOPREMA, EFIGREEN, ELASTOPHENE…) | **102** | 74 |

### Densité technique globale

| | OPUS | SONNET |
|---|---|---|
| "DTU" (toutes occurrences) | **46** | 29 |
| "NF " (normes) | **58** | 37 |
| Réf. réglementaires (Art. R/L, codes) | 11 | 15 |
| Avis Technique / ACERMI / CSTB | **112** | 81 |

**Synthèse objective :** les deux sont **complets (26/26), sans troncature, sans donnée inventée**, et **également spécifiques au projet** sur le nommage (Gueux, Tilleuls, ERP, intervenants). Sonnet **décroche sur la DENSITÉ réglementaire/technique** : ~35-50 % de citations DTU/NF/Avis Technique en moins, REP PMCB et ISO 9001 deux fois moins denses, et **2 références précises absentes** (`R.4532-1`, `DTU 43.5`). Sonnet est aussi globalement plus court (−10 %) et **plus prudent** (119 vs 86 `[À COMPLÉTER]`). Inversement, Sonnet fait partie_b (sécurité/déchets/environnement) **plus longue** qu'Opus et cite davantage ERP/Commune.

---

## ÉTAPE 3 — Extraits CÔTE À CÔTE (texte réel, ~200 mots)

### 3.1 — Préambule

**OPUS :**
> # PRÉAMBULE — Engagement de l'entreprise OZDEM TEST envers la Commune de GUEUX
> Monsieur le Maire, Mesdames et Messieurs les membres de la commission d'appel d'offres, c'est avec un intérêt tout particulier […] que notre entreprise **OZDEM TEST** (SIRET 12345678901234) répond à votre consultation pour le **Lot 02 – Étanchéité / Couverture** du marché de **Restructuration de l'école élémentaire de GUEUX – Groupe scolaire LES TILLEULS**, situé 6 rue du Moutier à GUEUX (51390), sous maîtrise d'ouvrage de la **Commune de GUEUX** (SIRET 354 063 810 00064) et maîtrise d'œuvre de l'agence **P+S** assistée des BET **LGI Structure Concept** (structure) et **AGS Ingénierie** (fluides). […] La restructuration du groupe scolaire LES TILLEULS représente bien plus qu'une simple opération de travaux : il s'agit d'un projet structurant pour la commune […]. Au travers de l'analyse approfondie du CCTP indice A du 17 mars 2026 et du CCAP, nous avons identifié que votre enjeu majeur ne réside pas uniquement dans la qualité technique de l'étanchéité, mais dans la capacité de l'entreprise du lot 02 à garantir le hors d'eau total […]

**SONNET :**
> # MÉMOIRE TECHNIQUE — Lot 02 Étanchéité / Couverture
> ### Restructuration de l'école élémentaire de GUEUX — Groupe scolaire LES TILLEULS
> **6 rue du Moutier — 51390 GUEUX** · **Maître d'ouvrage :** Commune de GUEUX (SIRET 354 063 810 00064) · **Maître d'œuvre :** P+S – SARL d'Architecture – 14 rue des Orphelins, 51100 REIMS · **BET Structure :** LGI STRUCTURE CONCEPT – Saint-Quentin · **BET Fluides :** AGS INGÉNIERIE – Villejuif · **Contrôleur technique :** AGENCIA – Reims
> Nous, la société **OZDEM TEST**, présentons par ce mémoire notre engagement formel […] pour le **Lot 02 – Étanchéité / Couverture** […]. Nous avons analysé l'intégralité des pièces du DCE — CCTP indice A du 17 mars 2026, CCAP, PGC SPS et pièces graphiques — et nous mesurons les enjeux : **un établissement scolaire en activité** : l'enjeu majeur ne se limite pas à la performance technique […] il réside dans la **protection permanente des élèves, du personnel et des locaux** pendant toute la durée du chantier. […]

*Observation : Opus = adresse formelle à la commission, plus rédigé/narratif. Sonnet = en-tête factuel structuré (adresses complètes des intervenants, dont AGENCIA contrôleur technique que l'Opus ne nomme pas ici), puis enjeux en liste. Les deux citent les vrais intervenants et le CCTP indice A du 17/03/2026.*

### 3.2 — Partie C · Méthodologie

**OPUS :**
> # C.1 — Méthodologie d'exécution détaillée — C.1.1 Préambule méthodologique
> La restructuration de l'école élémentaire LES TILLEULS de GUEUX (51390) présente une diversité technique remarquable pour le lot 02 : pas moins de **24 postes techniques** distincts […]. Notre méthodologie repose sur **5 principes directeurs** : 1. **Conformité normative absolue** : NF DTU 20.12 (supports béton), NF DTU 43.1 (étanchéité support maçonnerie), NF DTU 43.3 (étanchéité support acier), NF DTU 40.35 (couverture bac acier), NF P 30-201, Règles Professionnelles CSFE et Règles Professionnelles Toitures Végétalisées (édition novembre 2007). 2. **Hors d'eau permanent** : conformément au POSTE 2 du CCTP […]. 3. **Coordination étroite** avec le lot Gros Œuvre (réception des supports béton et acrotères), le lot Charpente bois, le lot Revêtement de façade, le lot Électricité (panneaux photovoltaïques) […]

**SONNET :**
> ## C.1 — Méthodologie détaillée d'exécution — Préambule méthodologique
> Le marché EQ2402 porte sur la restructuration de l'école élémentaire Les Tilleuls à GUEUX (51390), un bâtiment à usage d'ERP. Cette contrainte est centrale : toutes nos prestations respecteront les exigences incendie **classement Broof T3**, les règles **AM8** pour les zones supportant les panneaux photovoltaïques, et les normes NF DTU applicables. Notre intervention couvre une grande diversité de systèmes : - **Toitures-terrasses sur support béton** (postes 3,4,5,6) — bicouche SBS isolant PU 200 mm - **Toitures-terrasses sur bac acier** (postes 7,8) — système SOPRAFIX Bicouche - **Couvertures sèches panneaux sandwich** (postes 10,12) — ONDAROCK T - **Supports PV** (postes 9,11) - **Évacuations EP** (postes 13 à 17) - **Équipements de sécurité** (postes 19,20,21). […] Nous présenterons notre méthodologie poste par poste, dans l'ordre logique d'exécution. PHASE 0 — PÉRIODE DE PRÉPARATION (1 mois) […]

*Observation : Opus structure en « 5 principes directeurs » avec une liste de 6+ DTU/normes citées d'emblée et le détail des interfaces inter-lots. Sonnet cite le n° de marché (EQ2402), Broof T3, AM8, mappe précisément les postes du CCTP aux systèmes, et annonce une approche poste par poste. Les deux sont concrets ; Opus est plus dense en normes, Sonnet plus structuré par poste.*

### 3.3 — Partie B · Sécurité (PPSPS)

**OPUS :**
> ## B.5 — Sécurité
> […] sur ce chantier réalisé sur un **groupe scolaire** […]. ### Cadre réglementaire : Code du Travail, articles **L.4532-1 et suivants** (coordination SPS) ; **Art. L.4532-9** : obligation de PPSPS par chaque entreprise ; **Recommandation R408** CNAMTS (échafaudages) ; **Recommandation R457** (travail en hauteur) ; catégorisation SPS selon art. **R.4532-1**. ### PPSPS spécifique à LES TILLEULS, transmis au coordonnateur SPS d'AGENCIA dans les **30 jours suivant la notification** […] : analyse des risques spécifiques (travail en hauteur acrotères/terrasses, manutention panneaux ONDAROCK T 240 mm >25 kg/m², soudure chalumeau propane […]).

**SONNET :**
> ## B.5 — Sécurité — Hygiène — Protection de la santé — PPSPS
> Conformément à l'**article L.4532-9 du Code du travail** et aux obligations du CCAP, nous transmettons notre **PPSPS au coordonnateur SPS AGENCIA dans les 30 jours suivant la notification**. Établi en cohérence avec le **PGC** joint au DAO, **maintenu à jour**, tenu à disposition de l'Inspecteur du travail et conservé **5 ans après réception** — obligations CCAP. Pénalité rappelée : **150 € par jour de retard** pour non-respect des délais SPS (CCAP). ### Analyse des risques spécifiques au chantier de GUEUX […] #### Risque n°1 — Travail en hauteur (risque majeur) : l'ensemble des travaux du lot 02 se réalise en hauteur […]

*Observation : c'est ici que la différence de densité est la plus visible — Opus cite EN PLUS R408, R457 et `R.4532-1` (catégorisation). Sonnet est néanmoins solide et plus précis sur le contractuel CCAP (conservation 5 ans, pénalité 150 €/j, mise à jour) que cet extrait d'Opus.*

---

## ÉTAPE 4 — Verdict factuel

### Sur les critères objectifs
- **Complétude / robustesse : ÉGALITÉ.** 26/26, end_turn ×4, 0 troncature, 0 donnée inventée des deux côtés. Le pipeline réparé tient quel que soit le modèle.
- **Spécificité au DCE : ÉGALITÉ** (Gueux, intervenants, postes CCTP, contraintes ERP cités des deux côtés ; Sonnet cite même le n° marché EQ2402 et le contrôleur technique AGENCIA).
- **Où Sonnet décroche :** **densité réglementaire/technique.** −37 % de citations DTU (29 vs 46), −36 % de "NF " (37 vs 58), −28 % Avis Technique/ACERMI (81 vs 112), REP PMCB et ISO 9001 ~2× moins denses, et **2 références précises manquantes** (`R.4532-1`, `DTU 43.5`). Sonnet est aussi 10 % plus court et laisse 38 % de `[À COMPLÉTER]` en plus.
- **Où Sonnet égale ou dépasse :** partie_b plus longue, plus de mentions ERP/Commune, et rappel contractuel CCAP (5 ans, 150 €/j) parfois plus précis.

### Coût mesuré
**Opus ≈ 6,71 $ · Sonnet ≈ 0,97 $ → Sonnet est ~6,9× moins cher.** (cible modèle éco ~0,77 € ≈ ~0,83 $ : Sonnet est juste au-dessus, dans le bon ordre de grandeur ; l'écart résiduel est surtout en tokens de sortie). Temps : Sonnet 15,5 min vs Opus 17,9 min.

### Recommandation
**Décision = à Mohamed sur les extraits ci-dessus.** Factuellement :
- **Si le critère "valeur technique" du marché récompense la densité normative** (citations DTU/NF/Avis Technique exhaustives, articles SPS précis) → **Opus apporte un vrai +** (≈ +35-50 % de densité réglementaire). À réserver aux lots techniques à fort poids "valeur technique".
- **Si l'objectif est un mémoire complet, spécifique et propre à coût maîtrisé** → **Sonnet suffit** : il livre les 26 sections, reste spécifique au DCE, n'invente rien, pour **1/7 du coût**.
- **Piste HYBRIDE (recommandée à étudier)** : générer **partie_a + partie_b en Sonnet** (présentation/prestation — Sonnet y est équivalent, voire plus long) et **partie_c (méthodologie) en Opus** (là où la densité DTU/normes compte le plus pour la note technique). Le découpage par partie déjà en place rend cet hybride trivial (un modèle par segment). Coût estimé hybride ≈ 2,5-3 $ (partie_c Opus ~30k out ≈ 2,4 $ + reste Sonnet ~0,4 $).

### Fichiers
`memoire-gueux-SONNET.{md,json}` (ce test) · référence Opus : `../nuit-rapport/memoire-gueux-REPARE.{md,json}`.

---

## SUITE — Décision : full-Sonnet + prompt densité renforcé

Le test hybride (Sonnet a/b + Opus partie_c) a confirmé que le gain coût était modeste (4,12 $, −38 % seulement, car la partie chère reste Opus) et que la densité d'un run Opus unique varie (temperature dépréciée sur opus-4-7 → non figeable). **Décision : full-Sonnet**, et on récupère la densité normative **par le prompt** (le corpus DTU/Avis Technique est déjà fourni via les skills), pas par le modèle.

Changements : `_MEMOIRE_SEGMENT_MODELS` = 4× `claude-sonnet-4-6` ; `prompts.py` = consigne de densité renforcée (citer SYSTÉMATIQUEMENT NF DTU + Avis Technique/ACERMI/CSTB/Règles Pro/CNAMTS **présents dans le corpus**, avec seuils chiffrés) **+ garde anti-invention renforcée** (« citer ce qui EXISTE, jamais fabriquer » ; données entreprise en `[À COMPLÉTER]`).

### Densité partie_c — Opus-full / Sonnet-ancien / Sonnet-RENFORCÉ

| partie_c (isolée) | Opus-full | Sonnet-ancien | **Sonnet-RENFORCÉ** |
|---|---|---|---|
| mots | 9 612 | 8 940 | **10 719** |
| DTU 43.x | 18 | 11 | **13** ↑ |
| Avis Tech / ACERMI / CSTB / DTA | 62 | 24 | **36** ↑ (+50 %) |
| Règles Pro / CSFE | 9 | 1 | **7** ↑↑ |
| CNAMTS R408/R457 | 6 | 4 | **8** ↑ (> Opus) |
| REP PMCB / AGEC | 30 | 13 | **19** ↑ |
| produits cités | 41 | 30 | 19 (variance) |
| [À COMPLÉTER] | 7 | 18 | **30** (anti-invention ↑) |

→ Le renforcement rapproche nettement Sonnet d'Opus sur tous les axes réglementaires (égale/dépasse Opus sur Règles Pro et CNAMTS) ; il reste sous Opus sur le **volume brut d'Avis Techniques** (36 vs 62) — gap réduit, résidu en partie dû à la variance d'un run unique.

### ⚠️ Vérification anti-invention — 0 référence fabriquée
Les 8 références numérotées de partie_c renforcé sont **toutes présentes dans le corpus** (CCTP/CCAP + référentiels skills + liste DTU du prompt) : DTU 20.12, 40.35, 43.1, 43.3 + leurs équivalents NF P (10-203, 34-205, 84-204, 84-206). **Aucune suspecte.** 0 CA/donnée entreprise inventée ; `[À COMPLÉTER]` en hausse.

### Coût & robustesse
- **Coût réel : ≈ 1,03 $** (preambule 0,22 + a 0,18 + b 0,22 + c 0,40) → **6,71 $ → 1,03 $ = −85 %**.
- Cache full-Sonnet optimal : **1 write + 3 reads**.
- **26/26 sous-sections, end_turn ×4, 0 troncature, 0 invention.** Tests : 503 verts.

### Verdict
✅ **Full-Sonnet + prompt renforcé retenu** : densité réglementaire nettement améliorée (proche d'Opus sur la plupart des axes), **0 invention**, **~1 $** (vs 6,71 $ Opus). Le mapping reste configurable par segment — un segment pourra repasser en Opus plus tard si un marché à très fort poids « valeur technique » le justifie.

### Fichiers (suite)
`memoire-gueux-SONNET-RENFORCE.{md,json}` (run retenu) · `memoire-gueux-HYBRIDE.{md,json}` (test hybride écarté).
