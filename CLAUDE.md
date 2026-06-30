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

## Stack technique

- **Frontend :** React 18 + TypeScript + Tailwind CSS + shadcn/ui + Zustand + React Router v6
- **Backend :** FastAPI (Python) + SQLAlchemy + PostgreSQL + Redis + Celery
- **IA :** Claude API — Sonnet 4.6 (extraction, analyse, génération mémoire), Opus 4.7 (réécriture ciblée de paragraphe + fallback)
- **Stockage :** uploads sur disque du VPS (`backend/uploads/`, servis via `/api/files/view/...` avec contrôle d'ownership) ; object storage Hostinger (S3-compatible) prévu à l'échelle. Stripe (paiement)
- **Déploiement :** Hostinger VPS (Nginx + FastAPI + Postgres + Redis + Celery)

## Architecture des fichiers

Architecture cible et réelle (moteur `services/ai`, pipeline 6 étapes, chunking anti-troncature, socle RAG pgvector) : voir `docs/ARCHITECTURE_V2.md`. Vision produit : `docs/PRD_SYNORIX_V2.md`.

## Règles de développement

- Toujours écrire du code propre, typé (TypeScript strict, Pydantic pour Python)
- **Ne jamais hardcoder de clés API ou secrets** — utiliser les variables d'environnement
- Suivre les conventions de nommage : camelCase (JS/TS), snake_case (Python)
- Les modèles IA : Sonnet 4.6 pour extraction/matching **et génération mémoire** ; Opus 4.7 pour la réécriture ciblée de paragraphe
- Écrire des tests pour les fonctions critiques (auth, IA, export)
- Utiliser les schémas Pydantic pour toute validation de données côté backend
- Les tâches longues (analyse DCE, génération mémoire) sont des tâches Celery asynchrones

## Phases de développement (HISTORIQUE — plan de build initial, déjà livré)

> ⚠️ Ces 5 phases décrivent le plan de construction initial, **aujourd'hui réalisé**. La roadmap courante (V1 / V1.5 / V2.5) est dans `docs/PRD_SYNORIX_V2.md` §9 ; le backlog actif et priorisé est dans `TASKS.md`.

- **Phase 1** : Fondations — setup, auth, modèles DB, layout, dashboard statique
- **Phase 2** : Coffre-fort, profil entreprise, références chantiers
- **Phase 3** : Cœur — upload DCE, analyse IA, compliance matrix, checklist
- **Phase 4** : Mémoire technique — génération Sonnet 4.6, éditeur, export .docx
- **Phase 5** : Finitions — pricing, Stripe, landing page, déploiement

## Variables d'environnement clés

### Backend (.env)
```
DATABASE_URL=postgresql://...
SECRET_KEY=...
ANTHROPIC_API_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
REDIS_URL=redis://...
STRIPE_SECRET_KEY=...
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
VITE_STRIPE_PUBLIC_KEY=...
```

## Modèles IA — prompts

Les prompts système sont définis dans `backend/services/ai/prompts.py`.

## Notes importantes

- L'onboarding est progressif : l'utilisateur complète son profil en travaillant (pas de formulaire long au départ)
- Le coffre-fort documentaire est central : les documents uploadés lors d'un AO y sont automatiquement stockés
- Les templates de mémoire s'améliorent au fil des utilisations ("Utiliser comme référence")
- Toujours référencer la source dans le document original pour chaque exigence extraite (confiance utilisateur)

## Pièges connus (gotchas — déjà payés en temps, ne pas réapprendre)

- **Cap input ~30k sur le DCE** : un cap de troncature amputait l'analyse (CCAP coupé à ~30k caractères). **Résolu** par le chunking anti-troncature (`dce_analyzer` : CCAP/CCTP entiers + dedup). Ne pas réintroduire de limite naïve sur le texte source. Cf. `docs/rag/PHASE0-*`.
- **WSL2 timeouts** : tout appel au SDK Anthropic doit être enveloppé dans `asyncio.to_thread(...)` (sinon famine de l'event-loop → timeouts). C'est déjà le cas dans `services/ai/` — le conserver.
- **`temperature` dépréciée pour `claude-opus-4-7`** : transmettre `temperature` à ce modèle renvoie une **400**. Ne pas la passer (cf. `memoire_generator.py`).
- **Prompt cache par modèle** : le préfixe stable est caché PAR MODÈLE. Garder les segments d'un même modèle **consécutifs** (sinon 1 cache_write par changement de modèle → cache cassé, coût ×N). En full-Sonnet actuel : 1 cache_write puis cache_read sur les suivants.
