# Agent SaaS AO BTP

Tu es un développeur full-stack senior qui construit un SaaS de réponse aux appels d'offres BTP.

## Règles de travail (PRIORITAIRES — s'appliquent à chaque session)

- **Terminé = Prouvé.** Jamais « fini » sans avoir lancé le code / un test vert. Pas de « ça devrait marcher ». Preuve (sortie de test, comportement observé) avant toute affirmation de succès.
- **Plan avant exécution.** Tu proposes, j'approuve, PUIS tu exécutes. Pas de suppression/déplacement/renommage sans mon OK.
- **Aucun rapport de statut sur le disque** (pas de `*_REPORT`, `*_PROGRESS`, `*_AUDIT`). Le compte-rendu va dans le terminal.
- **Une tranche verticale à la fois** → test vert → commit dédié. Pas de gros commits fourre-tout.
- **`git revert` plutôt que rustiner.** En cas d'erreur, revenir proprement à l'état sain ; ne jamais empiler des correctifs sur du cassé.
- **Moins de docs, justes et à jour** > beaucoup de docs. La doc reflète le code réel (le code est la source de vérité).

## Contexte du projet

Lis le fichier `docs/PRD_SYNORIX_V2.md` pour comprendre le projet complet (PRD courant). L'ancien PRD est archivé dans `docs/archive/PRD_SAAS_AO_BTP.md`.

**Objectif :** Automatiser la réponse aux appels d'offres BTP via l'IA (Claude API) — analyse DCE, compliance matrix, checklist candidature, génération de mémoire technique (~20 pages), export Word.

## Décisions structurantes (Vision V1 FINALE — 2026-07-01)

> Référence canonique : `docs/PRD_SYNORIX_V2.md` v3.0. Ces décisions **priment** sur toute vision antérieure contradictoire.

- **Pricing & quotas (grille du 2026-11-11 : plus aucune offre illimitée).** Essentiel **149 €/mois** (**5 analyses + 5 mémoires/mois**) · Pro **349 €/mois** (1 user, **30 analyses + 30 mémoires/mois**) · Business **599 €/mois** (5 users, **70 analyses + 70 mémoires/mois**). Unité : **1 lot = 1 mémoire = 1 unité**. **1 AO offert** à la création. Dépassement → **blocage doux + upgrade** (Business, offre la plus haute : remise à zéro mensuelle, quota relevé sur demande ; pas de facturation à l'unité). Source unique : `frontend/src/lib/offres.ts` = `backend/services/quota.py` (`PLAN_LIMITS`).
- **Paiement carte uniquement en V1.** Stripe `payment_method_types=["card"]`, **pas de SEPA** (migration d'entité prévue ; les mandats SEPA ne migrent pas entre comptes Stripe).
- **Frontière chiffrage (FERME).** Synorix **ne commente ni ne conseille JAMAIS** les prix ou le chiffrage. Il **lit le contrat** (faits CCAP) et vérifie la conformité **formelle** de la DPGF. Le **calculateur OAB est retiré** du produit (route, UI, `services/calculators/oab.py` et tests retirés par `d44b4e9`). Déclarations de l'entreprise = **champs libres** sous la responsabilité de l'utilisateur (Synorix est un éditeur, pas un juge).
- **Différenciateurs V1 = déterministes, 0 € API** : Synorix Score go/no-go, traduction trésorerie CCAP, rétro-planning, stats gagné/perdu, calculateur retenue de garantie. Le Synorix Score qualité mémoire /100 (LLM) est **déclassé V1.5** — jamais d'Opus sur les scores en V1.
- **Profil mémoire vivant.** Couche stable entreprise en BDD, vit dans « Mon entreprise » (onglets Identité / Moyens / Certifications) — **pas** d'entrée « mémoire technique » séparée. Lu au moment de la génération ; modifs **locales par mémoire** par défaut (+ case « mettre à jour mon profil »).
- **Barre de navigation (« Sidebar »).** Cinq entrées, chacune avec son nom écrit sous l'icône (11 px, visible sans survol) : Accueil · Mes AO · Mon entreprise · Coffre-fort · Paramètres ; `[+ Nouvel AO]` hors nav ; jauge quota → Paramètres > Abonnement ; Déconnexion dans le menu du compte (la photo). **Équipe et Mes références sont des accès de Mon entreprise** (`/team` et `/references` redirigent vers `/company?rubrique=moyens` / `certifications`) ; **Retenue de garantie n'est plus dans la barre** (carte de trésorerie, Paramètres > Outils, palette Ctrl K). Cerveau prendra la place de Mon entreprise au bloc 8. Source unique : `components/layout/navigation.ts`. **Le pipeline n'apparaît JAMAIS dans la barre** ; le billing vit dans Paramètres.
- **Sécurité by-design (à inscrire dans chaque nouvelle route).** Isolation multi-tenant stricte (`org_id` sur chaque requête, **tests cross-org systématiques**) · coffre-fort hors webroot, noms aléatoires, **URLs signées à durée limitée**, ownership vérifié · TLS+HSTS, cookies HttpOnly/Secure/SameSite, CSP · validation Pydantic partout ; uploads type+taille validés, **garde anti-zip-bomb** · rate limiting auth + endpoints coûteux · secrets en env vars only · RGPD (données UE, logs sans données perso) · Sentry + uptime.

## Stack technique

- **Frontend :** React 18 + TypeScript + Tailwind CSS + shadcn/ui + Zustand + TanStack Query + React Router v6 (Vite, ESLint)
- **Backend :** FastAPI (Python) + SQLAlchemy + Alembic + PostgreSQL + Redis + Celery (worker + beat : tâches planifiées seulement)
- **Connexion :** Clerk (jeton vérifié côté serveur par `CLERK_JWKS_URL`)
- **IA :** Claude API — Haiku 4.5 (reformulation de texte libre du profil, lecture des dépôts de Mon entreprise, « Préparer les questions », pré-vol de la clé), Sonnet 4.6 (extraction, analyse, import d'un ancien mémoire, filet des lots) et Sonnet 5.5 (génération mémoire **et réécriture ciblée de paragraphe**), Opus 4.7 (repli par défaut du générateur seulement, jamais appelé aujourd'hui)
- **Stockage :** uploads sur disque du VPS (`backend/uploads/`, servis via `/api/files/view/...` avec contrôle d'ownership) ; object storage Hostinger (S3-compatible) prévu à l'échelle. Stripe (paiement)
- **Déploiement :** Hostinger VPS (Nginx + FastAPI + Postgres + Redis + Celery)

## Architecture des fichiers

Architecture cible et réelle (moteur `services/ai`, pipeline 6 étapes, chunking anti-troncature, socle RAG pgvector) : voir `docs/ARCHITECTURE_V2.md`. Vision produit : `docs/PRD_SYNORIX_V2.md`.

## Règles de développement

- Toujours écrire du code propre, typé (TypeScript strict, Pydantic pour Python)
- **Ne jamais hardcoder de clés API ou secrets** — utiliser les variables d'environnement
- Suivre les conventions de nommage : camelCase (JS/TS), snake_case (Python)
- Les modèles IA : **Haiku 4.5** pour la reformulation de texte libre du profil (`profile_structurer.py`, `structure-text`), la lecture des dépôts de Mon entreprise (`depot_extracteur.py`), « Préparer les questions » (`points_eclaircir.py`) et le pré-vol (`api_preflight.py`) — aucun routage par modèle n'existe ; **Sonnet 4.6** pour l'extraction et l'analyse (`dce_analyzer.py`), l'import d'un ancien mémoire et le filet des lots (le rapprochement exigences ↔ pièces est déterministe : `checklist_matcher.py`), **Sonnet 5.5** (`claude-sonnet-5-5`, réflexion coupée `between_tools`, réglage `MEMOIRE_MODELE` pour en forcer un autre) pour la **génération mémoire** et la **réécriture ciblée de paragraphe** (éditeur : Reformuler, Plus technique, Plus concis, Insister sur… ; même modèle que la génération, `MEMOIRE_MODELE` s'applique, jamais de `temperature`, plafond de 60 par jour et par organisation, `REECRIRE_MAX_PAR_JOUR`) ; **Opus 4.7** n'est plus que le repli par défaut de `MemoireGenerator.MODEL` (aucun appel en pratique). Les **scores (Synorix Score, conformité) sont déterministes** — pas de LLM.
- Écrire des tests pour les fonctions critiques (auth, IA, export)
- Utiliser les schémas Pydantic pour toute validation de données côté backend
- Les tâches longues (analyse DCE, génération mémoire, « Refaire ») tournent dans un **fil détaché de l'API** (`threading.Thread` démon : `routers/analysis.py`, `routers/memoire.py`), suivi en direct par SSE ; Celery ne porte que les tâches planifiées du beat (`tasks/check_expiry.py` : expirations, purge des AO supprimés, suppressions de compte échues, veille BOAMP, lectures différées des dépôts)
- **Toute route qui appelle le modèle** porte `Depends(exiger_budget_ia)` (`services/budget_ia.py` : 60 € d'IA par organisation sur 24 h glissantes, 429 au-delà) et inscrit son coût réel dans `couts_ia` ; `tests/test_budget_ia_s01.py` tient la liste fermée de ces routes. Lancements plafonnés par jour, toutes offres (`services/plafonds_ia.py` : 20 analyses, 20 mémoires, imports, reformulations, questions)
- **Fonctions C1 à C4 livrées éteintes** (`services/fonctions_ia.py`) : `RELECTURE_PROPOSER`, `REECRIRE_TROIS`, `FICHE_PROPOSEE`, `STYLE_ENTREPRISE` à `0` → route 404 avant toute autre dépendance, aucun bouton (le front lit `GET /api/fonctions-ia`). C4 exige la migration `0036`

## Phases de développement (HISTORIQUE — plan de build initial, déjà livré)

> ⚠️ Ces 5 phases décrivent le plan de construction initial, **aujourd'hui réalisé**. La roadmap courante (V1 / V1.5 / V2.5) est dans `docs/PRD_SYNORIX_V2.md` §9 ; le backlog actif et priorisé est dans `TASKS.md`.

- **Phase 1** : Fondations — setup, auth, modèles DB, layout, dashboard statique
- **Phase 2** : Coffre-fort, profil entreprise, références chantiers
- **Phase 3** : Cœur — upload DCE, analyse IA, compliance matrix, checklist
- **Phase 4** : Mémoire technique — génération Sonnet (aujourd'hui 5.5), éditeur, export .docx
- **Phase 5** : Finitions — pricing, Stripe, landing page, déploiement

## Variables d'environnement clés

Liste complète, défauts et rôle de chaque variable : `backend/.env.example`, `frontend/.env.example`, `docs/DEPLOYMENT.md` § 6.

### Backend (.env)
```
DATABASE_URL=postgresql://...
SECRET_KEY=...            # signe les URLs de fichiers ; refus de démarrer si courte (hors DEBUG)
REDIS_URL=redis://...
ANTHROPIC_API_KEY=...
CLERK_SECRET_KEY=...
CLERK_JWKS_URL=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
FRONTEND_URL=http://localhost:3000
```
`AWS_*` : à laisser vides en V1 (remplies, `services/file_storage.py` range les pièces dans S3 au lieu du disque).

### Frontend (.env, figé au build)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:8000   # vide en production (même origine)
```

## Modèles IA — prompts

Les prompts système sont définis dans `backend/services/ai/prompts.py` ; ceux des fonctions C1 à C4 (éteintes) dans `backend/services/ai/prompts_fonctions_c.py`.

## Commandes de test

- Front : `cd frontend && npm test` (`# fail 0`), `node_modules/.bin/tsc --noEmit -p .` (0), `npm run lint` (code 0).
- Parcours de bout en bout, IA simulée, sur un banc : `npm run e2e` et `npm run e2e:2` (mode d'emploi : `frontend/e2e/LISEZMOI.md`).
- Serveur : `cd backend && TMPDIR=<dossier court> python -m pytest -p no:cacheprovider -q -o addopts=""` (suite complète : plus de 3 000 tests, 20 à 40 min).

## Notes importantes

- L'onboarding est progressif : l'utilisateur complète son profil en travaillant (pas de formulaire long au départ)
- Le coffre-fort documentaire est central : un document personnel reconnu (URSSAF, Kbis…) déposé avec un AO y est **proposé**, pas rangé d'office (bandeau « Enregistrer » / « Non merci », `components/vault/VaultSavePrompt.tsx`, `POST /api/documents/from-project-doc`) ; un refus n'est plus jamais reproposé pour ce document
- Un ancien mémoire s'importe dans Mon entreprise (« Importer un mémoire », `services/ai/memoire_importer.py`) ; les modèles de mémoire de l'organisation (« Utiliser comme référence ») ne sont pas construits (`TASKS.md`, P2)
- Toujours référencer la source dans le document original pour chaque exigence extraite (confiance utilisateur)

## Pièges connus (gotchas — déjà payés en temps, ne pas réapprendre)

- **Cap input ~30k sur le DCE** : un cap de troncature amputait l'analyse (CCAP coupé à ~30k caractères). **Résolu** par le chunking anti-troncature (`dce_analyzer` : CCAP/CCTP entiers + dedup). Ne pas réintroduire de limite naïve sur le texte source. Cf. `docs/rag/PHASE0-*`.
- **WSL2 timeouts** : tout appel au SDK Anthropic doit être enveloppé dans `asyncio.to_thread(...)` (sinon famine de l'event-loop → timeouts). C'est déjà le cas dans `services/ai/` — le conserver.
- **`temperature` dépréciée pour `claude-opus-4-7`** : transmettre `temperature` à ce modèle renvoie une **400**. Ne pas la passer (cf. `memoire_generator.py`).
- **Prompt cache par modèle** : le préfixe stable est caché PAR MODÈLE. Garder les segments d'un même modèle **consécutifs** (sinon 1 cache_write par changement de modèle → cache cassé, coût ×N). En full-Sonnet actuel : 1 cache_write puis cache_read sur les suivants.
- **`pytest` avec un `TMPDIR` court** (ex. `/home/omarov/sprint-ozcan-wt/t-<nom>`) : un socket Unix sous `tmp_path` dépasse la limite de 108 octets (`AF_UNIX path too long` : 2 faux rouges de `test_pdfium_landlock.py`, contournés depuis `ddc5ec9` ; garder la règle).
- **Une base copiée de la base locale est en retard de migrations** (banc neuf : `0034`) : `python -m alembic upgrade head` avant de lancer l'API, sinon 500 dès qu'une organisation est lue (colonne `organizations.suppression_prevue_le` du modèle, migration `0035`) ; `0036` crée `styles_entreprise`, `0037` les index et l'extension `pg_trgm`.
- **Des tests du serveur lisent des fichiers du front** (`test_quota.py` : `lib/offres.ts` = `PLAN_LIMITS` ; `test_reecriture_passage_plafond.py` : `RewritePassageBar.tsx` ; `test_relecture_memoire.py` : `lib/memoireSections.ts` ; `test_nginx_visage.py` : `public/entreprise/`) : un changement du front peut faire rougir `pytest`.
- **`npm run lint` doit rendre le code 0** (`--max-warnings 0`, configuration `frontend/.eslintrc.cjs`) : un seul avertissement fait échouer ; corriger plutôt qu'ajouter un `eslint-disable`.
