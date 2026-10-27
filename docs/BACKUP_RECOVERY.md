# Backup & recovery — Synorix

**Dernière mise à jour :** 2026-10-27 (restic chiffré hors du VPS, à la place de S3 en clair)
**Cible RPO (Recovery Point Objective) :** ≤ 24 h (perte max d'1 jour de données)
**Cible RTO (Recovery Time Objective) :** ≤ 1 h (temps max pour rétablir le service)

---

## 1. Données à sauvegarder

| Source | Volume | Sensibilité | Périodicité | Cible |
|---|---|---|---|---|
| PostgreSQL `synorix` | 100 Mo - 5 Go | RGPD haute | Quotidien (03:00) | Local + restic chiffré hors du VPS |
| `/srv/synorix/backend/uploads/` | 5 Go - 200 Go | RGPD haute | Quotidien (03:00, même passage) | restic chiffré hors du VPS (dédupliqué) |
| `/etc/synorix/synorix.env`, mot de passe de restic | <1 Ko | Critique secrets | Manuel | gestionnaire de mots de passe de Mohamed (jamais le dépôt) |
| Configuration nginx + systemd | <1 Mo | Faible | Hebdo | Git privé |

---

## 2. Sauvegarde quotidienne

Script : `deploy/sauvegarde/synorix-sauvegarde.sh` → `/usr/local/sbin/synorix-sauvegarde` ; lancé par
`deploy/systemd/synorix-sauvegarde.timer` (03:00, rattrapé au démarrage). Il fait :
1. `pg_dump -Fc` de la base, relu par `pg_restore --list` avant de remplacer le précédent
   (`/var/backups/synorix/synorix.dump`, root, 0700) ;
2. `restic backup` du dump et de `uploads/` vers le dépôt distant (chiffré côté serveur, dédupliqué) ;
3. `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`, puis `restic check`
   (échantillon de 1/20 des données le dimanche) ;
4. une ligne dans le journal : `journalctl -t synorix-sauvegarde`.

Réglages : `/etc/synorix/sauvegarde.env` (root 0600) — `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (clé d'application B2 limitée à un seul compartiment).
Essayé en local le 27/10/2026 (restic 0.16.4, Postgres 16) : deux passages, restauration du dump et d'une
pièce, base restaurée relue.

---

## 3. Procédure de restauration complète

**Scénario :** le VPS est compromis ou perdu. On restore sur un nouveau VPS Hostinger fraîchement provisionné en suivant `DEPLOYMENT.md` §1-9.

### 3.1 Restaurer la DB

```bash
sudo -i                                   # restic lit /etc/synorix/sauvegarde.env (root)
set -a; . /etc/synorix/sauvegarde.env; set +a
restic snapshots --tag synorix            # choisir l'instantané (latest par défaut)
restic restore latest --target /root/restauration --include /var/backups/synorix/synorix.dump
pg_restore --list /root/restauration/var/backups/synorix/synorix.dump | grep -c "TABLE DATA"
# Base vierge (le rôle synorix existe déjà, DEPLOYMENT.md §3), extension vector d'abord
sudo -u postgres dropdb --if-exists synorix
sudo -u postgres createdb -O synorix synorix
sudo -u postgres psql -d synorix -c "CREATE EXTENSION IF NOT EXISTS vector"
sudo -u postgres pg_restore -d synorix --no-owner --role=synorix /root/restauration/var/backups/synorix/synorix.dump
sudo -u postgres psql synorix -c 'SELECT count(*) FROM organizations;'
```

### 3.2 Restaurer les uploads

```bash
restic restore latest --target /root/restauration --include /srv/synorix/backend/uploads
rsync -a /root/restauration/srv/synorix/backend/uploads/ /srv/synorix/backend/uploads/
chown -R synorix:synorix /srv/synorix/backend/uploads
rm -rf /root/restauration
```

### 3.3 Vérification globale

```bash
# Re-démarrer
systemctl restart synorix-api

# Tests fonctionnels
curl -fsS https://synorix.tech/api/health | jq .
curl -fsS https://synorix.tech/api/metrics | jq '.orgs_total, .projects_total'
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
curl -X POST https://synorix.tech/api/projects/PROJECT_ID/restore \
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
ssh root@staging.synorix.tech

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

## 7. Anti-ransomware : versionnage S3 + MFA delete (à revoir pour B2 : verrouillage des objets, depuis le passage à restic du 27/10/2026)

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
| Tech lead | Mohamed | contact@synorix.tech (boîte à créer : aucun MX au 27/10/2026) |
| Hébergeur | Hostinger | https://www.hostinger.fr/contact |
| Anthropic API | support | support@anthropic.com |
| Stripe | support | https://support.stripe.com |
| RGPD / DPO | À nommer | TBD |
