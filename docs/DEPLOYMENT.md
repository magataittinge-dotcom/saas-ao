# Déploiement Synorix sur VPS Hostinger

**Cible :** Ubuntu Server 24.04 LTS sur Hostinger **KVM 2 (2 vCPU, 8 Go, 100 Go)** — décision du 30/10/2026 (le KVM 1 : 1 vCPU, 4 Go, 50 Go, était la cible du 25/10). Les réglages du dépôt (`deploy/`) sont dimensionnés pour lui : une API à un seul processus, deux enfants PDFium, Celery à 2, mémoire plafonnée par service (somme des plafonds 7100 Mo sur 8192, détail et calcul dans `deploy/systemd/synorix-api.service`, vérifié par `backend/tests/test_deploy_kvm2.py`), swap de 2 Go.
**Fichiers de configuration :** `deploy/` est la **source de vérité** (nginx, systemd, Postgres, Redis, journald, sysctl, cron). Cette page explique ; elle ne recopie plus ces fichiers. Procédure de mise en place pas à pas, avec vérification et retour arrière : `.claude/echange/sprint-ozcan/VPS.md` (partie « Procédure du bloc 6 »).
**Domaine :** `synorix.tech` (ou `.io` / `.com` selon décision Mohamed).
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

Fichier : `deploy/ssh/00-synorix.conf` → `/etc/ssh/sshd_config.d/00-synorix.conf` (clé seulement, jamais
root, seul `deploy`). Le préfixe « 00 » compte : sshd garde la **première** valeur lue, et Ubuntu 24.04 livre
`50-cloud-init.conf` avec `PasswordAuthentication yes`. Vérifié avec le sshd de noble, ce fichier de
cloud-init présent : `sshd -t` OK, valeurs effectives `passwordauthentication no`, `permitrootlogin no`.
Clé de Mohamed **protégée par une phrase de passe** ; `deploy` garde un sudo **avec mot de passe** (jamais
`NOPASSWD`). Ne jamais redémarrer ssh sans `sudo sshd -t` d'abord, ni sans une 2e session ouverte ; la
Console Web d'Hostinger sert de secours.
```bash
sudo sshd -t && sudo systemctl restart ssh
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

Fichier : `deploy/fail2ban/synorix.conf` → `/etc/fail2ban/jail.d/synorix.conf` (journal de systemd ;
5 échecs en 10 min → 1 h de bannissement, doublé à chaque récidive).
```bash
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### 1.5 Mises à jour automatiques

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

---

## 2. Installation des dépendances

Noms vérifiés dans Ubuntu 24.04 (noble) le 27/10/2026. **Pas de Node sur le serveur** : le front est
construit sur le PC de Mohamed et envoyé par rsync (§10 ; noble ne fournit que Node 18).

```bash
apt install -y \
  python3.12-venv \
  postgresql-16 postgresql-16-pgvector postgresql-contrib \
  redis-server \
  nginx libnginx-mod-http-brotli-static certbot python3-certbot-nginx \
  libreoffice-core-nogui libreoffice-writer-nogui libreoffice-calc-nogui fonts-crosextra-carlito \
  poppler-utils restic fail2ban rsync git curl
```
- `postgresql-16-pgvector` : **requis**, la migration 0003 crée l'extension `vector` (corpus RAG).
- LibreOffice sans interface graphique (Writer pour les Word, Calc pour les tableurs) : export PDF du
  mémoire et aperçu des Word déposés. Vérifier : `soffice --version`.
- Carlito (métriques de Calibri) : le code montre à LibreOffice la copie du dépôt
  (`backend/assets/fonts/carlito`, OFL) par un `fonts.conf` ; le paquet sert de secours.
  Vérifier : `pdffonts` d'un PDF exporté ne montre ni DejaVu ni Liberation.
- `poppler-utils` : `pdffonts` et `pdfinfo`, pour les vérifications (le code n'en dépend pas).
- `restic` : sauvegardes chiffrées hors du VPS (§11). `libnginx-mod-http-brotli-static` : fichiers `.br`
  du build (§8).
- Aucune dépendance Python ne se compile : toutes s'installent depuis des wheels (pas de `build-essential`).

---

## 3. Base de données

Le mot de passe est tapé par Mohamed au clavier (`\password`), jamais écrit dans un fichier :
```bash
sudo -u postgres createuser --no-superuser --no-createdb --no-createrole synorix
sudo -u postgres psql -c "\password synorix"
sudo -u postgres createdb -O synorix synorix
# L'extension vector demande un superutilisateur : créée UNE fois ici, la migration 0003
# (CREATE EXTENSION IF NOT EXISTS) passe ensuite avec le rôle synorix, qui ne l'est pas.
sudo -u postgres psql -d synorix -c "CREATE EXTENSION IF NOT EXISTS vector"
```
Prouvé sur une base jetable (27/10/2026, Postgres 16, pgvector 0.6.0, rôle sans superutilisateur) :
sans cette ligne, `alembic upgrade head` échoue à la migration 0003 (« permission denied to create
extension vector ») ; avec elle, les 34 migrations passent (0034 head, 25 tables dont `alembic_version`,
schéma identique aux modèles hors `rag_chunks`, créée en SQL), puis l'API démarre (`/api/health` :
`db: up`). La head est aujourd'hui **`0037_index_echelle`** : **0035** ajoute la colonne `suppression_prevue_le` sur
`organizations` (D23 ; sans elle, toute lecture d'une organisation rend 500), **0036** la table `styles_entreprise`
(fonction C4, éteinte ; 26 tables dont `alembic_version`), **0037** des index. Une base déjà à `0034` joue les trois.
La migration **0037** (index de lecture à l'échelle) crée l'extension `pg_trgm` : extension « de confiance »
(Postgres ≥ 13), le rôle synorix, propriétaire de la base, la crée sans superutilisateur. `alembic check` passe sur une
base neuve (R-02, 12/11/2026) : il peut servir de garde avant une mise en ligne.

`/etc/postgresql/16/main/postgresql.conf` : `listen_addresses = 'localhost'`.
Les réglages de mémoire et de connexions sont dans `deploy/postgres/synorix.conf`, installé en
`/etc/postgresql/16/main/conf.d/synorix.conf` (KVM 2 : `shared_buffers = 1GB`, `max_connections = 80`, `work_mem = 16MB`,
`idle_in_transaction_session_timeout = 10min`).

`/etc/postgresql/16/main/pg_hba.conf` : laisser uniquement local/peer + local/scram-sha-256 pour `synorix`.

```bash
systemctl restart postgresql
```

---

## 4. Redis

`/etc/redis/redis.conf` :
- `bind 127.0.0.1`
- `requirepass CHANGE_ME_RANDOM_64_CHARS`
- dernière ligne : `include /etc/redis/synorix.conf` (`deploy/redis/synorix.conf` : `maxmemory 256mb`,
  `maxmemory-policy noeviction` — un broker Celery ne doit jamais perdre une tâche en silence).

```bash
systemctl restart redis-server
```

> Redis sert le rate-limit slowapi et plus tard le cache distribué.

---

## 5. Code source + virtualenv

```bash
# /srv/synorix appartient à deploy ; le code est lu (pas écrit) par synorix
sudo install -d -o deploy -g synorix -m 750 /srv/synorix
# clé de déploiement GitHub en lecture seule, propre au serveur (§10)
sudo -u deploy git clone git@github.com:magataittinge-dotcom/saas-ao.git /srv/synorix
sudo -u deploy python3.12 -m venv /srv/synorix/backend/venv
sudo -u deploy /srv/synorix/backend/venv/bin/pip install -r /srv/synorix/backend/requirements.txt
```
Front : **aucun Node sur le serveur**. `frontend/.env.production` vit sur le PC de Mohamed (ignoré par
git) : Vite fige `import.meta.env` au build. `VITE_CLERK_PUBLISHABLE_KEY` (clé publique de Clerk) est
requise, sinon page blanche ; `VITE_API_URL` reste vide (même origine, nginx mandate `/api/`).
Envoi : §10.

---

## 6. Variables d'environnement

`/etc/synorix/synorix.env` (**root, 0600** ; décision du 27/10) : systemd le lit en root avant de lancer les
services (`EnvironmentFile`), l'utilisateur `synorix` ne peut pas le lire, et il n'y a **aucun
`backend/.env` en production** (la config ne lit `.env` que s'il existe). Les commandes ponctuelles
(alembic, simulation de purge) passent par `systemd-run` avec le même fichier, §10. Les valeurs sont
tapées par Mohamed sur le serveur, jamais dans le dépôt ni dans un journal :

```
DEBUG=false
SECRET_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://synorix:LE_PWD_PG@localhost:5432/synorix
REDIS_URL=redis://:LE_PWD_REDIS@localhost:6379/0
ANTHROPIC_API_KEY=sk-ant-prod-XXXXXXXX
CLERK_SECRET_KEY=sk_live_XXX
CLERK_JWKS_URL=https://clerk.synorix.tech/.well-known/jwks.json
STRIPE_SECRET_KEY=sk_live_XXX
STRIPE_WEBHOOK_SECRET=whsec_XXX
STRIPE_PRODUCT_ESSENTIEL=prod_XXX      # produit Stripe de l'offre Essentiel ; vide = paiement en ligne de l'offre fermé (503)
STRIPE_PRODUCT_PRO=prod_XXX            # produit Pro du mode réel ; obligatoire avec sk_live_ (refus de démarrer sinon)
STRIPE_PRODUCT_BUSINESS=prod_XXX       # produit Business du mode réel ; obligatoire avec sk_live_ (refus de démarrer sinon)
FRONTEND_URL=https://synorix.tech
METRICS_TOKEN=$(openssl rand -hex 32)  # ops : accès /api/metrics (S3.5) — sans lui, endpoint fermé (404)
SYNORIX_X_ACCEL_PREFIX=/_fichiers_internes
SYNORIX_CACHE_APERCUS_DIR=/srv/synorix/backend/cache/apercus
SYNORIX_PURGE_AO_ACTIVE=0              # 1 après la simulation et une sauvegarde (VPS.md C11, décision D15)
SYNORIX_PURGE_AO_JOURS=30
```

**Ne pas poser `AWS_*` en V1** : avec `AWS_ACCESS_KEY_ID` et `AWS_S3_BUCKET` remplis, `services/file_storage.py` range
les pièces dans S3 au lieu du disque du VPS, alors que le service des documents (X-Accel-Redirect), le quota de
stockage, la garde du disque, la purge et les sauvegardes restic supposent le disque (`backend/uploads`).

**Toutes les variables lues par le code** (relevé du 12/11/2026 : `os.environ`, `getenv`, réglages Pydantic de
`config/__init__.py`, `import.meta.env` ; exemples complets dans `backend/.env.example` et `frontend/.env.example`).
Valeur par défaut entre parenthèses ; pour les plafonds, `0` coupe la garde.

| Groupe | Variables (défaut) | Ce qu'elles font |
|---|---|---|
| Démarrage | `DEBUG` (false), `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL` (redis://localhost:6379/0), `FRONTEND_URL` (http://localhost:3000) | Hors `DEBUG`, l'API refuse de démarrer si `SECRET_KEY` est courte, si `CLERK_*` ou `STRIPE_WEBHOOK_SECRET` manquent, si la clé Stripe est de production sans `STRIPE_PRODUCT_PRO` et `STRIPE_PRODUCT_BUSINESS`, si `FRONTEND_URL` vise localhost, ou si `SYNORIX_ANALYSE_DEMO` est allumé. `FRONTEND_URL` est la seule origine CORS acceptée. |
| IA | `ANTHROPIC_API_KEY`, `MEMOIRE_MODELE` (vide = Sonnet 5.5), `VOYAGE_API_KEY` (vide), `RAG_ENRICHMENT` (false), `SYNORIX_ANALYSE_DEMO` (false, interdit en production), `COUT_USD_EUR` (0.92) | Clés et modèle ; le RAG reste coupé en V1 ; taux indicatif du journal des coûts. |
| Connexion | `CLERK_SECRET_KEY`, `CLERK_JWKS_URL` | Instance Clerk (développement ou production, VPS.md B5). |
| Paiement | `BILLING_PROVIDER` (stripe), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRODUCT_ESSENTIEL` (vide), `STRIPE_PRODUCT_PRO` et `STRIPE_PRODUCT_BUSINESS` (vides = produits du mode test, seulement avec une clé `sk_test_`) | Carte seulement ; webhook sur `https://synorix.tech/api/stripe/webhook`. Avec une clé `sk_live_`, l'API refuse de démarrer hors `DEBUG` si `STRIPE_PRODUCT_PRO` ou `STRIPE_PRODUCT_BUSINESS` est vide (ou vaut un produit du mode test). Le montant facturé est le **prix par défaut** de chaque produit dans le tableau de bord Stripe, pas une valeur du code. |
| Plafonds d'usage (S-01 à S-06, D8, D24) | `PLAFOND_JOUR_ANALYSES` (20), `PLAFOND_JOUR_MEMOIRES` (20), `PLAFOND_JOUR_QUESTIONS` (10, « Préparer les questions »), `IMPORT_MEMOIRE_MAX_PAR_JOUR` (5), `REFORMULER_MAX_PAR_JOUR` (30), `BUDGET_IA_JOUR_EUR` (60), `BUDGET_IA_FORFAIT_ANALYSE_EUR` (3), `BUDGET_IA_FORFAIT_MEMOIRE_EUR` (1.5), `BUDGET_IA_FORFAIT_REFAIRE_EUR` (0.5), `BUDGET_IA_FORFAIT_APPEL_EUR` (0.2), `BUDGET_IA_RESERVATION_MINUTES` (120) | Par organisation et par jour, toutes offres. Au-delà : « Plafond du jour atteint. Il se remet à zéro demain. » |
| Fonctions d'IA livrées éteintes (C1 à C4) | `RELECTURE_PROPOSER`, `REECRIRE_TROIS`, `FICHE_PROPOSEE`, `STYLE_ENTREPRISE` (toutes 0) | `services/fonctions_ia.py`. Éteinte : route 404, aucun bouton, aucun coût. Allumer une à une (`1`, puis redémarrer l'API ; le front la voit en 5 minutes) après un passage réel vérifié ; C4 suppose la migration 0036. Plafonds sur 24 h dans le code : C1 et C2 partagent les 60 réécritures, C3 20, C4 5. |
| AO offert (D7, D25) | `ESSAI_EXIGE_SIRET` (0) | 1 = l'AO offert exige un SIRET vérifié ; **à 1 le jour où les inscriptions sont publiques**. |
| Stockage (D15, D24) | `QUOTA_STOCKAGE_GO` (20), `QUOTA_STOCKAGE_GRATUIT_GO` (5), `DISQUE_LIBRE_MIN_POURCENT` (15) | Quota par organisation (413) ; refus des dépôts sous 15 % de disque libre (507). |
| Dépôts de « Mon entreprise » | `DEPOT_APPELS_PAR_JOUR` (60), `DEPOT_BUDGET_MENSUEL_EUR` (3), `DEPOT_LECTURES_EN_ATTENTE` (10) | Lectures Haiku par entreprise ; au-delà, reportées et reprises par la tâche horaire du beat. |
| Purge (B18, D15) | `SYNORIX_PURGE_AO_ACTIVE` (0 = simulation), `SYNORIX_PURGE_AO_JOURS` (30) | AO supprimés depuis N jours : fichiers effacés par le worker. |
| E-mails | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (tous vides) | Vides : notifications dans l'appli seulement (les e-mails de connexion sont envoyés par Clerk). |
| Exploitation | `METRICS_TOKEN` (vide = `/api/metrics` fermé), `SYNORIX_X_ACCEL_PREFIX` (vide), caches et isolation ci-dessous | |
| Fils de `to_thread` (R-04) | `SYNORIX_FILS_TO_THREAD` (16, borné à 64) | Fils de l'exécuteur de `asyncio.to_thread`, posé au démarrage (`services/executeur.py`). Sans lui, asyncio en prend `cpu + 4` (5 sur 1 vCPU), partagés par les appels courts à l'IA (10 à 60 s), les copies vers le coffre et les aperçus PDF. Ces fils attendent le réseau ou un processus PDFium, pas le CPU : 16 suffit au lancement. |
| Stockage objet (pas en V1) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` (vides), `AWS_REGION` (eu-west-3) | Laisser vides (voir plus haut). |
| Locale | `COUNTRY_CODE` (FR), `CURRENCY` (EUR), `CURRENCY_SYMBOL` (€), `TAX_RATE` (0.20), `TAX_LABEL` (TVA), `TIMEZONE` (Europe/Paris), `LOCALE` (fr_FR), `DATE_FORMAT` (%d/%m/%Y), `COMPANY_NAME` (Synorix), `COMPANY_ADDRESS`, `COMPANY_VAT_NUMBER`, `COMPANY_REGISTRATION_NUMBER`, `LEGAL_JURISDICTION` (FR) | `config/locale.py` ; rien à poser pour la France. |
| Front (au build, sur le PC) | `VITE_CLERK_PUBLISHABLE_KEY` (obligatoire), `VITE_API_URL` (vide en production), `VITE_PROXY_API` (serveur de développement seulement) | Figées dans le paquet par `npm run build` (`frontend/.env.production`). |

`APP_NAME`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` (restes de l'authentification d'avant Clerk) ne sont plus des
réglages : posés dans le fichier d'environnement, ils sont ignorés. `SEED_*` ne sert qu'au script `seed_test_user.py`.

> Sentry n'est **pas encore câblé** (backlog O4) : ne pas ajouter `SENTRY_DSN`
> tant que `sentry-sdk` n'est pas intégré à `main.py`. Les clés inconnues dans
> le `.env` sont désormais ignorées au boot (R1), mais la règle reste : le
> `.env` ne contient que des variables que le code lit réellement.

> `/api/metrics` expose des agrégats **plateforme** (cross-org). Il n'est
> jamais public : en prod, sans `METRICS_TOKEN` il renvoie 404 ; avec, il exige
> `Authorization: Bearer $METRICS_TOKEN`. Scrape ops/Prometheus → passer ce header.

```bash
sudo install -d -m 700 /etc/synorix
sudo install -m 600 /dev/null /etc/synorix/synorix.env
sudoedit /etc/synorix/synorix.env
```

### Lecture des PDF déposés : des processus isolés (KVM 2)

Toute pièce déposée est lue par PDFium dans un **processus enfant** (2 sur le KVM 2, réglé par l'unité systemd ; 1 par défaut dans le code) (`services/pdfium_processus.py`),
jamais dans l'API : recyclé, plafonné en mémoire (`RLIMIT_AS`) et avec un délai par pièce. Une pièce
piégée devient « non lisible » avec un avertissement qui la nomme ; l'API reste debout. Mesuré sur le
DCE de démonstration (99 pièces) : l'API reste à 15 Mo, l'enfant monte à 603 Mo résidents sur le plus
gros plan, et retombe à 25 Mo. Réglages facultatifs du `.env` (valeurs par défaut entre parenthèses) :

```
SYNORIX_EXTRACTION_PROCESSUS=1     # 0 = extraction dans l'API (diagnostic seulement, sans protection)
SYNORIX_PDFIUM_PROCESSUS=1         # nombre d'enfants PDFium : 1 par défaut ; 2 sur le KVM 2 (posé dans synorix-api.service)
SYNORIX_PDFIUM_AS_MO=1536          # plafond de mémoire virtuelle d'un enfant (0 = aucun)
SYNORIX_PDFIUM_TACHES_MAX=40       # l'enfant est remplacé après N tâches
SYNORIX_PDFIUM_RSS_MAX_MO=350      # ... ou dès que sa mémoire résidente dépasse ce seuil
SYNORIX_PDFIUM_ATTENTE_S=5         # attente d'un processus libre, travail interactif (aperçu) : puis 503 + Retry-After
SYNORIX_PDFIUM_ATTENTE_EXTRACTION_S=600   # idem pour l'extraction au dépôt (la pièce est alors à redéposer)
SYNORIX_X_ACCEL_PREFIX=/_fichiers_internes   # document entier servi par nginx (§8) ; vide en dev
SYNORIX_CACHE_APERCUS_DIR=/srv/synorix/backend/cache/apercus   # cache des images d'aperçu (hors webroot)
SYNORIX_CACHE_APERCUS_MO=2048      # plafond du cache, éviction LRU (2 Go = 2 % du disque de 100 Go)
SYNORIX_CACHE_FICHES_DIR=/srv/synorix/backend/cache/fiches   # pages d'aperçu des fiches « Mon entreprise » (hors webroot)
SYNORIX_CACHE_FICHES_MO=256        # plafond à part, éviction LRU (une fiche = 1 à 5 pages de ~100 Ko)
```

### LibreOffice : fichiers déposés convertis sans secret ni réseau

Les Word déposés (aperçu de « Voir dans le DCE ») et l'export PDF du mémoire passent par
`services/libreoffice_isole.py` : environnement en liste blanche (aucune variable du `.env`), profil
jetable par conversion (B19), **une conversion à la fois** (verrou partagé par l'API et le worker dans
`cache/libreoffice`), délai, plafond de mémoire, profil LibreOffice qui refuse les liens distants
(`BlockUntrustedRefererLinks`, mesuré : 9 connexions sortantes sans lui, 0 avec), espace de noms réseau
vide si le noyau le permet, et filtre seccomp qui refuse `connect()` (IP et sockets Unix : Postgres,
Redis), `ptrace`, `process_vm_readv/writev`, `pidfd_getfd`, `io_uring` et l'ABI x32. Le niveau obtenu
est journalisé à chaque conversion (`netns+seccomp`, `seccomp`, `aucune`). L'API se déclare non vidable
(`PR_SET_DUMPABLE=0`) : un enfant ne peut pas lire `/proc/<api>/environ` ; l'enfant PDFium ne reçoit
que `PATH`, `LANG`, `LC_ALL`.

**Landlock** (noyau ≥ 5.13, sans root ; ABI 4 = refus TCP en plus) : LibreOffice ne lit que le système,
sa configuration, Carlito et le dossier jetable où l'entrée est copiée ; il n'écrit que là. L'enfant PDFium
(lui aussi sous seccomp) ne lit que Python, le venv, `backend/services` et `backend/uploads`, et n'écrit
nulle part. Ni l'un ni l'autre ne lit `.env`. Limite : l'enfant PDFium, partagé entre organisations, lit
encore tout `uploads/` (passer la pièce par descripteur : après Ozcan). Sans Landlock, repli journalisé ;
avec `SYNORIX_LIBREOFFICE_RESEAU=exige`, conversion refusée. `/tmp` : soffice y crée son socket `OSL_PIPE_<uid>_…` (codé en dur). Quand l'espace de noms utilisateur est
permis, le dossier jetable est monté sur `/tmp` (niveau « tmp privé », journalisé) : le `/tmp` de l'API, sous
`PrivateTmp=true`, n'est ni listé ni lu ni effacé. Sinon (AppArmor d'Ubuntu 24.04, repli probable du VPS) : « tmp partagé »,
`MAKE_SOCK | REMOVE_FILE` sans `READ_DIR` ; LibreOffice ne liste ni ne lit rien dans `/tmp` mais peut effacer un fichier dont il
connaît le nom exact (ceux de l'API sont aléatoires) ; l'API balaie le socket laissé. Mesuré : durée inchangée (+1 % sur un Word
de 400 p.), pages et texte identiques. Réglages facultatifs du `.env` :

```
SYNORIX_LIBREOFFICE_DIR=/srv/synorix/backend/cache/libreoffice   # verrou + profils jetables (ReadWritePaths)
SYNORIX_LIBREOFFICE_AS_MO=1536         # plafond de mémoire virtuelle (pic mesuré : 992 Mo, Word de 400 p.)
SYNORIX_LIBREOFFICE_FICHIER_MO=512     # taille maximale d'un fichier à convertir
SYNORIX_LIBREOFFICE_DELAI_S=120        # + 2 s par Mo pour un fichier déposé, 600 s au plus
SYNORIX_LIBREOFFICE_ATTENTE_S=90       # attente du verrou, export (interactif)
SYNORIX_LIBREOFFICE_ATTENTE_DEPOT_S=900   # attente du verrou, Word déposé (arrière-plan)
SYNORIX_LIBREOFFICE_RESEAU=auto        # exige | auto | netns | seccomp | aucun ; « exige » en prod une fois vérifié
SYNORIX_DUMPABLE=                      # 1 = désactive PR_SET_DUMPABLE (diagnostic py-spy seulement)
SYNORIX_LIBREOFFICE_LANDLOCK=auto      # auto | aucun
SYNORIX_LIBREOFFICE_TMP=auto           # auto (/tmp privé si l'espace de noms de montage est permis) | partage (repli)
SYNORIX_PDFIUM_LANDLOCK=auto           # auto | aucun
SYNORIX_PDFIUM_LECTURE_DIRS=           # dossiers de pièces en plus de backend/uploads, séparés par « : »
```

---

## 7. systemd — service uvicorn

Fichier : `deploy/systemd/synorix-api.service` → `/etc/systemd/system/synorix-api.service`.
Les raisons de chaque réglage sont en commentaire dans le fichier. L'essentiel :

- `--workers 1` **obligatoire** : la progression vit en mémoire du processus, les travaux longs tournent
  en threads de l'API, la réconciliation au démarrage suppose un seul processus
  (`services/run_reconciliation.py`). Ne remonter qu'après le portage progression → Redis et
  travaux longs → Celery.
- `--forwarded-allow-ips 127.0.0.1`, **jamais `*`** (sinon l'IP client se falsifie par `X-Forwarded-For`
  et contourne les limites de débit par IP).
- `KillSignal=SIGTERM` (B6) : uvicorn ne gère que SIGINT et SIGTERM ; SIGQUIT le tue sans arrêt propre.
  `--timeout-graceful-shutdown 20` : sans lui, un flux SSE ouvert bloque l'arrêt jusqu'au SIGKILL.
  Les travaux coupés sont repris par la réconciliation au démarrage suivant (`extracting_text`,
  `extracting_zip`, `analyzing`, `generating` ; `detecting_lots` revient à `ready`).
- `MemoryHigh=2800M`, `MemoryMax=3200M`, `OOMPolicy=continue`, `CPUQuota=150%`, `TasksMax=512` : le groupe compte l'API,
  les deux enfants PDFium et LibreOffice ; au plafond, le noyau tue un enfant, l'API reste debout.
- Durcissement : `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true` ;
  `ReadWritePaths` = `uploads`, `cache` (aperçus de « Voir dans le DCE »), `/var/log/synorix`.

```bash
sudo systemd-analyze verify /etc/systemd/system/synorix-api.service
sudo systemctl daemon-reload && sudo systemctl enable --now synorix-api
journalctl -u synorix-api -f   # « Application startup complete »
```

---

## 8. nginx — reverse proxy + SSL

Fichiers : `deploy/nginx/synorix.conf` → `/etc/nginx/sites-available/synorix`, et ses 3 extraits
`deploy/nginx/synorix-{proxy,entetes,entetes-statiques}.conf` → `/etc/nginx/snippets/`.
Essayé avec le nginx 1.24 d'Ubuntu noble (bloc 6). Ce qu'il règle :

- **`.mjs` en `application/javascript`** : `mime.types` ne connaît pas `.mjs` ; servi en
  `application/octet-stream`, le worker de pdf.js serait refusé et « Voir dans le DCE » ne s'ouvrirait pas.
- **Compression** : le build dépose un `.gz` et un `.br` à côté de chaque fichier ; `gzip_static on`,
  compression à la volée en repli ; Brotli si `libnginx-mod-http-brotli-static` est installé.
  L'API n'est pas compressée par nginx (BREACH).
- **Cache** : `index.html` et routes SPA en `no-cache` ; fichiers à empreinte de `assets/` immuables un an ;
  jamais de cache sur une 404.
- **En-têtes de la page** : HSTS, `X-Frame-Options DENY`, `Referrer-Policy`, `Permissions-Policy`,
  **CSP du front en observation** (`Content-Security-Policy-Report-Only`, rapports sur
  `POST /api/csp-rapport`). Les en-têtes de l'API restent posés par FastAPI (`main.py`).
- **X-Accel-Redirect** : FastAPI vérifie la signature et l'organisation, puis répond sans corps avec
  `X-Accel-Redirect: /_fichiers_internes/<chemin>` ; nginx sert le fichier avec ses plages (206).
  `location /_fichiers_internes/` est `internal` : 404 de l'extérieur. Côté `.env` :
  `SYNORIX_X_ACCEL_PREFIX=/_fichiers_internes`. nginx (`www-data`) doit pouvoir lire `uploads/`.
- **Plafonds de corps** : 2 Go pour le seul dépôt du DCE (`POST /api/projects/{id}/documents`,
  `routers/projects.py`), 60 Mo ailleurs (dépôts de l'appli à 50 Mo au plus).
- **Débit** : 20 requêtes/s par IP sur `/api/` (rafale 40), en plus des limites de l'appli.
- **API injoignable** (arrêtée, en redémarrage, délai dépassé) ou rafale refusée : au lieu des pages anglaises de nginx
  (502, 503, 504), `location @api_indisponible` rend un **503 JSON en français** (`detail` : « Synorix est momentanément
  indisponible. Réessayez dans quelques instants. »), `Retry-After: 30`, jamais en cache ; le front affiche cette phrase.
  Les réponses de l'API elle-même passent telles quelles. Vérification : `sudo systemctl stop synorix-api`, puis
  `curl -s -i https://synorix.tech/api/projects | sed -n '1p;$p'` → `HTTP/2 503` et la phrase ; `sudo systemctl start synorix-api`.
- **Racine** : `/srv/synorix/www`, alimentée par `deploy/outils/publier_front.sh` (§10).

```bash
sudo nginx -t && sudo systemctl reload nginx
deploy/outils/verifier_prod.sh https://synorix.tech /srv/synorix/www   # lecture seule, « 0 KO » attendu
```

### SSL Let's Encrypt

```bash
certbot --nginx -d synorix.tech -d www.synorix.tech \
  --email "<ton adresse qui reçoit vraiment>" --agree-tos --redirect
# Renouvellement automatique installé par défaut
systemctl status snap.certbot.renew.timer
```

---

## 9. Services additionnels

### 9.1 Bot Telegram (si activé via skill telegram)

> Le module `services.telegram_bot` n'existe pas dans le code d'aujourd'hui : cette unité n'est **pas** à installer en V1.

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
EnvironmentFile=/etc/synorix/synorix.env
ExecStart=/srv/synorix/backend/venv/bin/python -m services.telegram_bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 9.2 Worker Celery + Beat

Les tâches planifiées exigent **deux** unités : le **worker** exécute les tâches, le **beat** les
planifie (`celery_app.conf.beat_schedule`, `backend/tasks/check_expiry.py`). Sans beat, aucune ne part :

| Entrée du planning | Tâche | Rythme |
|---|---|---|
| `check-expiry-daily` | `tasks.check_expiry.check_all_expirations` (expirations du coffre, échéances J-3/J-1, relances) | 24 h |
| `purge-ao-supprimes-daily` | `tasks.purge_ao.purger_ao_supprimes` (B18 ; simulation tant que `SYNORIX_PURGE_AO_ACTIVE` ≠ 1) | 24 h |
| `suppressions-comptes-echues-daily` | `tasks.suppression_comptes.executer_suppressions_echues` (D23 : filet des suppressions de compte programmées) | 24 h |
| `veille-boamp-6h` | `tasks.veille_boamp.synchroniser_veille` (avis du BOAMP) | 6 h |
| `depot-lectures-differees-1h` | `tasks.depot_lectures.reprendre_lectures_differees` (lectures de dépôts reportées) | 1 h |

Après un déploiement qui ajoute une tâche, **redémarrer le beat** (il lit le planning à son démarrage) et vérifier :
`sudo journalctl -u synorix-celery-beat --since "-5min" --no-pager | grep -c "beat: Starting"` → au moins `1`, puis
`S /srv/synorix/backend/venv/bin/celery -A tasks inspect registered | grep -c suppression_comptes` → `1`.

`-A tasks` résout l'app exposée par `backend/tasks/__init__.py` (R13 : ce
fichier était vide, la commande ne trouvait aucune app).

Fichiers : `deploy/systemd/synorix-celery-worker.service` et `synorix-celery-beat.service`
→ `/etc/systemd/system/`.
- **Worker** : `-c 2` (2 vCPU), enfant remplacé après 50 tâches ou 300 Mo, `MemoryHigh=700M`, `MemoryMax=800M`, `CPUQuota=100%`.
  Il exécute aussi la **purge des AO supprimés** (B18, `tasks/purge_ao.py`) : en simulation tant que
  `SYNORIX_PURGE_AO_ACTIVE` ne vaut pas `1` (comptes seulement, aucun nom) ; délai `SYNORIX_PURGE_AO_JOURS=30`.
- **Beat** : fichier d'état dans `/var/lib/synorix-beat` (`StateDirectory`), le code reste en lecture seule.

Activation :

```bash
sudo systemctl enable --now synorix-celery-worker synorix-celery-beat
sudo systemctl status synorix-celery-beat   # doit être active (running)
```

---

## 10. Déploiement d'une version

**Code** : le serveur clone le dépôt privé avec sa **propre clé de déploiement GitHub, en lecture
seule** (`~deploy/.ssh/github_synorix`, déclarée dans le dépôt : Settings → Deploy keys, sans
« Allow write access »). Une clé compromise ne donne accès qu'en lecture à ce seul dépôt.

**Front** : construit sur le PC de Mohamed, jamais sur le serveur :
```bash
# depuis le dépôt, sur le PC (frontend/.env.production doit exister, ignoré par git)
deploy/outils/envoyer_front.sh deploy@synorix.tech --simulation
deploy/outils/envoyer_front.sh deploy@synorix.tech
```
Il lance `npm run build` (tsc, vite, précompression `.gz`/`.br`), envoie `dist/` par rsync dans
`/srv/synorix/frontend/dist` (dossier de dépôt, non servi), puis lance `publier_front.sh` sur le serveur :
nouveaux assets d'abord, `index.html` en dernier, anciens assets gardés 7 jours.
**Garde** : il refuse d'envoyer si le commit du PC (`git rev-parse HEAD`) n'est pas celui du serveur, ou si
`frontend/` a une modification non commitée (fichier non suivi compris) ; vérifié avant le build et juste
avant l'envoi. Jamais un front d'une version avec un back d'une autre : déployer le backend d'abord.

**Backend** (`/srv/synorix/deploy.sh`, exécuté par `deploy`) :

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/synorix
echo "→ Code"
git fetch origin
git checkout main
git pull --ff-only origin main
echo "→ Dépendances Python"
backend/venv/bin/pip install -r backend/requirements.txt --quiet
echo "→ Migrations (alembic, source unique du schéma ; l'API refuse de démarrer hors de la head)"
sudo systemd-run --wait --pipe --quiet -p User=synorix -p EnvironmentFile=/etc/synorix/synorix.env \
  -p WorkingDirectory=/srv/synorix/backend /srv/synorix/backend/venv/bin/alembic -c alembic.ini upgrade head
echo "→ Redémarrage (worker et beat aussi : ils chargent le code à leur démarrage)"
sudo systemctl restart synorix-api synorix-celery-worker synorix-celery-beat
sudo systemctl reload nginx
sleep 3
curl -fsS https://synorix.tech/api/health
echo "✓ Déployé"
```
Ordre d'une mise à jour : `ssh deploy@synorix.tech /srv/synorix/deploy.sh`, puis `envoyer_front.sh`.
Branche : `main`, après fusion de la branche de travail avec l'accord de Mohamed (décision du 27/10).

---

## 11. Sauvegardes

Chaque nuit (`synorix-sauvegarde.timer`, 03:00) : `deploy/sauvegarde/synorix-sauvegarde.sh` fait un
`pg_dump` de la base (vérifié lisible avant de remplacer le précédent), puis envoie la base et `uploads/`
**chiffrées par restic** vers un dépôt **hors du VPS** (Backblaze B2, région UE). Rétention : 7 jours,
4 semaines, 6 mois ; `restic check` chaque jour, échantillon des données le dimanche. Identifiants dans
`/etc/synorix/sauvegarde.env` et mot de passe de restic dans `/etc/synorix/restic-mdp` (root, 0600, tapés
sur le serveur ; **une copie du mot de passe de restic hors du serveur**, sinon les sauvegardes sont
illisibles). Essayé en local le 27/10/2026 : deux passages (le second n'envoie rien de plus), restauration
du dump (17 tables avec données à l'époque ; 25 tables au schéma 0034 et 0035, 26 depuis 0036) et d'une pièce (identique), base
restaurée relue. Restauration : `BACKUP_RECOVERY.md`.

**Essai de restauration (R-03, une fois par mois et après tout changement de la sauvegarde)** : relire un dump de restic,
le restaurer dans une base **jetable**, compter les lignes de chaque table et les comparer à celles du dump (blocs
COPY), puis supprimer la base. `pg_restore --list` seul ne prouve rien : il lit le sommaire, pas les données.

```bash
sudo -i
install -m 750 /srv/synorix/deploy/sauvegarde/synorix-essai-restauration.sh /usr/local/sbin/synorix-essai-restauration
set -a; . /etc/synorix/sauvegarde.env; set +a
restic restore latest --target /root/essai --include /var/backups/synorix/synorix.dump
synorix-essai-restauration /root/essai/var/backups/synorix/synorix.dump    # base synorix_essai, supprimée à la fin
echo $?                                                                    # 0 = chaque table restaurée en entier
rm -rf /root/essai
```

Sortie attendue : `essai de restauration OK : <n> tables, <m> lignes, toutes restaurées`. En écart : les tables
concernées (`<` dump, `>` base restaurée) et le code 1. Joué en local le 12/11/2026 sur une copie de la base jetable
(dump de 36 Mo, 26 tables, 8 702 lignes, code 0). Le script refuse de prendre la base de production pour base d'essai.

---

## 12. Monitoring de base

### 12.1 Uptime check via cron

`/etc/cron.d/synorix-uptime` :

```cron
* * * * * synorix /usr/bin/curl -fsS https://synorix.tech/api/health > /dev/null || echo "[$(date)] Synorix DOWN" | mail -s "ALERT Synorix down" "<ton adresse qui reçoit vraiment>"
```

### 12.2 Logs

- `journalctl -u synorix-api -f` — runtime + erreurs
- `journalctl -u synorix-api | grep "Limiteur de débit"` — Redis injoignable (R-05) : les limites de débit
  passent sur un compteur en mémoire du processus, une ligne ERROR à la panne, une ligne au retour de Redis
- `tail -f /var/log/nginx/synorix.access.log` — trafic
- `tail -f /var/log/nginx/synorix.error.log` — erreurs proxy

### 12.3 Sentry (P1)

Ajouter `SENTRY_DSN` dans `.env` ; le SDK Sentry sera initialisé dans `main.py` quand on l'aura branché (Phase 2.8 — backlog).

---

## 13. Procédure de rollback

```bash
ssh deploy@synorix.tech
cd /srv/synorix && git log --oneline -5
git checkout <SHA_DU_DERNIER_BON_COMMIT>
backend/venv/bin/pip install -r backend/requirements.txt --quiet
sudo systemctl restart synorix-api synorix-celery-worker synorix-celery-beat
```
Puis, sur le PC : `git checkout <même SHA>` et `deploy/outils/envoyer_front.sh deploy@synorix.tech`.
Si la régression vient d'une migration : `alembic downgrade <révision>` (chaque migration a sa descente ; essayé
pour 0024, 0025 et 0034 → 0033 → 0034), ou restauration de la sauvegarde (`BACKUP_RECOVERY.md` §3). Une descente
efface les colonnes et tables ajoutées par la migration, **avec leurs données** (0035 : les demandes de suppression de
compte programmées ; 0036 : les styles d'entreprise lus ; 0037 ne retire que des index, l'extension `pg_trgm` reste).
`alembic downgrade base` passe depuis R-01 (`eb4b2fc`, `tests/test_migrations_aller_retour_r01.py`) ; pour repartir de
zéro, `dropdb` puis A11 (VPS.md C4) reste le plus sûr.

---

## 14. Checklist pré-mise en prod

- [ ] DNS A `synorix.tech` → IP VPS validé
- [ ] DNS A `www.synorix.tech` → IP VPS validé
- [ ] SSL Let's Encrypt installé
La liste suivie le jour de la mise en ligne, case par case, avec la commande et ce qu'on doit voir :
`.claude/echange/sprint-ozcan/JOUR-J.md`. Rappel des points de cette page :

- [ ] `/etc/synorix/synorix.env` rempli avec toutes les vraies valeurs (pas de `sk_test_...`), sans `AWS_*`
- [ ] `frontend/.env.production` avec `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...` posé AVANT `npm run build` (sinon page blanche)
- [ ] Stripe webhook configuré sur `https://synorix.tech/api/stripe/webhook`
- [ ] `CLERK_JWKS_URL` pointe vers la prod (pas le dev clerk.accounts.dev)
- [ ] firewall ufw active (22, 80, 443 only)
- [ ] fail2ban actif
- [ ] Services `synorix-api`, `synorix-celery-worker`, `synorix-celery-beat` démarrent au boot (`systemctl is-enabled …`)
- [ ] Sauvegarde de nuit active (`systemctl list-timers synorix-sauvegarde.timer`) et restauration essayée une fois (VPS.md C10)
- [ ] Health check `https://synorix.tech/api/health` → `{"status":"ok","db":"up"}`
- [ ] `alembic current` → `0037_index_echelle (head)` ; `alembic check` → aucune différence (§3)
- [ ] Fonctions C1 à C4 éteintes (`RELECTURE_PROPOSER`, `REECRIRE_TROIS`, `FICHE_PROPOSEE`, `STYLE_ENTREPRISE` à 0 ou absentes)
- [ ] `/api/metrics` : 404 sans jeton, JSON avec `Authorization: Bearer $METRICS_TOKEN`
- [ ] Mention légale + politique RGPD publiées
- [ ] DPA Anthropic signé
- [ ] Plan facturation Anthropic configuré (alerte email à 100 €/jour)
- [ ] Plan facturation Hostinger payé pour 12 mois (économie ~30 %)

---

## 15. Performance — sizing recommandé

| Phase | Clients | VPS | Coût mensuel |
|---|---|---|---|
| MVP / 1ʳᵉ année | 0-50 payants | KVM 2 (2 vCPU, 8 Go, 100 Go) — cible actuelle | tarif Hostinger en vigueur |
| Croissance | 50-200 | KVM 4 (4 vCPU, 16 Go) | ~30 € |
| Montée en charge | 200-500 | KVM 8 (8 vCPU, 32 Go) | ~60 € |
| Scale-up | 500+ | 2× KVM 8 + load balancer (HAProxy ou Cloudflare) | ~150 € |
| Au-delà | 1 000+ | Migrer Hetzner Cloud / OVH Public Cloud avec auto-scale | ~variable |

Le bottleneck principal sera **Anthropic API quota / coûts**, pas les ressources serveur.
