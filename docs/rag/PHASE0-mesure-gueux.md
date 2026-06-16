# PHASE 0 — Mesure du lecteur DCE sur le DCE de Gueux

> ⚠️ **1 seul DCE = diagnostic de départ, PAS une validation générale.** Toutes les mesures ci-dessous portent sur un unique marché (École élémentaire de Gueux), composé exclusivement de **PDF natifs (avec couche texte)** et de **fichiers bien nommés**. Les cas scannés, mal nommés et DPGF-PDF-only ne sont **pas** couverts. Voir « Limites ».
>
> **Aucun appel API n'a été fait pour cette mesure** (budget préservé). Méthode : exécution locale du vrai `DocumentProcessor` du repo + analyse statique de la sortie d'analyse **déjà générée** (`docs/comparaison-AB/A-analyse-output.json`, 98 exigences, modèle `claude-sonnet-4-6`).

## Source mesurée
- DCE complet uploadé : `backend/uploads/projects/0200d0e9…/dce/` (≈ 90 fichiers, multi-lots, ~500 Mo).
- Analyse étalon : CCAP (passe 1, 120 635 chars) + CCTP lot 02 Étanchéité (passe 2, 69 437 chars) → **98 exigences** extraites (`_meta.elapsed=247,9 s`).
- Corpus de vérification = `_input_CCAP.txt` + `_input_CCTP_lot02_etancheite.txt` (le texte **exact** envoyé au modèle).

## Résultats

### 1. Nombre d'exigences extraites
| Mesure | Valeur | Verdict |
|---|---|---|
| Exigences totales | **98** (CCAP 45 + CCTP 53) | ✅ **> cible 40-80**, très au-dessus du plancher 25 |

→ **Le rappel (recall) est fort** sur ce DCE. Le lecteur n'est pas avare en exigences.

### 2. Fidélité des `source_excerpt` (exactitude au caractère, requise pour le surlignage)
| Mesure (n=98) | Valeur |
|---|---|
| Excerpt **verbatim** dans le doc cité | **32 % (31/98)** |
| Verbatim mais dans un autre doc | 0 % |
| **Non verbatim** (paraphrase / reformulation / coupe) | **68 % (67/98)** |
| Excerpts contenant explicitement `[...]` ou `…` | 16 % (16/98) |
| Récupérables en **fuzzy** (40 premiers chars retrouvés) | **63 % (62/98)** |

→ ❌ **Les excerpts ne sont PAS fiables au caractère près.** 2/3 sont reformulés par le modèle (le highlighter fuzzy en rattrape ~63 %, donc **~37 % risquent de ne pas se surligner** correctement).

### 3. Fiabilité des `source_page`
- `source_page` présent sur **100 %** des exigences… mais **aucun marqueur de page n'est fourni au modèle** (0 form-feed / 0 « Page N » dans l'input) → ce sont des **estimations**.
- Vérification sur le sous-ensemble verbatim CCAP (seul vérifiable) : **10/11 sur la bonne page**, 1 à ±1 page.
→ ⚠️ Plausible quand l'extrait est verbatim, mais **non garanti et invérifiable pour les 68 % non-verbatim**. Pas une base fiable pour une citation page-exacte.

### 4. Fidélité DPGF
- DPGF **Excel** Lot 01a GO (`openpyxl`, chemin réel du code) : **298 lignes brutes → 159 non-vides** (139 lignes vides écartées), structure colonne préservée en texte (`POSTE\tDESIGNATION\tUNITE\tQUANTITE\tPRIX U HT\tPRIX TOTAL HT`), **19 cellules numériques** (bordereau DCE majoritairement vierge de prix — normal en phase DCE).
- DPGF **PDF** (jumeau du même lot) : 4 pages, **4 692 chars de texte brut**, aucune structure tabulaire.
→ ✅ Excel : lignes/quantités lues correctement, lignes vides bien écartées. ❌ PDF : tableau aplati, fidélité faible.

### 5. Classification des documents
Test du vrai `_detect_doc_type` sur les noms de fichiers Gueux :
| Document | Classé | Correct ? |
|---|---|---|
| `2829 - CCAP.pdf` | `ccap` | ✅ |
| `2829 - AE.pdf` | `acte_engagement` | ✅ |
| `2829 - RDC.pdf` (Règlement De Consultation, 21 p / 49 k) | `rc` | ✅ (faux ami « RDC » bien géré) |
| `…lot 02 tanchit couverture_DCE.pdf` | `cctp` | ✅ |
| `DCE-GO01.pdf`, `DCE-ST01.pdf` | `cctp` | ✅ |
| `…DPGF Lot 01a GO.xlsx/.pdf` | `dpgf` | ✅ |
| `ARCH 03 PLAN RDC.pdf`, `CHPB02…` | `plan` | ✅ |
→ ✅ **Classification correcte sur ce DCE** — parce que les fichiers sont **bien nommés**. (Note : `2829 - RDC.pdf` est dupliqué `2829 _ RDC.pdf` → la dédup md5 de `analysis.py` neutralise le doublon.)

### 6. Extraction de texte (PDF natifs)
| Doc | Pages | Chars extraits |
|---|---|---|
| CCAP | 48 | 120 635 |
| RC (2829 - RDC) | 21 | 49 540 |
| CCTP lot 02 | — | 69 437 |
| AE | 20 | 33 564 |
| DPGF Lot01a (xlsx) | — | 4 518 |
→ ✅ Extraction propre et complète sur PDF natifs (PyMuPDF). ⚠️ Le CCAP (120 k) dépasse le cap passe-1 `ccap=30 000` → **en pipeline réel, il serait tronqué à ~25 %** (ici l'étalon A/B l'a passé entier hors cap).

## Verdict

| Dimension | Niveau |
|---|---|
| Rappel (nombre d'exigences) | 🟢 **Solide** (98, > cible) |
| Classification (fichiers bien nommés, PDF natifs) | 🟢 **Solide** |
| Extraction texte PDF natif | 🟢 **Solide** |
| Lecture DPGF Excel | 🟢 Correcte |
| Lecture DPGF PDF / tableaux | 🟠 **Faible** (aplati) |
| Traçabilité `source_excerpt` (verbatim) | 🔴 **Faible** (32 %) |
| Traçabilité `source_page` | 🟠 **Moyenne / invérifiable** |
| Robustesse scannés / mal nommés | ⚫ **Non testé** (gap connu : pas d'OCR, classif par nom) |

**Conclusion : sur Gueux, le lecteur est SOLIDE pour le rappel et la classification, mais MOYEN-FAIBLE sur la traçabilité (excerpt non verbatim, page estimée).** C'est précisément la traçabilité qui est critique pour un RAG (citations vérifiables + surlignage exact).

## Limites de la mesure (à dire au client)
1. **1 seul DCE** → aucune généralisation statistique possible.
2. DCE **100 % PDF natifs** : l'absence d'OCR n'a pas pu être éprouvée (aucun scanné dans Gueux).
3. Fichiers **bien nommés** : la classification par nom n'a pas été mise en difficulté.
4. **1 seul corps de métier analysé** (lot 02 Étanchéité) + CCAP ; les 12 autres lots non mesurés.
5. Mesure faite sur une **sortie d'analyse pré-existante** (config A/B), pas un run pipeline complet de bout en bout.
