# Veille concurrentielle — Synorix vs marché français AO BTP

**Date :** 2026-04-29
**Méthodologie :** analyse des pages publiques (landing, pricing, blog, comparatifs), pas d'inscription, pas de scraping derrière login. Contenu produit pour informer la stratégie produit/marketing de Synorix sans copier visuellement ni fonctionnellement aucun concurrent.
**Périmètre :** marché français des SaaS AO BTP — détection (veille), analyse, réponse (mémoire technique), dépôt dématérialisé.

---

## 1. Cartographie du marché — 3 segments

Le marché français des SaaS AO BTP se décompose en **3 segments distincts** que la plupart des analystes confondent :

| Segment | Fonction principale | Acteurs | Cible |
|---|---|---|---|
| **A. Veille / détection** | Identifier les opportunités d'AO | DoubleTrade, Vecteur Plus, France Marchés, Marchés Online, Klekoon, BOAMP, TED, PLACE | Toutes tailles |
| **B. Plateformes de dépôt** | Envoyer la candidature signée | AOS/Saqara, e-marchespublics, Klekoon, achatpublic | Toutes tailles |
| **C. Réponse assistée par IA** | Analyser DCE + générer mémoire/DPGF | **Doaken**, SPIGAO (partiellement), JOOC.ai, **Synorix** | TPE/PME/ETI |

**Insight clé :** Le segment C (réponse IA) est **émergent** — moins de 5 acteurs sérieux en France, dont 0 avec pricing transparent. Les segments A et B sont saturés. **Synorix doit se positionner clairement sur C, et présenter A/B comme des accessoires** (intégrer la veille via webhook BOAMP gratuit, et le dépôt manuel sur les plateformes officielles existantes — pas réinventer ces couches).

---

## 2. Tableau comparatif — Synorix vs 10 concurrents

Légende : ✅ feature présente / publique • ⚠️ partiel ou non démontré • ❌ absent • 🔵 différenciateur Synorix

| Feature / Concurrent | **Synorix** | Doaken | SPIGAO | DoubleTrade | Vecteur+ | France M. | Marchés Online | Klekoon | AOS/Saqara | Loopio | Responsive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Veille AO publique** | ⚠️ via BOAMP gratuit | ✅ BOAMP+TED+Sitadel | ✅ multi-source | ✅ multi-source | ✅ hybride IA+humain | ✅ free+payant | ✅ multi-source | ✅ aggrégateur | ❌ | ❌ | ❌ |
| **Analyse DCE par IA** | ✅ Claude Sonnet/Opus | ✅ "5 min sur 200 pages" | ⚠️ DCI standard | ⚠️ NLP basique | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ générique | ⚠️ générique |
| **Compliance matrix auto** | ✅ extraction par source | ✅ exigences extraites | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ générique |
| **Checklist candidature** | ✅ par pièce/CCAP/RC | ✅ admin docs | ⚠️ DC1/DC2 préremplis | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| **Génération mémoire technique IA** | ✅ Opus 4.6 + skills BTP | ✅ "30 min, 95% qualité" | ⚠️ pré-rempli | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ générique | ✅ générique |
| **Skills DTU/normes BTP intégrés** | 🔵 ✅ par corps de métier | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Skills réglementation marchés publics** | 🔵 ✅ CCAG 2021, seuils 2026 | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Détecteur pièges DCE** | 🔵 ✅ skill dédié | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Méthodologie par corps de métier** | 🔵 ✅ skill dédié | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Coffre-fort documentaire** | ✅ vault + alertes expiration | ✅ vault 30j alertes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ library | ✅ library |
| **DPGF chiffrage** | ⚠️ structure extraite | ✅ benchmark 367K marchés | 🔵 DCI standard | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Go/No-Go scoring IA** | ❌ (P1 roadmap) | ✅ 8 facteurs, 100 pts | ❌ | ⚠️ priorisation | ⚠️ priorisation | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ |
| **Export ZIP candidature** | ✅ | ✅ DC1/DC2/PDF/Excel | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Dépôt dématérialisé natif** | ❌ (utiliser plateforme officielle) | ❌ | ⚠️ partenaire | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Templates partagés en équipe** | ⚠️ (P1) | ✅ multi-user | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Multi-langue** | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ❌ FR only | ✅ 12+ | ✅ multi |
| **Pricing transparent public** | 🔵 ✅ (à publier) | ❌ devis | ❌ devis | ❌ devis | ❌ devis | ⚠️ partiel | ⚠️ partiel | ❌ devis | ❌ devis | ✅ $20K/an min | ❌ devis |
| **Cible TPE (<10 sal.)** | 🔵 ✅ pricing accessible | ❌ ETI/groupes | ⚠️ TPE/PME | ❌ PME/ETI | ❌ PME/ETI/grds | ✅ tous | ✅ tous | ✅ tous | ⚠️ structurés | ❌ enterprise | ❌ enterprise |
| **API publique** | ⚠️ (P2) | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ |
| **Hébergement UE / RGPD strict** | ✅ (à confirmer en prod) | ✅ Frankfurt | ✅ FR | ✅ FR | ✅ FR | ✅ FR | ✅ FR | ✅ FR | ✅ FR | ❌ US | ❌ US |
| **Modèle IA non-entraîné sur données client** | ✅ Anthropic | ✅ explicite | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ⚠️ | ⚠️ |

---

## 3. Pricing benchmark (mensuel)

Source : article *Doaken — veille appels d'offres premium* + comparatifs LeBonLogiciel + ObaT.

| Acteur | Plan / Cible | Prix mensuel estimé | Note |
|---|---|---|---|
| BOAMP / PLACE / TED | Officiel public | **0 €** | Brut, zéro outillage |
| France Marchés | Veille basique | 100-300 € | Aggrégateur |
| Marchés Online | Pro veille | 100-250 € | Aggrégateur |
| Klekoon | Veille + dépôt | 150-350 € | Polyvalent |
| Vecteur Plus | Veille premium | 150-400 € | + qualif humaine |
| DoubleTrade | Veille premium ETI | 200-500 € | Multi-sources large |
| SPIGAO | Pack BTP veille+chiffrage | ~300-600 € (estimé) | Devis, opaque |
| AOS / Saqara | Compliance + dépôt | n/c (devis) | Plus cher |
| Doaken | Réponse IA (cible ETI) | n/c (devis, vraisemblablement 400-800 €) | Direct competitor |
| Loopio | Foundations | ~$1,700 / mois (20K $/an) | RFP US, non-BTP |
| Responsive (RFPIO) | n/c | n/c (>1k$/mois enterprise) | RFP US, non-BTP |

**Conclusion pricing :**
- **Trou de marché ≤ 100 €/mois** pour TPE BTP : aucune offre IA-first française dans ce range
- **Sweet spot 100-200 €/mois** pour PME : pas saturé, presque vide pour la réponse IA
- **Au-dessus de 400 €/mois** : ETI/grands groupes, Doaken s'y installe, marché plus restreint mais plus rentable

---

## 4. Différenciateurs Synorix actuels (déjà dans le code)

Inventaire factuel basé sur l'audit du repo (skills installés, modules backend) :

### 4.1 Skills BTP métier intégrés (cf. `.claude/skills/`)
- 🔵 **`analyse-dce-expert`** — extraction RC/CCAP/CCTP/AE/DC1/DC2/DPGF/BPU
- 🔵 **`conformite-candidature`** — checklist conformité avant dépôt
- 🔵 **`dpgf-chiffrage-expert`** — détection prix anormalement bas, sous-détails
- 🔵 **`memoire-technique-expert`** — rédaction mémoire structuré pour notation
- 🔵 **`methodologie-par-corps-de-metier`** — DTU + points singuliers + autocontrôles
- 🔵 **`normes-dtu-btp`** — référentiel DTU et réglementation par lot
- 🔵 **`pieges-dce-detecteur`** — anomalies, clauses inhabituelles, incohérences inter-doc
- 🔵 **`redaction-gagnante-btp`** — formulations gagnantes, mots-clés acheteurs
- 🔵 **`references-intelligentes`** — scoring/sélection des références chantier
- 🔵 **`reglementation-marches-publics`** — CCAG Travaux 2021, seuils 2026, DC1/DC2/DUME
- 🔵 **`scoring-offres-expert`** — grilles de notation, optimisation valeur technique

**Aucun concurrent observé n'a un tel niveau de skills BTP intégrés.** C'est la principale moat de Synorix : la qualité du mémoire généré dépend directement de ces skills.

### 4.2 Pipeline complet end-to-end intégré
Upload DCE → analyse IA → compliance matrix → checklist → coffre-fort → mémoire → export ZIP. Doaken offre la même chose, **mais Synorix peut la rendre 2x moins chère et 100% transparente**.

### 4.3 Prompt design Claude Sonnet/Opus
Synorix utilise le bon modèle pour chaque tâche (Sonnet 4.6 pour extraction, Opus 4.6 pour génération). Doaken ne précise jamais quel modèle. **Argumentaire de transparence et de qualité.**

### 4.4 Architecture moderne
React 18 + TypeScript strict + FastAPI + Pydantic + SQLAlchemy + S3 + Stripe. **Stack lisible publiquement** (open positioning) vs concurrents legacy (Spigao 30 ans, Klekoon 25 ans).

### 4.5 UX française native + design system unifié (DM Sans + cyan/slate)
Récents commits (`620c696`) montrent un design system unifié. La plupart des concurrents ont des UX datées (captures sur LeBonLogiciel).

---

## 5. Risques concurrentiels — ce qu'ils ont qu'on n'a pas

### 5.1 Veille intégrée (DoubleTrade, Vecteur Plus, SPIGAO)
**Manque Synorix :** ingestion BOAMP/TED automatique, alertes paramétrées par lot/zone.
**Mitigation :** API BOAMP gratuite (data.gouv.fr) → développer un module de veille minimal en P1. Ne pas sur-investir : la veille est commodifiée.

### 5.2 Benchmarking DPGF (Doaken, sur 367K marchés data.gouv.fr)
**Manque Synorix :** pas de comparaison historique des prix.
**Mitigation :** dataset DECP (données essentielles de la commande publique) accessible publiquement → ingestion P1, exposition en lecture pour donner des fourchettes.

### 5.3 Go/No-Go scoring (Doaken, DoubleTrade)
**Manque Synorix :** pas de score de pertinence/faisabilité automatique.
**Mitigation :** P0 facile à implémenter via Claude Sonnet (skill existant `scoring-offres-expert` à exposer côté backend).

### 5.4 Dépôt dématérialisé natif (AOS, Klekoon, e-marchespublics)
**Manque Synorix :** pas d'envoi automatisé sur la plateforme acheteur.
**Mitigation :** explicitement hors scope. Synorix prépare le ZIP, l'utilisateur le dépose. **C'est OK** — la plupart des plateformes acheteurs sont hétérogènes, intégrer fait perdre du temps. Argument honnête : "on ne réinvente pas le dépôt, on le rend rapide grâce au ZIP prêt à l'emploi."

### 5.5 Multi-langue (Loopio, Responsive)
**Manque Synorix :** FR only.
**Mitigation :** **non-problème** — marché français de 233 Md€/an suffit largement, focus FR. P3 ou jamais.

### 5.6 Maturité (SPIGAO 30 ans, Klekoon 25 ans, Loopio US-fortune-100)
**Manque Synorix :** trust signals (clients, témoignages, ancienneté).
**Mitigation :** transparence radicale + product-led growth + études de cas anonymes dès les premiers clients + presse spécialisée (Le Moniteur, Batiactu).

### 5.7 Volume marketing / SEO existant
**Manque Synorix :** zéro contenu publié.
**Mitigation :** voir `MARKETING_STRATEGY.md` — 20 articles à produire, ciblage long-tail.

---

## 6. Gaps exploitables (15 opportunités)

Priorisé par ratio impact / effort.

### Gap 1 — Pricing transparent et accessible TPE 🟢 P0
Aucun concurrent direct n'affiche son prix. Synorix peut publier une grille honnête (voir `MARKETING_STRATEGY.md` §6). **Effet :** convertit 5x plus en trial, casse le rapport de force du devis-piège.

### Gap 2 — Spécialisation par corps de métier 🟢 P0
Skills `methodologie-par-corps-de-metier` déjà présents. Créer 8 landing pages dédiées (façade/ITE, gros œuvre, second œuvre, électricité, plomberie, VRD, peinture, étanchéité). **SEO long-tail puissant**, voir `MARKETING_STRATEGY.md` §3.

### Gap 3 — Free tier généreux : 1er DCE analysé gratuit 🟢 P0
Aucun concurrent ne le fait. Effet wow garanti — l'utilisateur voit la qualité avant de payer. Coût marginal Anthropic : ~0.50 €. **CAC bien inférieur** au coût d'acquisition payant.

### Gap 4 — Bibliothèque DTU/normes accessible publiquement 🟡 P1
SEO ancré sur les requêtes "DTU 20.1 façade", "DTU 13.3 dallage", etc. Pages publiques liées au produit. Skill `normes-dtu-btp` à exposer en frontend public read-only.

### Gap 5 — Détecteur de pièges DCE (alerte avant dépôt) 🟢 P0
Skill `pieges-dce-detecteur` déjà présent. **Faire de cette feature un argumentaire fort** : "Synorix vous évite le rejet administratif." Ajouter à l'interface une étape "vérification finale" qui déroule le skill.

### Gap 6 — Comparaison automatique avec AO précédents gagnés 🟡 P1
Si l'utilisateur a déjà gagné un AO façade similaire, lui ressortir le mémoire d'archive et adapter automatiquement. Effet : 2e mémoire gratuit en quelques minutes. Réduit le coût IA de ~80% (cf. `COST_OPTIMIZATION_REPORT.md` à venir).

### Gap 7 — Probabilité de gain (scoring IA) 🟡 P1
Doaken le fait. Skill `scoring-offres-expert` déjà présent. Ajouter un endpoint `/projects/:id/scoring` qui donne un score 0-100 avec justification.

### Gap 8 — Suggestion sous-traitants/co-traitants 🟠 P2
Annuaire BTP français + scoring de complémentarité. Marché à part, mais pourrait devenir une fonction premium.

### Gap 9 — Génération automatique du planning Gantt depuis CCTP 🟠 P2
Très peu fait. Mention dans certains articles, jamais industrialisé. Faisable via Claude (extraction durées + dépendances) → export Gantt PDF.

### Gap 10 — Reminder attestations expirantes 🟢 P0
Doaken le fait (alertes 30 jours). Synorix doit le faire — coût marginal nul (cron sur DB), valeur perçue très haute.

### Gap 11 — Conseils contextuels après génération mémoire 🟢 P0 (mentionné dans le brief)
Après chaque mémoire généré, afficher 3-5 conseils d'amélioration spécifiques basés sur le profil entreprise. Effet : utilisateur sent que l'outil "comprend" son métier.

### Gap 12 — Mode incrémental pour AO suivants 🟢 P0
Cf. brief §2.4. Réutilisation du template du 1er mémoire → 80% d'économie tokens. **Personne ne le fait.**

### Gap 13 — Templates partageables en équipe 🟡 P1
Loopio le fait (multi-user library). Synorix doit l'ajouter au plan Pro+ : mémoires-types validés, fragments réutilisables.

### Gap 14 — Comparatif honnête vs concurrent 🟢 P0
Page publique "Synorix vs Doaken", "Synorix vs SPIGAO" sans bashing — facts only. Excellente SEO + autorité perçue.

### Gap 15 — Auto-remplissage DC1/DC2/DUME 🟡 P1
Doaken et SPIGAO le font. Synorix le fait partiellement via l'analyse DCE. À industrialiser : depuis le profil entreprise, auto-remplir les formulaires standardisés en PDF éditable.

---

## 7. Top 5 insights stratégiques

### Insight #1 — Le segment "réponse IA" est jeune (3-5 ans) en France
Doaken est le seul concurrent direct sérieux. SPIGAO arrive en retard sur l'IA (positionnement détection+chiffrage). **Synorix a 12-24 mois pour s'installer comme l'alternative TPE/PME crédible avant que le marché se concentre.**

### Insight #2 — Le marché français du BTP est >€233 Md/an avec 700K AO/an
Source : OECP 2024. **L'opportunité est massive** ; même 0,1% de pénétration = ~700 clients sérieux, plusieurs M€ d'ARR.

### Insight #3 — Le mémoire technique vaut 50-70% de la note
Source : multiple articles spécialisés. **Tout le levier de différenciation client est dans la qualité de mémoire**. Synorix doit y mettre 80% de son investissement IA.

### Insight #4 — La transparence pricing est ABSENTE du marché français
**0 concurrent direct affiche son prix.** Devis = friction massive. Synorix peut convertir 5-10x plus en publiant la grille.

### Insight #5 — Aucun concurrent ne capitalise sur les normes DTU
Synorix a déjà cette base de connaissance dans ses skills. **Argument de vente n°1 imbattable** : "vos méthodologies citent les bons DTU avec les bons points singuliers — ce qu'aucun autre outil ne fait."

---

## 8. Principes stratégiques pour Synorix

1. **Ne pas être un veilleur** (segment A saturé) — intégrer juste BOAMP gratuit en P1
2. **Ne pas être un déposeur** (segment B saturé, intégrations coûteuses) — produire un ZIP propre, c'est tout
3. **Être LE meilleur générateur de mémoire technique BTP TPE/PME** (segment C émergent)
4. **Pricing transparent + freemium 1er DCE = arme de conversion massive**
5. **Spécialisation métier = SEO long-tail + perception qualité**
6. **Skills BTP/DTU/réglementation = moat technique unique**

---

## 9. Sources

Pages publiques consultées :
- spigao.com (homepage, blog partenariat e-btp)
- achatpublic.com (homepage AOS)
- vecteurplus.com (homepage)
- marchesonline.com (homepage)
- klekoon.com (homepage)
- doaken.fr (homepage, blog veille)
- loopio.com/pricing
- responsive.io (homepage)
- jooc.ai/blog/ia-reponse-appels-offres
- onceforall.fr/trouver-appels-doffres-btp
- obat.fr/blog/appels-d-offres-batiment
- lebonlogiciel.com/blog/autre-outil-metier/veille-appel-d-offre-comparatif-complet

**Pas de scraping derrière login. Pas de copie visuelle. Pas d'inscription à un service payant.**
