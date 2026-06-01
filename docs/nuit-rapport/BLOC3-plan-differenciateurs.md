# BLOC 3 — Plan de branchement des DIFFÉRENCIATEURS (0 API, 0 modif)

> **Statut :** les 7 skills ci-dessous existent, sont typées Pydantic et testées, mais **ne sont câblées à AUCUN endpoint** (`grep synorix` dans `main.py`/`routers/` → 0 référence fonctionnelle). Elles sont **totalement isolées** du moteur A (pipeline live). Ce document est un **plan**, rien n'est codé ni activé cette nuit.

## Architecture commune (à connaître pour brancher)

- Base : `synorix/skills/base.py` — chaque skill = classe `Skill` avec `Input(SkillInput)` / `Output(SkillOutput)` Pydantic + `async run(self, inp, *, client: Client) -> Output`.
- `SkillInput` impose **`project_id: int`** (à fournir par l'endpoint).
- Invocation : `synorix.skills.registry.invoke(name, inp, *, client)` (dispatcher déjà prêt).
- `model` ∈ `{"none", "claude-sonnet-4-6", "claude-opus-4-7"}`. `model="none"` = **calcul Python pur, 0 appel LLM**.
- Client LLM : `synorix/ai/client.py` `Client.complete(model=…, system=…, …)` retourne du JSON → `Output.model_validate(...)`.

**Pattern de branchement recommandé (isolant, ne touche PAS le moteur A) :**
1. Créer `routers/synorix_skills.py` (nouveau router dédié, préfixe `/api/projects/{id}/synorix/...`).
2. L'inclure dans `main.py` via `app.include_router(...)` **en ajout** (aucune modif des routers existants analysis/memoire/export).
3. Côté front : nouveaux composants/onglets, sans toucher les 6 étapes existantes.
4. Chaque skill = 1 endpoint POST mince qui construit l'`Input`, appelle `invoke`, renvoie l'`Output` JSON.

---

## A. DÉTERMINISTES (model="none") — à brancher EN PREMIER (0 API, 0 risque IA)

### 🥇 #95 — calculateur-OAB-temps-réel (`verification/`, D7)
- **Fait quoi :** risque d'Offre Anormalement Basse par la double moyenne L2152-5 (M1 → exclusion >1,2×M1 → M2 → seuil 0,9×M2). Gauge vert/orange/rouge + marge € avant zone OAB + rappel juridique (contradictoire obligatoire, TA Nantes 19/05/2025).
- **Inputs (`Input`)** : `prix_candidat: float`, `prix_offres: list[float]` (offres concurrentes acceptables), `seuil_oab=0.9`.
- **Outputs (`Output`)** : `m1, m2, seuil_oab_euros, marge_avant_oab, gauge, est_oab, rappel_juridique, avertissements[], sources_nbk[]`.
- **D'où viennent les inputs :** `prix_candidat` = total offre de l'entreprise (étape Export/DPGF chiffrée) ; `prix_offres` = saisie manuelle (les offres concurrentes ne sont connues qu'après ouverture des plis) → **UI : un champ + liste éditable**. Gère le cas « aucune offre concurrente » (avertissement [À COMPLÉTER]).
- **Endpoint + UI :** `POST /projects/{id}/synorix/oab` (body = prix). UI = encart « Risque OAB » dans l'étape **Export/Offre** (jauge + tableau M1/M2). Aucune dépendance au moteur A.
- **Modèle / coût :** `none` → **0 API, 0 $/appel**, instantané.
- **Risque :** **FAIBLE** (Python pur, déjà testé). **Ordre : #1.**

### 🥈 #24 — calculatrice-retenue-garantie (`extraction/`)
- **Fait quoi :** calcul déterministe retenue de garantie (max 5 %), pénalités de retard (1/3000 CCAG-Travaux Art.19.2.3, param. si CCAP déroge), intérêts moratoires (taux BCE), TTC. Postes détaillés.
- **Inputs :** `montant_ht, tva=0.20, taux_rg=0.05, penalite_diviseur=3000, jours_retard_execution, valeur_ht_en_retard?, creance_ttc?, taux_bce, jours_retard_paiement`.
- **Outputs :** `montant_ttc, postes: list[PosteCalcul], avertissements[]`.
- **D'où viennent les inputs :** `montant_ht` = montant marché (offre/DPGF) ; `taux_rg`/`penalite_diviseur` extractibles du **CCAP** (déjà analysé par le moteur A — pré-remplissage possible, sinon défauts CCAG) ; `taux_bce` à fournir.
- **Endpoint + UI :** `POST /projects/{id}/synorix/retenue-garantie`. UI = mini-calculatrice dans l'étape **Candidature/Offre** ou la fiche projet. Pré-remplir depuis l'analyse si dispo.
- **Modèle / coût :** `none` → **0 API, 0 $/appel**.
- **Risque :** **FAIBLE.** **Ordre : #2.**

> Ces deux-là sont le **quick win** : valeur immédiate, zéro coût, zéro risque IA, déjà testés. Voir BLOC5 (préparation service pur, non câblé).

---

## B. GÉNÉRATIFS (LLM) — à brancher ensuite, après validation Mohamed

### #70 — synorix-score-evaluateur (`verification/`, Opus)
- **Fait quoi :** note le mémoire technique sur /100, ventilé par axe, avec justifications transparentes (grille 0-5 type commission). Reproductible.
- **Inputs :** mémoire technique (texte/JSON) + grille/critères. **Outputs :** `score/100`, `axes: list[AxeScore]`, justifications.
- **D'où viennent les inputs :** **directement la sortie du moteur mémoire (A)** → dépendance forte au maillon mémoire (or il est cassé, cf. BLOC1). À brancher **après** réparation du moteur.
- **Endpoint + UI :** `POST /projects/{id}/synorix/score` (sur le mémoire généré). UI = badge score + radar par axe dans l'étape **Mémoire** (onglet « Évaluation »).
- **Modèle / coût :** Opus 4.7 — entrée volumineuse (mémoire ~30k tokens) → **≈ 0,5–0,7 $/appel**.
- **Risque :** **MOYEN** (dépend du moteur mémoire + coût Opus). **Ordre : après réparation mémoire.**
- ⚠️ Note : `#71 synorix-score-suggestions` (suggestions d'amélioration) existe aussi (`synorix_score_suggestions.py`) — complément naturel du #70.

### #86 — RAO-prédictif (`verification/`, Sonnet)
- **Fait quoi :** Rapport d'Analyse d'Offres prédictif : grille 0-5 par sous-critère + pondération + classement probable + écarts critiques (cadre R2152-6 à 8 CCP).
- **Inputs :** critères de jugement + sous-critères + (offre candidat). **Outputs :** `RAO` (sous-critères notés, classement).
- **D'où viennent les inputs :** **critères de jugement de l'analyse A** — ⚠️ rappel BLOC1 : `criteres_jugement = 0` sur le DCE Gueux. **Dépend d'une extraction de critères fiable** (à corriger côté moteur A d'abord).
- **Endpoint + UI :** `POST /projects/{id}/synorix/rao`. UI = tableau RAO dans l'étape **Analyse** ou **Export**.
- **Modèle / coût :** Sonnet 4.6 → **≈ 0,02–0,04 $/appel**.
- **Risque :** **MOYEN** (dépend de l'extraction des critères). **Ordre : après fiabilisation `criteres_jugement`.**

### #92 — critères-RSE-2026 (`memoire/`, Sonnet)
- **Fait quoi :** détecte les exigences RSE du DCE + suggère des engagements sur les 5 catégories Loi Climat (22/08/2026 : déchets, carbone, biosourcés, insertion, mobilité). **Indicateurs chiffrés TOUJOURS [À COMPLÉTER]** (jamais inventés — cohérent avec la philosophie produit).
- **Inputs :** texte DCE / exigences extraites. **Outputs :** `criteres_detectes[]`, `suggestions[]`, `ecarts_step5[]`.
- **D'où viennent les inputs :** **exigences de l'analyse A** (catégorie technique/offre) ou texte DCE brut → dépendance faible/moyenne, l'analyse fournit déjà la matière.
- **Endpoint + UI :** `POST /projects/{id}/synorix/rse`. UI = panneau « RSE 2026 » dans l'étape **Mémoire** (enrichit la note environnementale, déjà présente dans le mémoire généré — cf. BLOC1 §7 environnement).
- **Modèle / coût :** Sonnet 4.6 → **≈ 0,02–0,04 $/appel**.
- **Risque :** **FAIBLE-MOYEN** (inputs déjà disponibles, sortie structurée). **Bon candidat génératif n°1.**

### #89 — cotraitance-groupement (`chatbot/`, Sonnet)
- **Fait quoi :** aide PME à structurer un GME conjoint/solidaire (R2142-20 CCP) : pédagogie des régimes, détection de pertinence, orchestration DC1/DC2 (jamais DC4).
- **Inputs :** contexte projet/entreprise (capacités, lot). **Outputs :** `Formulaire` + conseils.
- **D'où viennent les inputs :** profil entreprise (MemoireConfig) + exigences candidature de l'analyse A.
- **Endpoint + UI :** `POST /projects/{id}/synorix/cotraitance`. UI = assistant dans l'étape **Candidature** (à côté de la checklist pièces).
- **Modèle / coût :** Sonnet → **≈ 0,02 $/appel**.
- **Risque :** **FAIBLE-MOYEN** (conseil, pas de dépendance critique). 

### #88 — conseil-recours-éviction (`export/`, Sonnet)
- **Fait quoi :** conseille le candidat évincé sur le bon recours (référé précontractuel L551-1 / contractuel L551-13 / Tarn-et-Garonne CE 4/4/2014) selon le contexte temporel.
- **Inputs :** contexte (marché signé ou non, délais, motif d'éviction). **Outputs :** `Recours` (type, délais, démarche).
- **D'où viennent les inputs :** **post-résultat** (hors pipeline de réponse) — saisie utilisateur après notification de rejet.
- **Endpoint + UI :** `POST /projects/{id}/synorix/recours`. UI = écran dédié « Suite à un rejet » (hors pipeline 6 étapes, déclenché manuellement).
- **Modèle / coût :** Sonnet → **≈ 0,02 $/appel**.
- **Risque :** **FAIBLE** (isolé, post-process, inputs manuels). Faible priorité produit (cas d'usage de niche).

---

## Ordre de branchement recommandé

| Ordre | Skill | Modèle | Coût/appel | Risque | Dépendance |
|-------|-------|--------|-----------|--------|------------|
| 1 | **#95 OAB** | none | 0 $ | Faible | Prix offre (saisie) |
| 2 | **#24 retenue-garantie** | none | 0 $ | Faible | Montant marché (+CCAP) |
| 3 | **#92 RSE-2026** | Sonnet | ~0,03 $ | Faible-Moyen | Exigences analyse A (dispo) |
| 4 | **#89 cotraitance** | Sonnet | ~0,02 $ | Faible-Moyen | Profil + candidature |
| 5 | **#88 recours-éviction** | Sonnet | ~0,02 $ | Faible | Saisie manuelle (post-rejet) |
| 6 | **#86 RAO-prédictif** | Sonnet | ~0,03 $ | Moyen | ⚠️ `criteres_jugement` (à fiabiliser) |
| 7 | **#70/#71 Synorix Score** | Opus | ~0,6 $ | Moyen | ⚠️ moteur mémoire (BLOC1, à réparer) |

## Synthèse / reco
- **Brancher d'abord #95 + #24** (déterministes) : valeur immédiate, 0 $, 0 risque, déjà testés → cf. **BLOC5** qui prépare ces 2 en service pur prêt à câbler.
- **Puis #92 RSE** : meilleur premier génératif (inputs déjà là, philosophie [À COMPLÉTER] alignée).
- **#70 Synorix Score et #86 RAO sont conditionnés** par deux corrections amont : réparer le moteur mémoire (#70) et fiabiliser l'extraction des critères de jugement (#86).
- **Isolation garantie** par un router dédié `synorix_skills.py` inclus en ajout — le moteur A (analyse/mémoire/export) n'est jamais modifié.
