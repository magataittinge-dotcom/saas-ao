#!/usr/bin/env bash
# Synorix — construit le front SUR LE PC de Mohamed et l'envoie au serveur (1 vCPU et 4 Go : jamais de
# build sur le VPS ; Ubuntu 24.04 n'y fournit que Node 18).
# Usage, depuis le dépôt : deploy/outils/envoyer_front.sh deploy@synorix.tech [--simulation]
# 1. npm run build (tsc + vite + précompression .gz/.br) avec frontend/.env.production, qui doit exister
#    (VITE_CLERK_PUBLISHABLE_KEY : clé PUBLIQUE de Clerk ; VITE_API_URL vide = même origine) ;
# 2. rsync de dist/ vers /srv/synorix/frontend/dist sur le serveur (dossier de dépôt, non servi) ;
# 3. publication par deploy/outils/publier_front.sh SUR le serveur : nouveaux assets d'abord,
#    index.html en dernier, anciens assets gardés 7 jours.
set -euo pipefail
CIBLE=${1:?usage : envoyer_front.sh deploy@synorix.tech [--simulation]}
SIMULATION=${2:-}
RACINE=$(cd "$(dirname "$0")/../.." && pwd)
cd "$RACINE/frontend"
[ -f .env.production ] || { echo "ERREUR : frontend/.env.production absent (voir docs/DEPLOYMENT.md §5)"; exit 1; }
grep -q '^VITE_CLERK_PUBLISHABLE_KEY=pk_' .env.production || { echo "ERREUR : VITE_CLERK_PUBLISHABLE_KEY absente de .env.production"; exit 1; }
echo "→ build (sur ce PC)"
npm run build > /tmp/synorix-build-front.log 2>&1 || { tail -20 /tmp/synorix-build-front.log; exit 1; }
echo "→ $(ls dist/assets | wc -l) fichiers dans dist/assets, dont $(ls dist/assets | grep -c '\.gz$') .gz"
R="rsync -az --delete"; [ "$SIMULATION" = --simulation ] && R="$R --dry-run --itemize-changes"
echo "→ envoi vers $CIBLE:/srv/synorix/frontend/dist"
$R dist/ "$CIBLE:/srv/synorix/frontend/dist/"
echo "→ publication sur le serveur"
ssh "$CIBLE" "/srv/synorix/deploy/outils/publier_front.sh $SIMULATION"
