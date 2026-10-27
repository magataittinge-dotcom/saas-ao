#!/usr/bin/env bash
# Synorix — vérifications de la prod, en LECTURE SEULE (requêtes HTTP, aucune écriture).
# Usage : deploy/outils/verifier_prod.sh [https://synorix.tech] [/srv/synorix/www]
# Chaque ligne commence par OK ou KO. Code de sortie : nombre de KO.
set -uo pipefail
URL=${1:-https://synorix.tech}
WWW=${2:-/srv/synorix/www}
ko=0
ok() { echo "OK  $*"; }
ko() { echo "KO  $*"; ko=$((ko + 1)); }
entete() { curl -sS -o /dev/null -D - "$@" | tr -d '\r'; }
a() { grep -iE "^$1:" <<<"$2" | head -1 | cut -d' ' -f2- ; }

# 1. santé de l'API
s=$(curl -sS -m 10 "$URL/api/health" 2>&1); grep -q '"status"' <<<"$s" && ok "api/health : ${s:0:120}" || ko "api/health : ${s:0:120}"

# 2. redirections
h=$(entete -m 10 "http://${URL#https://}/"); grep -qE "^HTTP/[0-9.]+ 301" <<<"$h" && ok "http → https (301)" || ko "http → https : $(head -1 <<<"$h")"

# 3. page de l'appli : en-têtes
h=$(entete -m 10 "$URL/")
[ -n "$(a strict-transport-security "$h")" ] && ok "HSTS" || ko "HSTS absent"
[ -n "$(a content-security-policy-report-only "$h")" ] && ok "CSP en observation" || ko "CSP en observation absente"
[ -n "$(a content-security-policy "$h")" ] && ko "CSP BLOQUANTE présente sur la page (attendu : observation seule)" || ok "aucune CSP bloquante sur la page"
[ "$(a x-frame-options "$h")" = "DENY" ] && ok "X-Frame-Options DENY" || ko "X-Frame-Options : $(a x-frame-options "$h")"
grep -qi "no-cache" <<<"$(a cache-control "$h")" && ok "index.html en no-cache" || ko "Cache-Control de la page : $(a cache-control "$h")"

# 4. assets : type du .mjs, compression, cache
W=$(ls "$WWW/assets" 2>/dev/null | grep -m1 -E '^pdf\.worker.*\.mjs$')
if [ -n "$W" ]; then
  h=$(entete -m 20 -H 'Accept-Encoding: gzip' "$URL/assets/$W")
  grep -qiE "^(application|text)/javascript" <<<"$(a content-type "$h")" && ok "$W : $(a content-type "$h")" || ko "$W : type $(a content-type "$h")"
  grep -qi "immutable" <<<"$(a cache-control "$h")" && ok "$W en cache immuable" || ko "$W : Cache-Control $(a cache-control "$h")"
else ko "aucun pdf.worker*.mjs dans $WWW/assets"; fi
J=$(ls "$WWW/assets" 2>/dev/null | grep -m1 -E '^index-.*\.js$')
if [ -n "$J" ]; then
  h=$(entete -m 20 -H 'Accept-Encoding: gzip' "$URL/assets/$J")
  [ "$(a content-encoding "$h")" = "gzip" ] && ok "$J compressé (gzip, $(a content-length "$h") octets)" || ko "$J : content-encoding « $(a content-encoding "$h") »"
else ko "aucun index-*.js dans $WWW/assets"; fi

# 5. adresse interne de X-Accel-Redirect : injoignable de l'extérieur
c=$(curl -sS -o /dev/null -w '%{http_code}' -m 10 "$URL/_fichiers_internes/x")
[ "$c" = "404" ] && ok "/_fichiers_internes/ injoignable de l'extérieur (404)" || ko "/_fichiers_internes/ répond $c (attendu 404 : location internal)"

# 6. rapport CSP accepté (corps vide de test : 204 ou 4xx de validation, jamais 5xx)
c=$(curl -sS -o /dev/null -w '%{http_code}' -m 10 -X POST -H 'Content-Type: application/csp-report' --data '{"csp-report":{"violated-directive":"img-src","blocked-uri":"https://exemple.invalid/x"}}' "$URL/api/csp-rapport")
[ "${c:0:1}" != "5" ] && [ "$c" != "000" ] && ok "POST /api/csp-rapport : $c" || ko "POST /api/csp-rapport : $c"

echo "--- $ko KO"
exit $ko
