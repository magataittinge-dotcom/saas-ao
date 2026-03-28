# Guide d'installation — SaaS AO BTP

## Prérequis

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+

## Backend (FastAPI)

```bash
cd backend

# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Installer les dépendances
pip install -r requirements.txt

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# Démarrer le serveur
uvicorn main:app --reload --port 8000
```

L'API sera disponible sur http://localhost:8000
Documentation Swagger : http://localhost:8000/api/docs

## Frontend (React)

```bash
cd frontend

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env

# Démarrer le serveur de dev
npm run dev
```

L'application sera disponible sur http://localhost:3000

## Base de données

```bash
# Créer la base de données PostgreSQL
psql -U postgres -c "CREATE DATABASE saas_ao;"

# Les tables sont créées automatiquement au démarrage de FastAPI
# (Base.metadata.create_all dans main.py)
```

## Celery (tâches asynchrones)

```bash
cd backend
source venv/bin/activate

# Worker Celery
celery -A tasks.check_expiry.celery_app worker --loglevel=info

# Scheduler Celery Beat (vérifications quotidiennes)
celery -A tasks.check_expiry.celery_app beat --loglevel=info
```

## shadcn/ui (composants UI)

```bash
cd frontend

# Initialiser shadcn/ui
npx shadcn-ui@latest init

# Ajouter les composants nécessaires
npx shadcn-ui@latest add button input label card badge dialog select tabs toast
```
