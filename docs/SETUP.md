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

## Déploiement

La production tourne sur un **VPS Hostinger** (Ubuntu Server 24.04 LTS) —
stack **Nginx + FastAPI (uvicorn) + PostgreSQL 16 + Redis 7 + Celery**, le tout
géré par **systemd**. Procédure complète d'installation, services systemd,
reverse-proxy SSL et sauvegardes : voir **[DEPLOYMENT.md](DEPLOYMENT.md)** et
**[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)**.

### Taille maximale des uploads

L'API accepte des uploads DCE jusqu'à **2 Go** (streaming sur disque via
`SpooledTemporaryFile`, jamais en RAM). Le reverse-proxy nginx en amont doit
être configuré pour ne pas tronquer ces requêtes — par défaut nginx coupe à
1 Mo.

### nginx

Dans le `server { ... }` ou `location /api/ { ... }` qui sert FastAPI :

```nginx
client_max_body_size 2g;
client_body_timeout  600s;
proxy_request_buffering off;     # streaming pass-through, sinon nginx bufferise tout
proxy_read_timeout   600s;
proxy_send_timeout   600s;
```

### Cloudflare (si placé devant le VPS)

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
