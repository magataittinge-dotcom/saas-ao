#!/usr/bin/env bash
# Synorix — construit le front SUR LE PC de Mohamed et l'envoie au serveur (KVM 2 : 2 vCPU et 8 Go, mais jamais de
# build sur le VPS ; Ubuntu 24.04 n'y fournit que Node 18).
# Usage, depuis le dépôt : deploy/outils/envoyer_front.sh deploy@synorix.tech [--simulation]
# 1. npm run build (tsc + vite + précompression .gz/.br) avec frontend/.env.production, qui doit exister
#    (VITE_CLERK_PUBLISHABLE_KEY : clé PUBLIQUE de Clerk ; VITE_API_URL vide = même origine) ;
# 2. rsync de dist/ vers /srv/synorix/frontend/dist sur le serveur (dossier de dépôt, non servi) ;
# 3. publication par deploy/outils/publier_front.sh SUR le serveur : nouveaux assets d'abord,
#    index.html en dernier, anciens assets gardés 7 jours.
# Garde : jamais un front d'une version avec un back d'une autre. Le script refuse d'envoyer si le commit
# du PC (git rev-parse HEAD) n'est pas celui du serveur, ou si frontend/ a des modifications non commitées.
# Vérifié avant le build, puis de nouveau juste avant l'envoi.
set -euo pipefail
CIBLE=${1:?usage : envoyer_front.sh deploy@synorix.tech [--simulation]}
SIMULATION=${2:-}
RACINE=$(cd "$(dirname "$0")/../.." && pwd)

meme_version() {
  local ici distant
  ici=$(git -C "$RACINE" rev-parse HEAD)
  if [ -n "$(git -C "$RACINE" status --porcelain -- frontend ':!frontend/node_modules')" ]; then
    echo "REFUS : frontend/ a des modifications non commitées sur ce PC ; le build ne serait pas celui du commit $ici."
    git -C "$RACINE" status --short -- frontend ':!frontend/node_modules' | head -10
    exit 2
  fi
  distant=$(ssh "$CIBLE" "git -C /srv/synorix rev-parse HEAD") || { echo "REFUS : version du serveur illisible"; exit 2; }
  if [ "$ici" != "$distant" ]; then
    echo "REFUS : le PC est sur ${ici:0:12}, le serveur sur ${distant:0:12}. Mets les deux sur le même commit"
    echo "        (git checkout sur le PC, ou deploy.sh sur le serveur), puis relance."
    exit 2
  fi
  echo "→ même version des deux côtés : ${ici:0:12}"
}

meme_version
cd "$RACINE/frontend"
[ -f .env.production ] || { echo "ERREUR : frontend/.env.production absent (voir docs/DEPLOYMENT.md §5)"; exit 1; }
grep -q '^VITE_CLERK_PUBLISHABLE_KEY=pk_' .env.production || { echo "ERREUR : VITE_CLERK_PUBLISHABLE_KEY absente de .env.production"; exit 1; }
echo "→ build (sur ce PC)"
npm run build > /tmp/synorix-build-front.log 2>&1 || { tail -20 /tmp/synorix-build-front.log; exit 1; }
echo "→ $(ls dist/assets | wc -l) fichiers dans dist/assets, dont $(ls dist/assets | grep -c '\.gz$') .gz"
meme_version
R="rsync -az --delete"; [ "$SIMULATION" = --simulation ] && R="$R --dry-run --itemize-changes"
echo "→ envoi vers $CIBLE:/srv/synorix/frontend/dist"
$R dist/ "$CIBLE:/srv/synorix/frontend/dist/"
echo "→ publication sur le serveur"
ssh "$CIBLE" "/srv/synorix/deploy/outils/publier_front.sh $SIMULATION"
