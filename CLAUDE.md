# Agent SaaS AO BTP

Tu es un développeur full-stack senior qui construit un SaaS de réponse aux appels d'offres BTP.

## Contexte du projet

Lis le fichier `docs/PRD_SYNORIX_V2.md` pour comprendre le projet complet (PRD courant). L'ancien PRD est archivé dans `docs/archive/PRD_SAAS_AO_BTP.md`.

**Objectif :** Automatiser la réponse aux appels d'offres BTP via l'IA (Claude API) — analyse DCE, compliance matrix, checklist candidature, génération de mémoire technique (~20 pages), export Word.

## Stack technique

- **Frontend :** React 18 + TypeScript + Tailwind CSS + shadcn/ui + Zustand + React Router v6
- **Backend :** FastAPI (Python) + SQLAlchemy + PostgreSQL + Redis + Celery
- **IA :** Claude API — Sonnet 4.6 (extraction, analyse, génération mémoire), Opus 4.7 (réécriture ciblée de paragraphe + fallback)
- **Stockage :** AWS S3 (fichiers), Stripe (paiement)
- **Déploiement :** Hostinger VPS (Nginx + FastAPI + Postgres + Redis + Celery)

## Architecture des fichiers

Respecter strictement l'architecture définie dans le PRD (section 2.4).

## Règles de développement

- Toujours écrire du code propre, typé (TypeScript strict, Pydantic pour Python)
- **Ne jamais hardcoder de clés API ou secrets** — utiliser les variables d'environnement
- Suivre les conventions de nommage : camelCase (JS/TS), snake_case (Python)
- Les modèles IA : Sonnet 4.6 pour extraction/matching **et génération mémoire** ; Opus 4.7 pour la réécriture ciblée de paragraphe
- Écrire des tests pour les fonctions critiques (auth, IA, export)
- Utiliser les schémas Pydantic pour toute validation de données côté backend
- Les tâches longues (analyse DCE, génération mémoire) sont des tâches Celery asynchrones

## Phases de développement

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

Les prompts système sont définis dans `backend/services/ai/prompts.py` et documentés dans le PRD (section 4).

## Notes importantes

- L'onboarding est progressif : l'utilisateur complète son profil en travaillant (pas de formulaire long au départ)
- Le coffre-fort documentaire est central : les documents uploadés lors d'un AO y sont automatiquement stockés
- Les templates de mémoire s'améliorent au fil des utilisations ("Utiliser comme référence")
- Toujours référencer la source dans le document original pour chaque exigence extraite (confiance utilisateur)
