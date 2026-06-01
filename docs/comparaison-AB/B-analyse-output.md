# Système B (91 skills synorix/) — sortie analyse DCE

**Date :** 2026-06-01
**Système :** `synorix/skills/` (extraction) via `registry.invoke` + `synorix/ai/client.py`
**Client :** `AsyncAnthropic`, **non-streaming**, `max_tokens=4096`, `json.loads(response.content[0].text)` (aucun pré-traitement)
**Modèle :** `claude-sonnet-4-6`
**Entrée (identique à A) :** CCAP (120 635 chars) + CCTP lot 02 (69 437 chars)
**Sortie brute :** `B-analyse-output.json`
**Scripts jetables :** `scripts/compare_b_analyse.py`, `scripts/compare_b_diag.py`, `scripts/compare_b_diag2.py`

---

## Résultat chiffré

> **B a produit 0 exigence exploitable.** Les 4 skills d'extraction ont **toutes échoué** au runtime.

| Skill (entrée) | Statut | Temps | Cause exacte |
|---|---|---|---|
| `extraction-exigences-administratives` (CCAP) | ❌ FAIL | 35,0 s | `JSONDecodeError` — le modèle a renvoyé de la **prose** (refus correct anti-invention : « sans le RC, lister des pièces serait inventé ») → pas de JSON à parser |
| `extraction-exigences-techniques` (CCTP) | ❌ FAIL | 52,4 s | `JSONDecodeError` — sortie **valide mais (a) entourée de ```json fences et (b) TRONQUÉE** (`stop_reason=max_tokens`, 4096 tokens out) → JSON incomplet |
| `extraction-criteres-jugement` (CCAP) | ❌ FAIL | 6,2 s | `JSONDecodeError` — prose (pas de RC → pas de critères) |
| `extraction-pieces-offre` (CCAP) | ❌ FAIL | 4,9 s | `RateLimitError 429` — org **30 000 tokens/min** dépassé (4 appels plein-document enchaînés, sans découpage) |

## Diagnostics bruts (preuves)

**Call ADMIN (CCAP tronqué 18K)** — `stop_reason=end_turn`, 987 tokens out :
> « En analysant les documents fournis (RC non fourni, CCAP fourni…), je n'identifie **aucune exigence administrative de candidature**… Sans le RC, toute liste serait **inventée**, ce qui viole la règle absolue. » → **prose, pas de JSON**.

**Call TECHNIQUE (CCTP complet)** — `stop_reason=max_tokens`, **26 699 tokens in / 4096 out** :
- Début : `'```json\n{\n  "exigences": [\n    {\n      "type": "norme",\n      "libelle": "Étanchéité sur éléments porteurs en maçonnerie…'`
- Fin (tronquée mid-objet) : `'…"valeur_seuil": "Rw + Ctr ≥ 40 dB"… "type": "performance", "libelle": "Résistance thermique de la première couche d\'isolant laine de roche'` *(coupé net, pas de fermeture)*
- `json.loads` → **FAIL** (fences + JSON incomplet).

## Lecture qualité (sur le fragment technique généré avant troncature)
Le contenu **avant troncature** était riche et normé : `valeur_seuil "Rw + Ctr ≥ 40 dB"`, résistance thermique laine de roche, étanchéité sur maçonnerie, avec `page_source`. → les **prompts** d'extraction B semblent capter des **seuils normatifs chiffrés** (acoustique, thermique) que A structure moins. **Mais ce contenu n'est jamais livré** (crash de parsing + troncature).

## Défauts de RUNTIME bloquants identifiés (≠ qualité des prompts)
1. **`synorix/ai/client.py` ne nettoie pas les fences ```json** → tout output fencé crashe.
2. **`max_tokens=4096` fixe, sans continuation** → une extraction CCTP réelle (≈49 exigences) **tronque** mid-JSON.
3. **Aucun découpage / budget de tokens** → appels plein-document → **rate limit 30K TPM** dès le 4ᵉ appel.
4. **Aucune gestion du refus/prose** (le modèle peut légitimement répondre en texte) → crash.
5. **Aucun retry/backoff** sur 429 (A en a 3).
