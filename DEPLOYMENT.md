# Déploiement Synorix sur VPS Hostinger

**Cible :** Ubuntu Server 24.04 LTS sur Hostinger (KVM 4 ou supérieur recommandé : 4 vCPU / 16 Go RAM / 200 Go SSD).
**Domaine :** `synorix.fr` (ou `.io` / `.com` selon décision Mohamed).
**Stack :** PostgreSQL 16 + Redis 7 + nginx + uvicorn (FastAPI) + Vite build statique + systemd.

> Pré-requis : DNS A pointant vers l'IP du VPS, SSH key Mohamed déjà uploadée chez Hostinger.

---

## 1. Setup initial du serveur

### 1.1 Connexion + utilisateur dédié

```bash
ssh root@VOTRE_IP

# Création d'un utilisateur sans privilèges sudo seulement (pour les services)
adduser --system --group --no-create-home synorix

# Création d'un user opérateur (déploiement, debug)
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 1.2 Sécurisation SSH

`/etc/ssh/sshd_config` :
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy
```
```bash
systemctl restart ssh
```

### 1.3 Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

### 1.4 fail2ban

```bash
apt update && apt install -y fail2ban
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban
fail2ban-client status sshd
```

### 1.5 Mises à jour automatiques

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

---

## 2. Installation des dépendances

```bash
apt install -y \
  build-essential python3.12 python3.12-venv python3-pip \
  postgresql-16 postgresql-contrib-16 \
  redis-server \
  nginx certbot python3-certbot-nginx \
  curl git rsync \
  imagemagick poppler-utils libreoffice
# poppler / libreoffice : conversion PDF / DOCX
# imagemagick : redimensionnement Maps statiques
```

---

## 3. Base de données

```bash
sudo -u postgres psql <<EOF
CREATE USER synorix WITH PASSWORD 'CHANGE_ME_USE_OPENSSL_RAND_HEX_32';
CREATE DATABASE synorix OWNER synorix;
EOF
```

`/etc/postgresql/16/main/postgresql.conf` :
- `listen_addresses = 'localhost'`
- `shared_buffers = 4GB` (sur un 16 Go RAM)
- `work_mem = 32MB`
- `effective_cache_size = 12GB`
- `max_connections = 100`

`/etc/postgresql/16/main/pg_hba.conf` : laisser uniquement local/peer + local/scram-sha-256 pour `synorix`.

```bash
systemctl restart postgresql
```

---

## 4. Redis

`/etc/redis/redis.conf` :
- `bind 127.0.0.1`
- `requirepass CHANGE_ME_RANDOM_64_CHARS`
- `maxmemory 1gb`
- `maxmemory-policy allkeys-lru`

```bash
systemctl restart redis-server
```

> Redis sert le rate-limit slowapi et plus tard le cache distribué.

---

## 5. Code source + virtualenv

```bash
# /srv/synorix appartient à deploy mais est exécuté par synorix
mkdir -p /srv/synorix
chown deploy:synorix /srv/synorix
cd /srv/synorix
sudo -u deploy git clone git@github.com:magataittinge-dotcom/saas-ao.git .

# venv Python
sudo -u deploy python3.12 -m venv backend/venv
sudo -u deploy backend/venv/bin/pip install --upgrade pip
sudo -u deploy backend/venv/bin/pip install -r backend/requirements.txt

# Frontend build
sudo -u deploy bash -c '
  cd /srv/synorix/frontend
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  apt install -y nodejs
  npm ci
  npm run build
'
```

---

## 6. Variables d'environnement

`/srv/synorix/backend/.env` (chmod 600, owned by `synorix`) :

```
DEBUG=false
SECRET_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://synorix:LE_PWD_PG@localhost:5432/synorix
REDIS_URL=redis://:LE_PWD_REDIS@localhost:6379/0
ANTHROPIC_API_KEY=sk-ant-prod-XXXXXXXX
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=synorix-prod
AWS_REGION=eu-west-3
CLERK_SECRET_KEY=sk_live_XXX
CLERK_JWKS_URL=https://clerk.synorix.fr/.well-known/jwks.json
STRIPE_SECRET_KEY=sk_live_XXX
STRIPE_WEBHOOK_SECRET=whsec_XXX
GOOGLE_MAPS_API_KEY=AIzaSyB...
FRONTEND_URL=https://synorix.fr
SENTRY_DSN=https://...@sentry.io/...   # optional, P1
```

```bash
chown synorix:synorix /srv/synorix/backend/.env
chmod 600 /srv/synorix/backend/.env
```

---

## 7. systemd — service uvicorn

`/etc/systemd/system/synorix-api.service` :

```ini
[Unit]
Description=Synorix FastAPI backend
After=network.target postgresql.service redis-server.service
Requires=postgresql.service

[Service]
Type=simple
User=synorix
Group=synorix
WorkingDirectory=/srv/synorix/backend
EnvironmentFile=/srv/synorix/backend/.env
ExecStart=/srv/synorix/backend/venv/bin/uvicorn main:app \
  --host 127.0.0.1 --port 8000 \
  --workers 4 --proxy-headers --forwarded-allow-ips '*' \
  --access-log --log-config /srv/synorix/backend/log_config.json
Restart=always
RestartSec=5
KillSignal=SIGQUIT
TimeoutStopSec=30

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/synorix/backend/uploads /var/log/synorix
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now synorix-api
journalctl -u synorix-api -f   # check startup
```

---

## 8. nginx — reverse proxy + SSL

`/etc/nginx/sites-available/synorix` :

```nginx
# HTTP → HTTPS
server {
    listen 80;
    server_name synorix.fr www.synorix.fr;
    return 301 https://synorix.fr$request_uri;
}

# Forced www → apex
server {
    listen 443 ssl http2;
    server_name www.synorix.fr;
    ssl_certificate     /etc/letsencrypt/live/synorix.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/synorix.fr/privkey.pem;
    return 301 https://synorix.fr$request_uri;
}

server {
    listen 443 ssl http2;
    server_name synorix.fr;

    ssl_certificate     /etc/letsencrypt/live/synorix.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/synorix.fr/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    client_max_body_size 2200M;   # 2 GB DCE uploads
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    # SPA frontend
    root /srv/synorix/frontend/dist;
    index index.html;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;       # streaming Anthropic
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache long pour les assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/synorix.access.log;
    error_log  /var/log/nginx/synorix.error.log;
}
```

```bash
ln -s /etc/nginx/sites-available/synorix /etc/nginx/sites-enabled/synorix
nginx -t && systemctl reload nginx
```

### SSL Let's Encrypt

```bash
certbot --nginx -d synorix.fr -d www.synorix.fr \
  --email contact@synorix.fr --agree-tos --redirect
# Renouvellement automatique installé par défaut
systemctl status snap.certbot.renew.timer
```

---

## 9. Services additionnels

### 9.1 Bot Telegram (si activé via skill telegram)

`/etc/systemd/system/synorix-telegram.service` :

```ini
[Unit]
Description=Synorix Telegram bridge
After=network.target

[Service]
Type=simple
User=synorix
Group=synorix
WorkingDirectory=/srv/synorix/backend
EnvironmentFile=/srv/synorix/backend/.env
ExecStart=/srv/synorix/backend/venv/bin/python -m services.telegram_bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 9.2 Worker Celery (si activé)

```ini
[Unit]
Description=Synorix Celery worker
After=network.target redis-server.service synorix-api.service

[Service]
Type=simple
User=synorix
Group=synorix
WorkingDirectory=/srv/synorix/backend
EnvironmentFile=/srv/synorix/backend/.env
ExecStart=/srv/synorix/backend/venv/bin/celery -A tasks worker -l info -c 2
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 10. Script de déploiement

`/srv/synorix/deploy.sh` (exécuté par `deploy`) :

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/synorix

echo "→ Pull main"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "→ Backend deps"
sudo -u deploy backend/venv/bin/pip install -r backend/requirements.txt --quiet

echo "→ Frontend build"
( cd frontend && sudo -u deploy npm ci --quiet && sudo -u deploy npm run build )

echo "→ DB migrations (alembic)"
sudo -u synorix backend/venv/bin/alembic -c backend/alembic.ini upgrade head || \
    echo "Alembic not yet initialized — runtime _ensure_schema_columns will handle it."

echo "→ Restart services"
sudo systemctl restart synorix-api
sudo systemctl reload nginx
echo "→ Health check"
sleep 3
curl -fsS https://synorix.fr/api/health | jq .
echo "✓ Deployed"
```

```bash
chmod +x /srv/synorix/deploy.sh
```

Puis sur ton poste local :
```bash
ssh deploy@synorix.fr /srv/synorix/deploy.sh
```

---

## 11. Backup automatique

Voir `BACKUP_RECOVERY.md` pour le détail. Cron quotidien à 03:00, rotation 7 jours, S3 sync hebdo.

---

## 12. Monitoring de base

### 12.1 Uptime check via cron

`/etc/cron.d/synorix-uptime` :

```cron
* * * * * synorix /usr/bin/curl -fsS https://synorix.fr/api/health > /dev/null || echo "[$(date)] Synorix DOWN" | mail -s "ALERT Synorix down" mohamed@synorix.fr
```

### 12.2 Logs

- `journalctl -u synorix-api -f` — runtime + erreurs
- `tail -f /var/log/nginx/synorix.access.log` — trafic
- `tail -f /var/log/nginx/synorix.error.log` — erreurs proxy

### 12.3 Sentry (P1)

Ajouter `SENTRY_DSN` dans `.env` ; le SDK Sentry sera initialisé dans `main.py` quand on l'aura branché (Phase 2.8 — backlog).

---

## 13. Procédure de rollback

Si une release casse la prod :

```bash
ssh deploy@synorix.fr <<'EOF'
cd /srv/synorix
# Lister les 5 dernières releases
git log --oneline -5
# Repointer la prod sur le commit précédent
git checkout <SHA_DU_DERNIER_BON_COMMIT>
backend/venv/bin/pip install -r backend/requirements.txt --quiet
( cd frontend && npm ci --quiet && npm run build )
sudo systemctl restart synorix-api
sudo systemctl reload nginx
EOF
```

> Si la régression vient d'une migration DB destructive (rare avec notre `_ensure_schema_columns` additif), restaurer depuis `BACKUP_RECOVERY.md` §3.

---

## 14. Checklist pré-mise en prod

- [ ] DNS A `synorix.fr` → IP VPS validé
- [ ] DNS A `www.synorix.fr` → IP VPS validé
- [ ] SSL Let's Encrypt installé
- [ ] `.env` rempli avec toutes les vraies valeurs (pas de `sk_test_...`)
- [ ] Stripe webhook configuré sur `https://synorix.fr/api/stripe/webhook`
- [ ] Clerk JWKS_URL pointe vers la prod (pas le dev clerk.accounts.dev)
- [ ] firewall ufw active (22, 80, 443 only)
- [ ] fail2ban actif
- [ ] Service `synorix-api` démarre au boot (`systemctl is-enabled synorix-api`)
- [ ] Cron de backup fonctionnel (`crontab -l -u synorix`)
- [ ] Health check `https://synorix.fr/api/health` → `{"status":"ok","db":"up"}`
- [ ] Endpoint `/api/metrics` retourne du JSON
- [ ] Mention légale + politique RGPD publiées
- [ ] DPA Anthropic signé
- [ ] Plan facturation Anthropic configuré (alerte email à 100 €/jour)
- [ ] Plan facturation Hostinger payé pour 12 mois (économie ~30 %)

---

## 15. Performance — sizing recommandé

| Phase | Clients | VPS | Coût mensuel |
|---|---|---|---|
| MVP / 1ʳᵉ year | 0-50 payants | KVM 4 (4vCPU, 16 Go) | ~30 € |
| Croissance | 50-200 | KVM 8 (8vCPU, 32 Go) | ~60 € |
| Scale-up | 200-500 | 2× KVM 8 + load balancer (HAProxy ou Cloudflare) | ~150 € |
| Au-delà | 500+ | Migrer Hetzner Cloud / OVH Public Cloud avec auto-scale | ~variable |

Le bottleneck principal sera **Anthropic API quota / coûts**, pas les ressources serveur.
