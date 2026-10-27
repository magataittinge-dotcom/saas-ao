#!/usr/bin/env bash
# Synorix — sauvegarde quotidienne : la base (pg_dump) et les pièces déposées (uploads/), chiffrées par
# restic, avec une copie HORS du VPS (dépôt restic distant, par exemple Backblaze B2 en région UE).
# Installé en /usr/local/sbin/synorix-sauvegarde, lancé par synorix-sauvegarde.timer (03:00, en root).
# Réglages (fichier root 0600, tapé par Mohamed sur le serveur, jamais dans le dépôt) :
#   /etc/synorix/sauvegarde.env : RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Rétention : 7 jours, 4 semaines, 6 mois. Le journal ne contient que des tailles et des comptes.
set -euo pipefail
umask 077
ENV=${SYNORIX_SAUVEGARDE_ENV:-/etc/synorix/sauvegarde.env}
if [ -r "$ENV" ]; then set -a; . "$ENV"; set +a; fi
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY manquant (voir $ENV)}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE manquant (voir $ENV)}"
BASE=${SYNORIX_BASE:-synorix}
UPLOADS=${SYNORIX_UPLOADS:-/srv/synorix/backend/uploads}
TRAVAIL=${SYNORIX_SAUVEGARDE_DIR:-/var/backups/synorix}
PG_DUMP=${SYNORIX_PG_DUMP:-runuser -u postgres -- pg_dump}
PG_RESTORE=${SYNORIX_PG_RESTORE:-pg_restore}
journal() { logger -t synorix-sauvegarde -- "$*" 2>/dev/null || true; echo "$*"; }

mkdir -p "$TRAVAIL"
dump="$TRAVAIL/synorix.dump"
# 1. la base, au format custom ; vérifiée lisible AVANT de remplacer la précédente
$PG_DUMP -Fc "$BASE" > "$dump.part"
"$PG_RESTORE" --list "$dump.part" > /dev/null
mv -f "$dump.part" "$dump"
# 2. copie chiffrée hors du VPS (restic déduplique : les pièces déjà envoyées ne repartent pas)
cibles=("$dump"); [ -d "$UPLOADS" ] && cibles+=("$UPLOADS")
restic backup --quiet --tag synorix --host synorix "${cibles[@]}"
# 3. rétention, puis contrôle de l'intégrité du dépôt (métadonnées ; un échantillon des données le dimanche)
restic forget --quiet --tag synorix --host synorix --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
if [ "$(date +%u)" = 7 ]; then restic check --quiet --read-data-subset=1/20; else restic check --quiet; fi
journal "sauvegarde OK : base $(stat -c %s "$dump") octets, $(restic snapshots --quiet --tag synorix --json | grep -o '"short_id"' | wc -l) instantanés"
