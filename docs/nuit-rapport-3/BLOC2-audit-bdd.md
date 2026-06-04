# BLOC 2 — Audit BDD (lecture seule, 0 modif schéma)

## État actuel du schéma (12 tables métier)

| Table | Rôle | Colonnes notables |
|---|---|---|
| `organizations` | tenant | name, siret… |
| `users` / `team_members` | comptes / équipe | organization_id |
| `projects` | un AO | criteres_jugement (JSON), infos_marche (JSON), lots_detectes (JSON), selected_lot, processing_status/progress |
| `project_documents` | DCE du projet | extracted_text, related_lots, type |
| `documents` | **coffre-fort** entreprise | type, expiry_date, soft-delete |
| `references` | chantiers passés | intitule, maitre_ouvrage, lot, montant_ht, annee, statut |
| `compliance_items` | matrice de conformité | exigence_text, source_document/page/excerpt, status, category |
| `checklist_items` | pièces candidature | document_type_required, status, linked/template/completed doc |
| `memoires_techniques` | mémoire généré | content_json (JSON), version, variables |
| `memoire_configs` | profil entreprise mémoire | historique, CA (JSON), postes_cles (JSON), moyens… |
| `memoire_templates` | mémoires de référence importés | content_json |
| `audit_logs` | traçabilité | action, target, extra (JSON) |

**Constat** : la BDD stocke bien les données **par tenant/projet** (DCE, profil, conformité, mémoire). Usage de `JSON` pour les structures riches (criteres_jugement, infos_marche, content_json) — souple mais **non requêtable finement**.

## Où vivent les RÉFÉRENTIELS métier aujourd'hui ?

**En FICHIERS, pas en BDD.**
- `backend/ai_skills/` : **9 skills, 18 fichiers `.md` (240 Ko)** (normes-dtu-btp, methodologie-par-corps-de-metier avec 8 référentiels par corps de métier, reglementation-marches-publics, memoire-technique-expert, scoring-offres-expert, redaction-gagnante-btp…).
- Chargés par `services/skill_loader.py` (`load_skill`, `load_skill_reference`, `load_skills_bundle`) avec `lru_cache`, puis **injectés en bloc dans les prompts** (≈ 33 525 chars de skills + le référentiel méthodologie du corps de métier).
- Le contenu **NotebookLM** (normes DTU, jurisprudences, seuils OAB, REP PMCB…) vit dans ces `.md` + `docs/notebook-extracts/` (extraits bruts). Il est **exploité UNIQUEMENT via le prompt** — **jamais stocké ni requêtable en BDD**.
- Les skills déterministes (`backend/synorix/skills/`, ex. seuils OAB L2152-5, retenue Art.19) encodent leurs constantes **en dur dans le code Python**, pas en BDD.

→ **Aucun référentiel structuré/requêtable.** Tout est « texte → prompt » (ou constante code).

## Analyse : qu'est-ce qui gagnerait à être en BDD ?

⚠️ **Nuance importante** : le prompt caching (déjà en place) met les référentiels en cache (lecture ~0,1× du prix input). Donc l'argument « réduire les tokens » est **faible** (le cache amortit déjà). Le vrai gain d'une mise en BDD = **précision** (injecter SEULEMENT le pertinent au lieu du bloc entier) et **réutilisabilité** (même donnée pour prompt + endpoints + UI + features déterministes), pas l'économie de tokens.

### Plan d'enrichissement priorisé (proposition — RIEN n'est modifié)

| # | Table proposée | Source | Usage | Gain | Risque |
|---|---|---|---|---|---|
| 1 | **`dtu_referentiel`** (corps_metier, numero, nf_p, intitule, domaine) | `ai_skills/normes-dtu-btp` + listes DTU de `prompts.py` | Injecter **uniquement les DTU du corps de métier du lot** dans le prompt mémoire (au lieu du bloc complet) + endpoint « lookup DTU » + autocomplete UI | **Précision** (Sonnet cite des DTU ciblés, moins de bruit) + réutilisable | Faible (table de référence en lecture, seed depuis les .md) |
| 2 | **`jurisprudence`** (ref, juridiction, date, principe, domaine, source_nbk) | NotebookLM N6 (Pièges/Jurisprudence) | Inputs de **#88 recours-éviction** et **#86 RAO** (citations vérifiables) + affichage UI « rappel juridique » | Réutilisable hors prompt, citations fiables | Faible |
| 3 | **`seuils_marche`** (type_marche, seuil_oab, retenue_pct, penalite_diviseur, taux_revision, source) | skills déterministes + CCAG/CCP | Alimente les **calculateurs** (OAB/retenue) avec des valeurs par type de marché au lieu de constantes en dur | Centralise les barèmes, maintenance | Faible |
| 4 | **`phrases_rse_bibliotheque`** (categorie, engagement, indicateur_placeholder) | NotebookLM N7/N8 (déjà un input de #92 `phrases_rse_bibliotheque`) | Input direct de **#92 RSE** (la skill l'attend déjà en paramètre !) | Branche #92 sans hardcoder | Faible |

**Ordre recommandé** : #4 (la skill #92 attend déjà cet input → quick win) → #1 (précision DTU, fort impact mémoire Sonnet) → #2 (débloque recours/RAO) → #3 (centralise les barèmes calculateurs).

### Ce qui NE gagne PAS à passer en BDD (rester en fichiers)
- Les **prompts narratifs** (memoire-technique-expert, redaction-gagnante-btp, scoring) : ce sont des **instructions**, pas des données requêtables — leur place est le fichier/prompt (versionné en git, cached).
- La méthodologie rédactionnelle par corps de métier : texte de génération, pas de la donnée structurée → garder en `.md`.

## Architecture de branchement (si Mohamed valide)
- Tables de **référence en lecture seule**, seedées depuis les `.md`/notebook-extracts par un script idempotent (`scripts/seed_referentiels.py`), **sans toucher les tables existantes** (migration purement additive).
- Le `skill_loader` gagnerait une variante « requête BDD » pour injecter le sous-ensemble pertinent ; le fallback fichier reste.
- **Migration additive uniquement** (CREATE TABLE), jamais d'ALTER/DROP sur l'existant.

## Verdict
État sain : la BDD porte bien les données tenant/projet ; les **référentiels métier sont 100 % en fichiers → prompt**, non requêtables. L'enrichissement le plus utile **n'est pas** « tout mettre en BDD pour économiser des tokens » (le cache amortit déjà) mais **structurer en BDD les données qui deviennent des INPUTS réutilisables** (DTU ciblés, jurisprudences, barèmes, bibliothèque RSE) → améliore la **précision Sonnet** et **alimente les features** (calculateurs, RSE, recours/RAO). **Plan additif, faible risque, rien modifié cette nuit.**
