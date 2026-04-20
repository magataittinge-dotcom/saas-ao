#!/bin/bash
# ── Backup PostgreSQL database for SaaS AO BTP ──────────────────────────────
# Usage: ./backup_db.sh
# Cron:  0 3 * * * /path/to/backend/scripts/backup_db.sh >> /var/log/saas-ao-backup.log 2>&1
#
# Requires: pg_dump, gzip
# Config: reads DATABASE_URL from .env file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$BACKEND_DIR/.env"

# ── Config ───────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/saas-ao}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/saas_ao_$DATE.sql.gz"

# ── Read DATABASE_URL from .env ──────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "[ERROR] .env file not found at $ENV_FILE"
    exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f 2-)
if [ -z "$DATABASE_URL" ]; then
    echo "[ERROR] DATABASE_URL not found in .env"
    exit 1
fi

# ── Ensure backup directory exists ───────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Run backup ───────────────────────────────────────────────────────────────
echo "[$(date)] Starting backup..."
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completed: $BACKUP_FILE ($BACKUP_SIZE)"

# ── Cleanup old backups ──────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "saas_ao_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days"
fi

# ── Verify backup is not empty ───────────────────────────────────────────────
MIN_SIZE=1024  # 1KB minimum
ACTUAL_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [ "$ACTUAL_SIZE" -lt "$MIN_SIZE" ]; then
    echo "[WARNING] Backup file suspiciously small ($ACTUAL_SIZE bytes). Check the database."
fi

echo "[$(date)] Backup pipeline complete."

# ── Restore instructions ─────────────────────────────────────────────────────
# To restore:
#   gunzip -c /var/backups/saas-ao/saas_ao_YYYY-MM-DD_HHMMSS.sql.gz | psql "$DATABASE_URL"
