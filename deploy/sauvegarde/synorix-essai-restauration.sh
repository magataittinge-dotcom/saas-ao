#!/usr/bin/env bash
# Synorix — essai de restauration (R-03) : restaure un dump `pg_dump -Fc` dans une base JETABLE, compare le nombre de
# lignes de chaque table restaurée avec celui du dump lui-même (blocs COPY), puis supprime la base jetable.
# Code 0 seulement si chaque table du dump est restaurée avec toutes ses lignes ; la liste des écarts sinon.
# Usage (VPS, en root, après la sauvegarde ; dump relu de restic : BACKUP_RECOVERY.md § 3.1) :
#   synorix-essai-restauration.sh /var/backups/synorix/synorix.dump
# Réglages : SYNORIX_BASE_ESSAI (synorix_essai ; jamais la base de production), SYNORIX_PSQL et SYNORIX_PG_RESTORE
# (par défaut en tant que postgres). Le journal ne contient que des noms de tables et des nombres.
set -euo pipefail
DUMP=${1:?usage : synorix-essai-restauration.sh <dump>}
ESSAI=${SYNORIX_BASE_ESSAI:-synorix_essai}
PSQL=${SYNORIX_PSQL:-runuser -u postgres -- psql}
PG_RESTORE=${SYNORIX_PG_RESTORE:-runuser -u postgres -- pg_restore}
case "$ESSAI" in synorix|"${SYNORIX_BASE:-synorix}") echo "refus : $ESSAI est la base de production"; exit 2;; esac
dans_le_dump() {   # « table lignes » pour chaque bloc COPY du dump (une ligne par rangée au format COPY)
  $PG_RESTORE --data-only -f - "$DUMP" | awk '
    /^COPY / { t = $2; sub(/^public\./, "", t); gsub(/"/, "", t); n = 0; dedans = 1; next }
    dedans && /^\\\.$/ { print t, n; dedans = 0; next }
    dedans { n++ }' | sort
}
dans_la_base() {
  local t
  for t in $(dans_le_dump | cut -d' ' -f1); do
    echo "$t $($PSQL -d "$ESSAI" -qAt -c "select count(*) from public.\"$t\"")"
  done
}
$PSQL -d postgres -qAt -c "drop database if exists \"$ESSAI\"" -c "create database \"$ESSAI\""
trap '$PSQL -d postgres -qAt -c "drop database if exists \"$ESSAI\"" > /dev/null' EXIT
$PSQL -d "$ESSAI" -qAt -c "create extension if not exists vector"
$PG_RESTORE --no-owner --exit-on-error -d "$ESSAI" "$DUMP"
attendu=$(dans_le_dump)
[ -n "$attendu" ] || { echo "dump vide ou illisible"; exit 1; }
if diff <(echo "$attendu") <(dans_la_base); then
  echo "essai de restauration OK : $(echo "$attendu" | wc -l) tables, $(echo "$attendu" | awk '{s += $2} END {print s}') lignes, toutes restaurées"
else
  echo "essai de restauration EN ÉCHEC : tables ci-dessus (< dump, > base restaurée)"; exit 1
fi
