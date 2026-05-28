# Raw NotebookLM extract — Skill #26 `expert-ite`

**Captured:** 2026-05-27
**Operator:** Claude Code (build session)
**Notebooks:** N4 `Synorix - 4 - Normes DTU` (777badb4, validé 9.7/10) + N3 `Synorix - 3 - Mémoires Techniques Gagnants` (43615791, validé 9.7/10)
**Purpose:** Build-time source of truth for the `expert-ite` skill prompt. Verbatim capture for audit — the prompt is a *reformulation* of this material, never a copy-paste. Figures and references are preserved verbatim downstream.

> ⚠️ This file is the raw NotebookLM output. It is NOT loaded at runtime. The runtime prompt lives in `backend/synorix/skills/expert_metier/prompts/expert_ite.md`.

---

## Q1 — Référentiels normatifs + certifications (Notebook N4, 777badb4)

**Question posée :**
> Pour l'ITE (isolation thermique par l'extérieur), liste précisément : 1) Tous les référentiels normatifs applicables selon le procédé (ETICS sous enduit, bardage, etc.) avec leur référence exacte et leur champ d'application. 2) Les certifications obligatoires (Qualibat RGE 8632/8633, ACERMI, ATec, DTA). Sois exhaustif, format liste structurée.

**Réponse NotebookLM :**

### 1) Référentiels normatifs par procédé
- **ITE sous enduit (ETICS) :** **CPT 3035 V3** — conception et mise en œuvre des systèmes d'isolation par panneaux (PSE, laine de roche, fibre de bois) collés ou calés-chevillés recouverts d'un enduit mince ou épais. Collage par plots ≥ **12 plots/m²**, diamètre 10 cm avant écrasement.
- **ITE sous bardage rapporté :** **NF DTU 41.2** (revêtements extérieurs en bois) — bardages bois + sous-faces sur ossature, isolant + lame d'air ventilée.
- **ITE sur façade à ossature bois (HOB) :** **NF DTU 31.4**.
- **Supports :** maçonnerie → **NF DTU 20.1** ; béton → **NF DTU 21**.
- **Interfaces menuiseries :** **NF DTU 36.5** — liaison dormant/ITE, continuité étanchéité air + eau.
- **Sécurité incendie :** **Instruction Technique n°249 (IT 249)** — bandes de recoupement en laine de roche pour systèmes PSE.

### 2) Certifications et évaluations
- **Qualibat RGE ITE** — obligatoire pour aides (MaPrimeRénov'). Depuis 2020, domaine ITE distinct de l'ITI, audits spécifiques.
- **Label EQF (Engagement Qualité Façade)** — SFJF, dédié ITE par enduit sur isolant.
- **Avis Technique (ATec)** — CCFAT/CSTB, aptitude à l'emploi des procédés non traditionnels.
- **Document Technique d'Application (DTA)** — équivalent ATec pour produits marqués CE.
- **ACERMI** — certification des matériaux isolants (conductivité thermique, résistance vapeur d'eau).
- **Marquage CE** — obligatoire produits de construction.
- **Appréciation de Laboratoire (APL)** — validation solutions incendie (IT 249).
- **Vigilance :** le système n'est valide que si l'entreprise met en œuvre le **couple isolant/enduit** décrit dans l'ATec/DTA en vigueur.

---

## Q2 — Méthodologie ETICS en 4 phases (Notebook N4, 777badb4)

**Question posée :**
> Décris la méthodologie complète de mise en œuvre d'une ITE ETICS sous enduit en 4 phases [...] Pour chaque phase, cite la norme ou CPT qui l'encadre et donne les valeurs chiffrées clés.

**Réponse NotebookLM :**

### 1) Diagnostic préalable et reconnaissance du support — CPT 3035 V3 + NF DTU 20.1 / NF DTU 21
- Reconnaissance des fonds : propreté, planéité, cohésion (ne pas reprendre les défauts du subjectile).
- Humidité support **< 5 % en masse** (béton/plâtre).
- Essai d'adhérence (quadrillage ou arrachement) pour supports anciens.
- Diagnostic sanitaire : fissures, humidité, étanchéité menuiseries existantes.

### 2) Préparation du support — NF DTU 59.1 + CPT 3035 V3
- Nettoyage : élimination des particules friables, dépoussiérage, dégraissage.
- Réparations : traitement anti-corrosion des armatures apparentes, rebouchage des épaufrures.
- Planéité **≤ 5 mm sous la règle de 2 m**.
- Séchage après lavage à l'eau avant pose.

### 3) Mise en œuvre — CPT 3035 V3 + ATec + IT 249
- Conditions climatiques : température support + ambiante **entre 5 °C et 35 °C**, hygrométrie **< 80 %**.
- Collage par plots : minimum **12 plots/m²**, diamètre **≥ 10 cm avant écrasement**.
- Collage en plein/boudin tous les deux niveaux (limite lames d'air parasites) sauf bandes de recoupement laine de roche.
- PSE gris : **2 chevilles par panneau** avant prise de la colle.
- Points singuliers : continuité parfaite de l'étanchéité air + eau menuiseries (souvent posées en tunnel).
- Incendie : IT 249 → bandes de recoupement laine de roche systèmes PSE.

### 4) Contrôles et autocontrôles — recommandations AQC + Fascicule 70-2
- Autocontrôles en cours de pose : calepinage, alignement joints, présence fixations mécaniques avant enduit.
- Trame de renfort : armature fibre de verre, recouvrement minimal **50 mm** entre lés.
- Points critiques : informer le MOE lors des étapes clés (fixations critiques, linteaux).
- Dossier de preuves : photos fixations, PV serrage, fiches techniques produits certifiés (ACERMI, ATec).
- Réception : contrôle visuel final à 2 m (parois verticales), absence de spectres de joints.

---

## Q3 — Pathologies & sinistralité (Notebook N4, 777badb4)

**Question posée :**
> Quels sont les principaux désordres et pathologies observés en ITE selon les rapports AQC et SYCODÉS ? [...] Focus sur : interfaces menuiseries, sécurité incendie (IT 249), reprise des charges, étanchéité à l'air.

**Réponse NotebookLM :** *(survived 3 transient ReadTimeout retries before completing)*

1. **Interfaces menuiseries** — désordres fenêtres/portes-fenêtres (Code 60) **2× plus fréquents en ITE (12-14 %)** qu'en ITI (6 %). Cause : interfaces d'étanchéité dormant/isolant. Prévention : continuité étanchéité air+eau, calfeutrement **sur le gros œuvre** (pas la finition), coordination pose menuiseries avant ITE (drainage bavettes).
2. **Sécurité incendie (IT 249)** — incendies de façade rares (**0-1 %** des désordres décennaux) mais impact catastrophique. Cause : absence/mauvaise mise en œuvre des recoupements (effet cheminée). Prévention : IT 249 (guide v2.0 2020), bandes de recoupement laine de roche PSE, solutions validées par APL.
3. **Reprise des charges** — éléments rapportés (brise-soleil, auvents, garde-corps — Code 59) et balcons (Code 24) ressortent spécifiquement en ITE. Cause : mauvais dimensionnement fixations traversant l'isolant, sismique/vent non pris en compte, ponts thermiques. Prévention : ancrage dans le **gros œuvre** (pas le précadre ITE), supports à retenues mécaniques + liaisons souples (PAC, VMC), anticipation dès conception.
4. **Étanchéité à l'air** — ~**1 %** des désordres. Cause : passages d'air parasites aux liaisons (toiture/façade, menuiseries), conduits non obturés. Prévention : continuité plan d'étanchéité toiture/façade, soin des joints périphériques et percements.
5. **Désordres de l'enduit (ETICS, Code 51)** — **fissuration du support (40 %)** + **défauts de liaison (34 %)** = causes principales. Cause : support inadapté (humidité > 5 %, propreté), retrait enduit, comportement différentiel isolant/enduit. Prévention : temps de séchage (24h min mortier de préparation), conditions climatiques 5-35 °C, 2 chevilles/panneau PSE blanc, recouvrement armature 50 mm.

---

## Q4 — Phrases-types pour mémoire (Notebook N3, 43615791)

**Question posée :**
> Quelles sont les 8-10 formulations gagnantes (phrases-types) à utiliser dans la section méthodologie d'un mémoire technique BTP pour un lot ITE [...] phrases courtes, factuelles, qui valorisent une démarche professionnelle.

**Réponse NotebookLM :**

1. Diagnostic initial : « Nous réalisons une reconnaissance contradictoire des supports (propreté, cohésion et planéité ≤ 5 mm sous la règle de 2 m) avant toute pose, conformément au CPT 3035 V3 et au NF DTU 59.1. »
2. Fixation mécanique : « Pour le PSE gris, nous appliquons une méthodologie de pose de deux chevilles par panneau avant la prise complète du mortier-colle pour sécuriser le maintien mécanique immédiat. »
3. Densité de collage : « Nous garantissons la stabilité du système ETICS par un encollage par plots respectant une densité minimale de 12 plots par m² (diamètre 10 cm avant écrasement). »
4. Interface menuiseries : « L'étanchéité périmétrale des baies est réalisée par un calfeutrement impératif sur le gros œuvre (et non sur l'enduit) pour assurer la continuité parfaite du plan d'étanchéité à l'air et à l'eau. »
5. Sécurité incendie : « La propagation du feu en façade est neutralisée par la mise en œuvre de bandes de recoupement en laine de roche, conformément aux exigences de l'Instruction Technique n°249 et aux guides APL. »
6. Gestion thermique des teintes : « Pour prévenir les désordres esthétiques et les chocs thermiques, nous validons des finitions dont l'indice de luminance Y est supérieur à 35 %, selon le NF DTU 59.1. »
7. Reprise des charges : « Les fixations d'équipements rapportés (PAC, brise-soleil) sont ancrées directement dans la structure porteuse, en utilisant des supports avec rupteurs de ponts thermiques et liaisons souples. »
8. Continuité de l'isolant : « Nous assurons un collage en plein ou par boudin tous les deux niveaux afin de limiter les lames d'air parasites entre l'isolant et la paroi support, optimisant ainsi la performance thermique réelle. »
9. Contrôle de l'entoilage : « Nous définissons des points d'arrêt techniques lors de la pose de l'armature en fibre de verre pour vérifier un recouvrement minimal de 50 mm entre les lés, évitant toute fissuration ultérieure de l'enduit. »
10. Preuves et traçabilité : « Chaque étape critique (fixations, traitement des linteaux) fait l'objet d'un reportage photographique et d'une fiche d'autocontrôle intégrée au Dossier des Ouvrages Exécutés (DOE). »

---

## Q5 — Contrôles obligatoires & livrables (Notebook N4, 777badb4)

**Question posée :**
> Pour un chantier ITE, quels sont les contrôles obligatoires à réaliser et les livrables à produire (PV d'essais, fiches d'autocontrôle, DOE) ? Cite les articles ou normes qui les imposent.

**Réponse NotebookLM :** *(1 transient ReadTimeout retry before completing)*

### Contrôles obligatoires par phase — CPT 3035 V3 + NF DTU supports
- Avant travaux : humidité **< 5 % en masse**, essai d'adhérence (quadrillage/arrachement), planéité **≤ 5 mm sous 2 m**.
- Pendant : **12 plots/m²** (Ø 10 cm), **2 chevilles/panneau** PSE gris, bandes de recoupement laine de roche (IT 249), recouvrement entoilage **50 mm**.
- Réception : contrôle visuel à 2 m, absence de spectres.

### Livrables
- Préparation : **PAQ** (organisation, points d'arrêt), **PRE/SOGED** (déchets), **notes de calcul** (dimensionnement fixations).
- **DOE** : plans d'exécution conformes (points singuliers — appuis fenêtres, linteaux), **fiches d'autocontrôle signées**, **PV d'essais** (adhérence, serrage fixations, étanchéité air), **certifications produits** (CE, ACERMI isolant, ATec/DTA couple isolant/enduit).
- Maintenance : **notice d'entretien** au maître d'ouvrage.

### Normes imposant les contrôles
| Domaine | Référence | Rôle |
|---|---|---|
| Système ETICS | CPT 3035 V3 | Mise en œuvre sous enduit |
| Supports | NF DTU 20.1 / 21 | Tolérances gros œuvre |
| Sécurité incendie | IT 249 | Propagation feu en façade |
| Menuiseries | NF DTU 36.5 | Interfaces étanchéité |
| Peinture/Enduit | NF DTU 59.1 | Essais d'adhérence, reconnaissance fonds |
| Gestion projet | CCAG Travaux (Art. 28/40) | PAQ, fiches contrôle, DOE |

---

## Build notes (gaps / à enrichir)

- **ACERMI** : NotebookLM (Q1) signale que les extraits ne détaillent pas explicitement ACERMI au-delà de la conformité performance — `[à enrichir si une source ACERMI dédiée est ajoutée à N4]`.
- **NF DTU 45.1** : le registry #26 citait NF DTU 45.1, mais N4 a répondu CPT 3035 V3 comme référentiel ETICS principal. CPT 3035 V3 est le document opérationnel ; NF DTU 45.1 couvre l'isolation des combles/sols (à confirmer). Retenu CPT 3035 V3 + DTU supports pour le prompt — `[divergence registry vs notebook signalée à Mohamed]`.
- **Seuils R / λ** : le registry #26 mentionnait critères R, λ ; N4 n'a pas renvoyé de seuils chiffrés R/λ spécifiques ITE → laissés `[À COMPLÉTER]` dans le prompt plutôt qu'inventés.
