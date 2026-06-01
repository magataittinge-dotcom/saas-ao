# Plan d'enrichissement NotebookLM — Inventaire des manques de corpus

**Produit le :** 2026-06-01
**Périmètre :** tous les marqueurs `[À COMPLÉTER]` des prompts (`backend/synorix/skills/*/prompts/*.md`) liés à un **manque de corpus notebook**, croisés avec `docs/notebook-extracts/*.md` et `docs/phase*-progress.md`.
**Exclus (normaux, non comptés) :** `[À COMPLÉTER PAR L'ENTREPRISE]` (données entreprise), `[À COMPLÉTER — donnée DCE]` / `délai CCAP` / `structure SOPAQ imposée par le RC` / `pondération RC` / `historique insuffisant` (données fournies au runtime), `donnée à chiffrer`.

> ⚠️ Document d'inventaire **uniquement**. Aucune skill n'est modifiée.

---

## 1. Manques de corpus CONFIRMÉS (NotebookLM explicitement muet/incomplet au build)

Ce sont les gaps réels identifiés pendant la génération : NotebookLM a signalé l'absence d'information, et le contenu a été marqué `[À COMPLÉTER]` / « hors corpus » / « à vérifier ».

| Skill (#N name) | Section / fichier | Sujet manquant précis | Notebook cible | Type de source à ajouter |
|---|---|---|---|---|
| **#24 `calculatrice-retenue-garantie`** | extraction/prompts (formules) + extract #24 | N1 contient le **CCAG-MOE**, pas le **CCAG-Travaux 2021** intégral → formules **pénalités de retard / intérêts moratoires** partiellement hors corpus | **N1** | Texte officiel : **CCAG-Travaux 2021** (arrêté du 30/3/2021), notamment Art. 19/20 (pénalités, primes, retenues, intérêts moratoires) |
| **#15 `detection-cautionnement-garanties`** | extract #15 | **Base de calcul TTC** de la retenue de garantie non tranchée par le corpus (Art. 19 CCAG-T présent, mais assiette HT/TTC non confirmée) | **N1** | CCAG-Travaux 2021 + doctrine DAJ sur l'assiette de la RG |
| **#46 `redacteur-securite-ppsps`** | memoire/prompts §Obligation | **Articles exacts du Code du travail (R.4532-x)** + **seuils en jours-hommes** déclenchant la coordination SPS / l'obligation de PPSPS | **N1** | Code du travail, partie réglementaire **R.4532** (coordination SPS) ; guides **INRS** PPSPS |
| **#53 `generateur-ppsps`** | memoire/prompts §Consignes + extract variants | Idem #46 : référence Code du travail R.4532 + seuils (PPSPS autonome) | **N1** | Code du travail R.4532 ; **INRS** |
| **#47 `redacteur-environnement-soged`** | memoire/prompts §REP PMCB + extract #47 | **REP PMCB** (Responsabilité Élargie du Producteur — Produits et Matériaux de Construction du Bâtiment) : principe, éco-contribution, reprise gratuite, éco-organismes (Valobat, Ecominéro) — **non couvert** | **N4** (technique/déchets) ou **N1** (volet réglementaire) | **Code de l'environnement** (REP PMCB, art. L541-10-1) + **guides ADEME** déchets BTP + référentiels éco-organismes (Valobat, Ecominéro) |
| **#54 `generateur-soged`** | memoire/prompts §REP PMCB + extract variants | Idem #47 (SOGED autonome 2026) | **N4** / **N1** | Code de l'environnement REP PMCB + ADEME |
| **#48 `redacteur-qualite-paq`** | memoire/prompts §Indicateurs + extract #48 | **Liste standardisée de KPI qualité chiffrés** (PAQ/SOPAQ) absente — actuellement extrapolés des bonnes pratiques | **N3** (ou nouveau corpus qualité) | **ISO 9001** appliquée BTP, référentiels **AQC**, indicateurs PAQ de BE expérimentés |
| **#55 `generateur-paq`** | memoire/prompts (indicateurs quantifiés) | Idem #48 (PAQ autonome) | **N3** | ISO 9001 BTP / AQC |
| **#92 `criteres-RSE-2026`** | memoire/prompts §Certifications + extract #92 | **Certifications RSE** non couvertes : **BBCA, Effinergie, NF Habitat / NF Habitat HQE** (signalées « hors sources » par NotebookLM) | **N7** | Référentiels de certification : **BBCA**, **Effinergie / BEPOS**, **NF Habitat / NF Habitat HQE (Cerqual)** ; texte **Loi Climat et Résilience** (volet RSE, 22/8/2026) |
| **#63 `exporteur-memoire-pdf`** | memoire/prompts §Hors corpus N5 | **Résolution DPI** et obligation **PDF/A** non spécifiées par N5 | **Aucun notebook requis** (voir §4) | Norme **PDF/A (ISO 19005)** + recommandations techniques génériques — à coder en dur, pas un manque BTP |
| **#34 `expert-etancheite`** | extract #34 | Procédés **non couverts par DTU classique** : **Systèmes d'Étanchéité Liquide (SEL)** résine PU/polyester, **végétalisation** — relèvent des **Règles professionnelles CSFE** + **e-Cahiers du CSTB** | **N4** | **Règles professionnelles CSFE** ; **e-Cahiers du CSTB** (SEL, toitures végétalisées) |

---

## 2. Manque de COUVERTURE / mauvais routage (le sujet existe, mais pas dans le notebook mappé)

| Skill (#N name) | Problème | Action recommandée |
|---|---|---|
| **#2 `detection-date-limite`** | **N2** (pièces administratives) **ne couvre pas** la date limite de remise ; le grounding réel a été obtenu via **N1**. | Soit **re-router #2 → N1**, soit **enrichir N2** avec des RC réels mentionnant la date limite. |

---

## 3. Marqueurs « pratique courante hors corpus strict » — universels, faible priorité

Signalés par les notebooks comme hors de leur corpus strict mais **universels et documentés** ; conservés avec marqueur HTML. Enrichissement **optionnel** (confort, pas blocage).

| Skill(s) | Sujet | Notebook | Note |
|---|---|---|---|
| #1, #3, #11, #22 | Sigles **DPGF / BPU / DQE**, formats de fichiers, marqueurs de version, DC1/DC2/AE | N2 | Pratique standard MP ; déjà documentée dans les prompts |
| #6 `recherche-lots` | Patterns de **numérotation des lots** (TF/TO, sous-lots 3A/3B) ; règle d'allotissement **L.2113-10 / L.2113-11 CCP** | N8 / N1 | L.2113-10/11 = réglementaire → pourrait rejoindre **N1** |
| #11 `extraction-pieces-offre` | Formats des pièces de l'offre | N2 | Pratique, déjà signalée |

---

## 4. Cas où AUCUN notebook n'est nécessaire

- **#63 `exporteur-memoire-pdf` — DPI / PDF-A** : contraintes purement **techniques/IT** (norme **PDF/A = ISO 19005**, résolution DPI), hors domaine métier BTP. La skill est `model="none"` (déterministe). → **Coder en dur** une règle d'optimisation (compression, DPI cible, option PDF/A) dans la skill ou la config, **sans** enrichir de notebook. Le marqueur actuel peut rester en attendant la décision produit.

---

## 5. RÉSUMÉ REGROUPÉ PAR NOTEBOOK — documents à ajouter

### N1 — Réglementaire Marchés Publics BTP (08531eb6)  ⭐ priorité haute
- **CCAG-Travaux 2021** (arrêté 30/3/2021), intégral — Art. 19/20 : retenue de garantie (assiette HT/TTC), pénalités de retard, primes, intérêts moratoires. *(débloque #24, #15)*
- **Code du travail, partie réglementaire R.4532** (coordination SPS, seuils jours-hommes déclenchant le PPSPS) + **guides INRS PPSPS**. *(débloque #46, #53)*
- *(optionnel)* Règle d'allotissement **L.2113-10 / L.2113-11 CCP** + date limite de remise via RC réels. *(améliore #6, #2)*

### N2 — Pièces Administratives BTP (7a661d76)
- *(optionnel)* RC réels mentionnant la **date limite de remise** (ou re-router #2 vers N1).
- *(optionnel)* Note de cadrage sur DPGF/BPU/DQE pour les intégrer au corpus strict.

### N3 — Mémoires Techniques Gagnants BTP (43615791)
- **Référentiels qualité** : **ISO 9001 appliquée BTP** + **AQC** + grilles de **KPI qualité chiffrés** pour PAQ/SOPAQ. *(débloque #48, #55)*

### N4 — Normes DTU par Corps de Métier BTP (777badb4)
- **Code de l'environnement REP PMCB** (L541-10-1) + **guides ADEME déchets BTP** + éco-organismes (Valobat, Ecominéro). *(débloque #47, #54)* — alternative : volet réglementaire vers N1.
- **Règles professionnelles CSFE** + **e-Cahiers du CSTB** (Systèmes d'Étanchéité Liquide, toitures végétalisées). *(débloque #34)*

### N5 — Plateformes Dépôt AO Publics (39ae9088)
- *(à décider)* Si l'on veut couvrir DPI/PDF-A côté notebook : doc technique plateformes + **norme PDF/A (ISO 19005)**. **Recommandation : non — traiter en technique pur (voir §4).**

### N6 — Pièges / Jurisprudence (1108bddc)
- *(aucun manque confirmé)* — corpus complet pour les skills livrées (#16, #17, #60, #87, #88).

### N7 — Scoring / Évaluation Offres (8ff1cdc4)
- **Référentiels de certification RSE** : **BBCA**, **Effinergie / BEPOS**, **NF Habitat / NF Habitat HQE (Cerqual)** + volet RSE de la **Loi Climat et Résilience** (22/8/2026). *(débloque #92)*

### N8 — Coach Conseil Entreprises MP BTP (5574a7d1)
- *(aucun manque confirmé)* — corpus complet pour les skills livrées (#75, #82, #83, #84, #89).

---

## 6. Note sur les marqueurs « défensifs » (NON comptés comme gaps)

Plusieurs prompts contiennent une **règle de repli générique** du type
« Information manquante → `[À COMPLÉTER — info manquante notebook NX]` ».
Ce sont des **garde-fous runtime** (anti-invention), **pas** des manques de corpus identifiés au build. Les skills concernées ont été correctement groundées ; le marqueur ne se déclenche que si une donnée précise manque à l'exécution. Concernées : #64 (rapport conformité), #66 (nomenclature N5), #67 (procédures N5), #74 (checklist N5), #75 (suivi N8), #78 (bibliothèque N3), #79 (coffre-fort N2), #77 (références N3), #81 (architecture). **Aucune action d'enrichissement requise** — à surveiller seulement si les tests terrain révèlent un manque réel.

---

## 7. Priorisation suggérée (pour Mohamed)

1. **N1 — CCAG-Travaux 2021** : débloque 2 skills financières critiques (#24, #15) — fort impact conformité.
2. **N1 — Code du travail R.4532 + INRS** : débloque 2 skills sécurité (#46, #53).
3. **N4/N1 — REP PMCB + ADEME** : débloque 2 skills environnement (#47, #54) — enjeu 2026.
4. **N7 — Certifs RSE (BBCA/Effinergie/NF Habitat)** : débloque #92 (différenciateur D13).
5. **N3 — KPI qualité ISO 9001/AQC** : débloque #48, #55.
6. **N4 — CSFE + e-Cahiers CSTB** : complète #34 (étanchéité SEL/végétalisation).
7. **DPI/PDF-A** : décision technique, pas de notebook (#63).
8. **Routage #2** : re-router vers N1 (rapide) plutôt qu'enrichir N2.
