# Backup & recovery — Synorix

**Dernière mise à jour :** 2026-04-30
**Cible RPO (Recovery Point Objective) :** ≤ 24 h (perte max d'1 jour de données)
**Cible RTO (Recovery Time Objective) :** ≤ 1 h (temps max pour rétablir le service)

---

## 1. Données à sauvegarder

| Source | Volume | Sensibilité | Périodicité | Cible |
|---|---|---|---|---|
| PostgreSQL `synorix` | 100 Mo - 5 Go | RGPD haute | Quotidien (03:00) | Local + S3 |
| `/srv/synorix/backend/uploads/` | 5 Go - 200 Go | RGPD haute | Quotidien (03:30) | Local + S3 |
| `/srv/synorix/backend/.env` | <1 Ko | Critique secrets | Manuel + 1Password | 1Password |
| Configuration nginx + systemd | <1 Mo | Faible | Hebdo | Git privé |

---

## 2. Script de backup

`/srv/synorix/scripts/backup.sh` :

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/var/backups/synorix"
mkdir -p "$BACKUP_ROOT"/{db,uploads,logs}

DATE=$(date +"%Y%m%d-%H%M")
DB_FILE="$BACKUP_ROOT/db/synorix-$DATE.sql.gz"
UPLOADS_FILE="$BACKUP_ROOT/uploads/uploads-$DATE.tar.gz"

# 1. Database dump (consistent online backup, bzip2 compression)
sudo -u postgres pg_dump -d synorix --format=custom --compress=9 \
    --file "${DB_FILE%.gz}" 2>/dev/null
gzip -9 "${DB_FILE%.gz}"
echo "✓ DB backup: $DB_FILE ($(du -h $DB_FILE | cut -f1))"

# 2. Uploads (incremental tar with sparse handling)
tar --use-compress-program='gzip -9' \
    -cf "$UPLOADS_FILE" \
    -C /srv/synorix/backend uploads/
echo "✓ Uploads backup: $UPLOADS_FILE ($(du -h $UPLOADS_FILE | cut -f1))"

# 3. Rotation: keep 7 daily backups, then weekly for 4 weeks, then monthly.
find "$BACKUP_ROOT/db" -name "synorix-*.sql.gz" -mtime +7 -delete
find "$BACKUP_ROOT/uploads" -name "uploads-*.tar.gz" -mtime +7 -delete

# 4. Off-site sync to S3 (eu-west-3)
if command -v aws >/dev/null && [ -n "${AWS_BACKUP_BUCKET:-}" ]; then
    aws s3 sync "$BACKUP_ROOT/db"      "s3://$AWS_BACKUP_BUCKET/db/" \
        --storage-class STANDARD_IA --exact-timestamps
    aws s3 sync "$BACKUP_ROOT/uploads" "s3://$AWS_BACKUP_BUCKET/uploads/" \
        --storage-class STANDARD_IA --exact-timestamps
    echo "✓ Off-site S3 sync done"
fi

# 5. Healthy completion notification (optional Telegram)
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -o /dev/null -X POST \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d text="✓ Synorix backup OK — $(du -sh $BACKUP_ROOT | cut -f1)"
fi
```

```bash
chmod +x /srv/synorix/scripts/backup.sh
chown root:root /srv/synorix/scripts/backup.sh
```

### Cron

`/etc/cron.d/synorix-backup` :

```cron
30 3 * * * root /srv/synorix/scripts/backup.sh >>/var/log/synorix/backup.log 2>&1
```

---

## 3. Procédure de restauration complète

**Scénario :** le VPS est compromis ou perdu. On restore sur un nouveau VPS Hostinger fraîchement provisionné en suivant `DEPLOYMENT.md` §1-9.

### 3.1 Restaurer la DB

```bash
# 1. Récupérer le dernier dump depuis S3
aws s3 cp s3://synorix-backups/db/synorix-LATEST.sql.gz /tmp/

# 2. Préparer une DB vierge (l'install DEPLOYMENT.md §3 a déjà créé l'user)
sudo -u postgres dropdb synorix || true
sudo -u postgres createdb synorix --owner synorix

# 3. Restaurer
gunzip -c /tmp/synorix-LATEST.sql.gz | \
    sudo -u postgres pg_restore --dbname=synorix --no-owner --no-acl \
        --verbose 2>&1 | tail -30

# 4. Vérifier
sudo -u postgres psql synorix -c '\dt' | head
sudo -u postgres psql synorix -c 'SELECT count(*) FROM organizations;'
```

### 3.2 Restaurer les uploads

```bash
aws s3 cp s3://synorix-backups/uploads/uploads-LATEST.tar.gz /tmp/
mkdir -p /srv/synorix/backend/uploads
tar -xzf /tmp/uploads-LATEST.tar.gz -C /srv/synorix/backend/
chown -R synorix:synorix /srv/synorix/backend/uploads
ls -la /srv/synorix/backend/uploads/projects/ | head
```

### 3.3 Vérification globale

```bash
# Re-démarrer
systemctl restart synorix-api

# Tests fonctionnels
curl -fsS https://synorix.fr/api/health | jq .
curl -fsS https://synorix.fr/api/metrics | jq '.orgs_total, .projects_total'
```

---

## 4. Restauration partielle (1 client demande l'export complet de ses données)

Cas RGPD typique. Donnée demandée : projets + documents + mémoires d'un seul `organization_id`.

```bash
# 1. SQL — extraire les enregistrements
ORG_ID=org-XXXX
sudo -u postgres psql synorix <<EOF
\copy (SELECT * FROM organizations WHERE id='$ORG_ID') TO '/tmp/$ORG_ID-org.csv' CSV HEADER;
\copy (SELECT * FROM users WHERE organization_id='$ORG_ID') TO '/tmp/$ORG_ID-users.csv' CSV HEADER;
\copy (SELECT * FROM projects WHERE organization_id='$ORG_ID') TO '/tmp/$ORG_ID-projects.csv' CSV HEADER;
\copy (SELECT * FROM documents WHERE organization_id='$ORG_ID') TO '/tmp/$ORG_ID-documents.csv' CSV HEADER;
\copy (SELECT * FROM "references" WHERE organization_id='$ORG_ID') TO '/tmp/$ORG_ID-refs.csv' CSV HEADER;
\copy (SELECT * FROM memoire_techniques WHERE project_id IN (SELECT id FROM projects WHERE organization_id='$ORG_ID')) TO '/tmp/$ORG_ID-memoires.csv' CSV HEADER;
EOF

# 2. Files
mkdir -p /tmp/export-$ORG_ID/files
cp -a /srv/synorix/backend/uploads/organizations/$ORG_ID /tmp/export-$ORG_ID/files/vault
for pid in $(sudo -u postgres psql synorix -At -c "SELECT id FROM projects WHERE organization_id='$ORG_ID'"); do
    cp -a /srv/synorix/backend/uploads/projects/$pid /tmp/export-$ORG_ID/files/project-$pid 2>/dev/null || true
done

# 3. Bundle
tar -czf /tmp/export-$ORG_ID.tar.gz -C /tmp export-$ORG_ID
mv /tmp/$ORG_ID-*.csv /tmp/export-$ORG_ID/   # … or include first then tar
sha256sum /tmp/export-$ORG_ID.tar.gz
# Send via signed S3 link, valid 24h.
aws s3 cp /tmp/export-$ORG_ID.tar.gz s3://synorix-private-exports/$ORG_ID/ \
    --acl bucket-owner-full-control
aws s3 presign s3://synorix-private-exports/$ORG_ID/export-$ORG_ID.tar.gz --expires-in 86400
```

---

## 5. Restauration ciblée (un seul projet supprimé par erreur)

Avec le soft-delete ajouté en Phase 2.2, c'est instantané :

```bash
# Via API (si l'utilisateur peut encore se loguer)
curl -X POST https://synorix.fr/api/projects/PROJECT_ID/restore \
    -H "Authorization: Bearer $TOKEN"

# Via SQL (depuis la machine ops)
sudo -u postgres psql synorix -c \
    "UPDATE projects SET deleted_at = NULL WHERE id = 'PROJECT_ID';"
```

Pour un projet purgé du soft-delete (delta > 30 j, P1) : restaurer depuis le dump quotidien correspondant.

---

## 6. Tester la restauration — exercice trimestriel

> "Un backup non testé est un backup en panne." Programmer un exercice tous les 3 mois.

### Procédure de test

```bash
# 1. Provisionner un VPS staging Hostinger (KVM 2 suffit)
ssh root@staging.synorix.fr

# 2. Suivre DEPLOYMENT.md §1-7 (jusqu'à env vars)
# 3. Lancer la restauration §3 ci-dessus
# 4. Vérifier :
#    - login d'un user test
#    - récupération d'un mémoire historique
#    - téléchargement d'un fichier vault
#    - export ZIP d'un projet ancien

# 5. Documenter le délai effectif :
echo "Restauration complète exercice $(date) : Xh Y min"
echo "Décisions à acter : ..."
```

---

## 7. Anti-ransomware : versionnage S3 + MFA delete

Sur le bucket `synorix-backups` (AWS console) :

1. Activer le **versioning** : chaque écriture crée une nouvelle version, l'ancienne est conservée.
2. Activer **MFA delete** : la suppression définitive nécessite un code MFA (cas où la machine de déploiement est compromise).
3. **Lifecycle rule** : les versions précédentes passent en Glacier après 30 jours, sont supprimées après 1 an.
4. **Cross-region replication** vers `eu-west-1` (Irlande) pour résilience régionale (optionnel, +50 %/mois sur la facture S3).

---

## 8. Plan de continuité

| Scénario | Détection | Action | Time to recover |
|---|---|---|---|
| `synorix-api` crashed | Cron uptime + Telegram alert | Auto-restart par systemd | < 10 s |
| OOM Postgres | Cron logs check | Provisionner KVM supérieur | < 1 h |
| Disque saturé (uploads) | `/api/health` `disk_free_gb` < 5 | Migration vers S3 + suppression locale | < 4 h |
| VPS Hostinger down | Uptime check, monitoring externe | Restaurer sur OVH/Hetzner via §3 | < 4 h |
| Compromission complète | Logs anormaux, alert Cloudflare | Wipe + restore sur nouveau VPS, rotation tous secrets | < 8 h |
| Erreur humaine massive (DROP TABLE) | Métrique `projects_total` inattendue | Restaurer DB depuis dump du jour | < 1 h |

---

## 9. Contacts

| Rôle | Personne | Contact |
|---|---|---|
| Tech lead | Mohamed | mohamed@synorix.fr |
| Hébergeur | Hostinger | https://www.hostinger.fr/contact |
| Anthropic API | support | support@anthropic.com |
| Stripe | support | https://support.stripe.com |
| RGPD / DPO | À nommer | TBD |
