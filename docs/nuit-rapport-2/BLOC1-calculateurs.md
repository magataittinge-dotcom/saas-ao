# BLOC 1 — Endpoints calculateurs DÉTERMINISTES (0 API)

**Objectif :** exposer via l'API les 2 différenciateurs déterministes préparés la nuit 1 (`services/synorix_calc.py`, fonctions pures testées), sans toucher le cœur IA. **Ajout PUR** : 2 nouveaux fichiers + 1 import + 1 include dans `main.py`. Aucun router existant ni le cœur modifié.

## Ce qui a été créé

| Fichier | Rôle |
|---|---|
| `backend/schemas/calculators.py` | Schémas Pydantic d'entrée, **validation stricte** (bornes/signes). |
| `backend/routers/calculators.py` | Router `/api/calculators` — 2 endpoints POST authentifiés, délèguent à `synorix_calc`. |
| `backend/tests/test_calculators_endpoints.py` | 8 tests d'intégration (nominal + limite + rejets + auth). |
| `backend/main.py` | +1 import (`calculators`) + 1 `include_router(prefix="/api/calculators")`. |

Délégation : `synorix_calc.compute_oab` / `compute_retenue_garantie` → skills Synorix testées (#95 double moyenne L2152-5, #24 retenue CCAG-Travaux Art.19). **0 appel IA, 0 coût.** Auth via `get_auth_user` (cohérent avec les autres routers) ; rate-limit global 60/min hérité.

## Endpoints

### `POST /api/calculators/oab` — Offre Anormalement Basse (double moyenne L2152-5 CCP)
**Entrée** (`OABRequest`) : `prix_candidat` (>0), `prix_offres` (liste, ≤200, chacune >0, peut être vide), `seuil_oab` (0<.≤1, défaut 0,9).

Exemple requête :
```json
{"prix_candidat": 85000, "prix_offres": [85000, 120000, 125000, 130000, 135000]}
```
Exemple réponse :
```json
{
  "m1": 119000.0, "m2": 119000.0, "seuil_oab_euros": 107100.0,
  "marge_avant_oab": -22100.0, "gauge": "rouge", "est_oab": true,
  "rappel_juridique": "Une OAB ne peut être rejetée sans procédure contradictoire préalable (TA Nantes, 19/05/2025, Société Verchéenne, n° 2506407).",
  "avertissements": [], "sources_nbk": ["N7"]
}
```

### `POST /api/calculators/retenue-garantie` — RG + pénalités + intérêts moratoires
**Entrée** (`RetenueGarantieRequest`) : `montant_ht` (>0), `tva` (0–1, déf 0,20), `taux_rg` (0–**0,05** max légal), `penalite_diviseur` (>0, déf 3000), `jours_retard_execution` (≥0), `valeur_ht_en_retard?`, `creance_ttc?`, `taux_bce` (0–1), `jours_retard_paiement` (≥0).

Exemple requête :
```json
{"montant_ht": 250000, "jours_retard_execution": 5}
```
Exemple réponse :
```json
{
  "montant_ttc": 300000.0,
  "postes": [
    {"poste": "Retenue de garantie", "montant": 15000.0, "base": "TTC", "detail": "300000.0 × 5% (Art. 19 CCAG-Travaux 2021)"},
    {"poste": "Pénalités de retard", "montant": 416.67, "base": "HT", "detail": "250000.0 × 5 / 3000 (P = V × R / diviseur)"},
    {"poste": "Cautionnement (substitution RG)", "montant": 15000.0, "base": "TTC", "detail": "300000.0 × 5% (CCP R2191-36 ; ≤ 5 %)"}
  ],
  "avertissements": ["Montant de pénalités < 1 000 € : seuil d'exonération possible (CCAG-T)."]
}
```

## Sécurité / validation
- **Auth obligatoire** : sans utilisateur authentifié → 401/403 (test `test_calculators_require_auth`).
- **Validation Pydantic stricte** : `prix_candidat`/`montant_ht` > 0 ; offres positives ; `taux_rg ≤ 5 %` ; jours ≥ 0 ; bornes hautes (≤ 1e12, listes ≤ 200) contre les entrées absurdes. Entrée invalide → **422** (non exécutée).
- **0 injection possible** : calcul pur sur des nombres validés, aucune requête DB ni I/O externe.

## Tests — 8/8 verts
Nominal (OAB offre basse → rouge/`est_oab`; RG 5 % du TTC = 6000 sur 100k), cas limite (OAB sans concurrent → avertissement, pas d'erreur ; pénalités de retard), rejets (montant ≤ 0, offre négative, seuil hors borne, `taux_rg` > 5 %, jours négatifs → 422), et auth (401/403 sans token).

**Suite complète : 511 verts** (503 + 8 nouveaux). Cœur IA (`dce_analyzer`, `memoire_generator`, `prompts`, `ai_skills`) **non touché**.

## Verdict
✅ **Les 2 calculateurs déterministes sont branchés, testés, sécurisés et sans régression.** Prêts à être consommés par le front (cf. BLOC3). 0 API, 0 coût récurrent.
