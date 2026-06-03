# BLOC 4 — Non-régression + santé du repo (0 API)

## 1. Suite de tests — ✅ TOUT VERT
`pytest tests/ synorix/` (interpréteur `backend/venv`) → **511 passed** (~9 s), 0 échec, 0 erreur.
- 503 d'avant + **8 nouveaux** tests d'intégration calculateurs (Bloc 1).
- Couvre : skills Synorix (199), backend services/routers (compliance, candidature, checklist, doc_type, sécurité cross-org, export, billing…), mémoire (segments/hybride/full-sonnet), calculateurs déterministes.

## 2. Scan secrets — ✅ AUCUN secret commité
- `.env` et `.env.local` sont **gitignorés** (`.gitignore` l.15-16) ; **aucun `.env` tracké**.
- `git grep` des patterns sensibles (`sk-ant-…`, `AKIA…`, `sk_live_…`, clés privées `-----BEGIN…`, `password=…`) sur les fichiers trackés (hors `.md`, hors usages `os.environ`/`settings`/`example`) → **aucun secret en dur**.
- Seuls hits : `backend/docs/MIGRATION_PROVIDER.md` → **placeholders de documentation** (`sk_live_FR_…`, `sk_live_UAE_…` tronqués), pas de vraie clé.
- Aucun fichier sensible tracké (`.pem`, `.key`, `credentials`, `secret`).

## 3. État git — ✅ propre et synchronisé
- `HEAD == origin/refactor-v2` (`eb44305`) → **tout est pushé**, branche à jour.
- Arbre des fichiers **trackés** : propre (aucune modif non commitée).
- Fichiers non trackés restants = données de test (`docs/comparaison-AB/*.txt|*.json` — textes DCE Gueux, fixtures) et scripts jetables (`scripts/*.py` de comparaison/e2e). **Intentionnellement non trackés** depuis les sessions précédentes ; ne contiennent pas de secret. Laissés tels quels (règle nuit : ne pas supprimer/committer hors périmètre).

## Verdict
✅ **Repo sain** : 511 tests verts, aucun secret commité, branche `refactor-v2` propre et entièrement poussée. Les ajouts de la nuit (router calculateurs + tests) n'introduisent aucune régression. Cœur IA non touché.
