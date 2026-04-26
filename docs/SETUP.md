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

## Déploiement — taille maximale des uploads

L'API accepte des uploads DCE jusqu'à **2 Go** (streaming sur disque via
`SpooledTemporaryFile`, jamais en RAM). En production, le proxy en amont doit
être configuré pour ne pas tronquer ces requêtes — par défaut nginx coupe à
1 Mo et la plupart des PaaS appliquent leurs propres limites.

### nginx

Dans le `server { ... }` ou `location /api/ { ... }` qui sert FastAPI :

```nginx
client_max_body_size 2g;
client_body_timeout  600s;
proxy_request_buffering off;     # streaming pass-through, sinon nginx bufferise tout
proxy_read_timeout   600s;
proxy_send_timeout   600s;
```

### Render

Dans `render.yaml` (ou via le dashboard) sur le service web FastAPI :

```yaml
services:
  - type: web
    runtime: python
    plan: standard          # le plan free coupe à ~100 Mo
    envVars:
      - key: WEB_CONCURRENCY
        value: "2"
    # Render n'expose pas client_max_body_size; le runtime accepte 2 Go par défaut
    # sur les plans payants. Vérifier `Settings > Networking > Request size limit`.
```

### Railway

Railway proxifie via un edge sans limite de taille fixe, mais le timeout HTTP
par défaut est 100 s. Pour des uploads de 2 Go sur connexions lentes :

```bash
railway variables set RAILWAY_HTTP_TIMEOUT=600
```

### Cloudflare (si utilisé en frontend)

Les plans Free/Pro plafonnent les requêtes à **100 Mo**. Pour autoriser 2 Go,
soit passer en plan Business (500 Mo) / Enterprise (5 Go), soit exclure
`/api/projects/*/documents` de Cloudflare via une Page Rule **Bypass Cache &
Disable Performance** ou un sous-domaine direct (`api-direct.synorix.fr`).

### Vérification

```bash
# Doit renvoyer 413 immédiatement, sans transférer le corps
curl -X POST https://api.synorix.fr/api/projects/<id>/documents \
  -H "Content-Length: 3221225472" \
  -F "file=@small.pdf"
```

Un 413 rapide ⇒ le proxy laisse passer la limite applicative (FastAPI). Un
413 d'nginx (HTML) ⇒ le `client_max_body_size` est encore trop bas.
