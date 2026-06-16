# PHASE 0 — Correctif troncature : résultat avant/après

> Suite de `PHASE0-investigation-troncature.md`. Le correctif **Option A (chunking inline)** a été implémenté puis validé par **un run réel** sur le CCAP + CCTP lot 02 de Gueux. Commit : `53e288b` (`fix(analysis): chunking anti-troncature DCE`).

## Le correctif (rappel)
- **Avant** : `routers/analysis.py` envoyait `text[:30000]` → le CCAP (120 635 chars / 48 pages) était coupé à la **page 13**, perdant ~71 % des exigences (assurances, pénalités, DOE…).
- **Après** : le document **entier** est envoyé, découpé en tranches ≤ 40 k chars par l'analyzer (`_split_into_chunks` / `_build_call_texts`), avec **ré-injection de l'en-tête du document dans chaque tranche** (attribution `source_document` correcte), puis **fusion + dédup** (`_dedup_requirements`). Toute troncature résiduelle est **loggée** (warning + champ `analyzed_in_chunks`) — plus de perte silencieuse. Garde-fou anti-pathologique à 300 k chars.

## Résultat chiffré (run réel, CCAP + CCTP lot 02 Gueux)

| Scénario | Exigences totales | dont CCAP | dont CCTP |
|---|---|---|---|
| **Production réelle (capé 30 k)** — estimé | ~13 (CCAP) | ~13 | — |
| **Baseline mesuré** (1 appel/passe, texte entier) | 98 | 45 | 53 |
| **Correctif chunké** | **218** | **118** | **100** |

- **CCAP : ~13 (prod capée) → 118 (chunké)**, soit l'objectif initial (récupérer les ~32 perdues) **largement dépassé**.
- **Global : 98 → 218 (+122 %)**, `analyzed_in_chunks = 6` (CCAP en 4 tranches : 25+46+27+20 ; CCTP en 2 : 50+50).
- **Dédup** : 118→118 et 100→100 (le recouvrement entre tranches n'a créé aucun doublon).
- 1 exigence rejetée pour JSON malformé du modèle (robustesse Pydantic existante, 1/219 — non lié au chunking).

## Les 5 familles d'exigences « perdues » sont récupérées
Toutes situées **au-delà de la page 13** (donc invisibles en prod capée) :

| Exigence (offset dans le CCAP) | Avant (capé) | Après (chunké) |
|---|---|---|
| Assurance RC 8 M€ / sinistre (offset ~101 k) | ❌ | ✅ |
| Pénalités de retard 300 €/jour (~54 k) | ❌ | ✅ |
| Facturation Chorus Pro (~40 k) | ❌ | ✅ |
| Garantie à première demande (avance) | ❌ | ✅ |
| DOE / plans de récolement (~58 k) | ❌ | ✅ |

## Découverte : un DOUBLE goulot d'étranglement
Le run révèle que même le baseline « 98 » **sous-extrayait** : un seul appel sur 120 k chars butait sur le **plafond de SORTIE** (`max_tokens = 16384`), pas seulement sur la troncature d'entrée. Le chunking corrige **les deux** :
1. **Entrée** : plus de coupe à 30 k → tout le document est lu.
2. **Sortie** : chaque tranche dispose de son propre budget de 16 k tokens → la réponse n'est plus tronquée.
C'est pourquoi le gain (218) dépasse largement les ~45 attendues d'un CCAP entier en un seul appel.

## Latence (à surveiller)
- Durée du run : **534 s (~9 min)** pour 6 appels séquentiels.
- C'est **au-dessus de l'ancien budget 480 s** (qui aurait provoqué un timeout) → le budget a été relevé à **900 s** dans `analysis.py`.
- ⚠️ En production, l'analyse est un appel **HTTP synchrone** (awaité jusqu'à 900 s). Sur de très gros DCE ou derrière un proxy qui coupe les requêtes longues, prévoir l'**évolution Option C (analyse asynchrone via Celery)** — déjà installé mais non câblé pour l'analyse. Non bloquant aujourd'hui.

## Coût
Run de validation unique : **~0,7–1,0 $** (6 appels, ~47 k tokens input frais + bundle skills caché réutilisé sur chaque tranche → cache hit ; ~30-40 k tokens output). Cohérent avec l'objectif ~1 €/AO. Le caching est **préservé** (system + skills identiques sur toutes les tranches).

## Tests
- `backend/tests/test_dce_chunking.py` : 14 tests (fonctions pures + preuve/contre-preuve sur le CCAP réel, **0 appel API**).
- Suite complète : **326/326 verts**, aucune régression.

## Limites (inchangées vs Phase 0)
Mesure sur **1 seul DCE** (PDF natifs, bien nommés, 1 lot). Le volume élevé (CCTP 100 exigences) reste à confronter à d'autres DCE pour juger la **qualité** (granularité, faux positifs), au-delà du **recall** ici démontré.

## Fichiers de mesure (locaux, non versionnés)
`scripts/_validate_chunking_run.py` et `docs/comparaison-AB/A-analyse-output.CHUNKED.json` sont conservés en local pour re-mesure future (non commités).
