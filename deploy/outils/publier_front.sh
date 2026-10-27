#!/usr/bin/env bash
# Synorix — publie le front construit (frontend/dist) dans le dossier servi par nginx (www/),
# sans couper les onglets ouverts : les nouveaux assets/ arrivent d'abord, index.html en dernier,
# et les anciens assets/ restent JOURS jours (un onglet ouvert pendant un déploiement demande
# encore les morceaux de l'ancienne version ; s'ils manquent, le front recharge une fois).
# Usage (en deploy, après `npm run build`) : deploy/outils/publier_front.sh [--simulation]
# Retour arrière : republier le build précédent (git checkout <sha>, npm run build, ce script).
set -euo pipefail
SRC=${SRC:-/srv/synorix/frontend/dist}
WWW=${WWW:-/srv/synorix/www}
JOURS=${JOURS:-7}
SIMULATION=0; [ "${1:-}" = "--simulation" ] && SIMULATION=1

[ -f "$SRC/index.html" ] || { echo "ERREUR : $SRC/index.html absent (lancer npm run build)"; exit 1; }
[ -d "$SRC/assets" ] || { echo "ERREUR : $SRC/assets absent"; exit 1; }
R="rsync -a"; [ $SIMULATION = 1 ] && R="rsync -a --dry-run --itemize-changes"

mkdir -p "$WWW/assets"
# 1. nouveaux assets, sans rien effacer
$R "$SRC/assets/" "$WWW/assets/"
# 2. autres fichiers de la racine (favicon, robots…), sauf la page
$R --exclude 'assets/' --exclude 'index.html' --exclude 'index.html.gz' --exclude 'index.html.br' "$SRC/" "$WWW/"
# 3. la page en dernier, chaque fichier remplacé d'un coup (mv dans le même dossier)
for f in index.html.br index.html.gz index.html; do
  [ -f "$SRC/$f" ] || continue
  if [ $SIMULATION = 1 ]; then echo "remplacerait $WWW/$f"; continue; fi
  cp "$SRC/$f" "$WWW/.$f.nouveau" && mv -f "$WWW/.$f.nouveau" "$WWW/$f"
done
# 4. anciens assets : plus vieux que JOURS jours ET absents du build courant
n=0
while IFS= read -r -d '' f; do
  [ -e "$SRC/assets/$(basename "$f")" ] && continue
  n=$((n + 1))
  [ $SIMULATION = 1 ] && echo "effacerait $f" || rm -f -- "$f"
done < <(find "$WWW/assets" -type f -mtime +"$JOURS" -print0)
echo "publié : $(ls "$SRC/assets" | wc -l) fichiers dans assets/, $n anciens retirés (plus de $JOURS jours)$([ $SIMULATION = 1 ] && echo ' — SIMULATION, rien écrit')"
