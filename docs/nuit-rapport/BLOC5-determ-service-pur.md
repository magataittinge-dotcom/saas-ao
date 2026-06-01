# BLOC 5 — Différenciateurs déterministes en service PUR (non câblé, prêt à brancher)

**0 API, 0 risque IA, moteur A non touché.** Fait uniquement parce que Blocs 1-4 sont finis.

## Ce qui a été produit

| Fichier | Rôle |
|---------|------|
| `backend/services/synorix_calc.py` | Service pur : `compute_oab(...)` (#95) et `compute_retenue_garantie(...)` (#24). Fonctions **async** qui délèguent aux skills déterministes déjà testées (`model="none"`, 0 LLM) et renvoient des **dicts** prêts pour un endpoint. |
| `backend/tests/test_synorix_calc.py` | 5 tests unitaires déterministes (0 API) : OAB offre basse/sûre/sans concurrent, retenue de garantie + pénalités de retard. |

## Choix d'architecture (important)

- **Délégation, pas duplication :** les wrappers appellent les skills existantes (`CalculateurOabTempsReel`, `CalculatriceRetenueGarantie`) → **source unique de vérité**, aucun risque de divergence d'arithmétique (la double moyenne L2152-5 et l'Art.19 CCAG restent dans les skills, couvertes par les tests synorix).
- **Async :** les skills sont async (signature commune) ; les wrappers le restent → un futur endpoint FastAPI `await compute_oab(...)` sans friction. Le calcul lui-même reste synchrone/déterministe (aucune I/O).
- **`client=None` sûr :** vérifié que les deux skills ne touchent jamais le client LLM (`# Aucun appel au client : calcul pur`).

## Isolation vérifiée

- `grep synorix_calc main.py routers/` → **0 résultat** : le module n'est importé nulle part. **Aucun impact sur le comportement live.**
- Suite complète après ajout : **499 passed** (494 + 5 nouveaux), 0 échec.

## Comment Mohamed le branche au réveil (3 étapes, ~20 min)

1. Créer `backend/routers/synorix_skills.py` :
   ```python
   from fastapi import APIRouter
   from pydantic import BaseModel
   from services.synorix_calc import compute_oab, compute_retenue_garantie

   router = APIRouter(prefix="/api/projects", tags=["synorix"])

   class OabBody(BaseModel):
       prix_candidat: float
       prix_offres: list[float] = []

   @router.post("/{project_id}/synorix/oab")
   async def oab(project_id: int, body: OabBody):
       return await compute_oab(prix_candidat=body.prix_candidat,
                                prix_offres=body.prix_offres, project_id=project_id)
   ```
   (idem pour `/synorix/retenue-garantie` avec les champs de `compute_retenue_garantie`).
2. Dans `main.py` : `app.include_router(synorix_skills.router)` **en ajout** (ne toucher aucun router existant).
3. Front : ajouter un encart « Risque OAB » dans l'étape Export et une mini-calculatrice « Retenue de garantie » dans la fiche projet (cf. BLOC3 §A pour l'UI).

> ⚠️ Le branchement réel (router + include_router + UI) n'a **pas** été fait cette nuit (cela modifierait le comportement live). Conformément à la règle, seul le service pur + tests ont été préparés.

## Note de découverte (utile)
La retenue de garantie est calculée sur le **TTC** (base légale Art.19 CCAG : 5 % de chaque acompte TTC), pas sur le HT — comportement correct de la skill, confirmé par le test.
