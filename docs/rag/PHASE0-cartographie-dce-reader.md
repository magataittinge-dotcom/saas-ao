# PHASE 0 — Cartographie du lecteur DCE actuel

> Audit **lecture seule** du pipeline d'ingestion d'un DCE client, maillon par maillon. Aucune modification de code. Objectif : connaître la fondation avant de construire le RAG.

## Vue d'ensemble du pipeline

```
Upload (zip ou fichier) ─▶ Dézippage ─▶ Classification type (regex nom fichier)
   └▶ Extraction texte (PyMuPDF / openpyxl / python-docx) [PAS d'OCR]
        └▶ Tagging lot (regex nom fichier) ─▶ Filtrage lot + dédup (md5)
             └▶ Découpe 2 passes (RC/CCAP | CCTP/DPGF) + caps de troncature
                  └▶ Claude Sonnet 4.6 (JSON libre → json_repair → Pydantic)
                       └▶ requirements[] (exigence, source_document, source_page, source_excerpt…)
                            └▶ Surlignage PDF (recherche fuzzy PyMuPDF)
```

## Stack de parsing (réelle, vérifiée dans le code)

| Besoin | Lib / méthode | Fichier |
|---|---|---|
| PDF (texte) | **PyMuPDF (`fitz`)** `page.get_text()` mode défaut | `services/document_processor.py:50` |
| PDF (fallback lot) | **PyPDF2** | `services/lot_detector.py:200` |
| DOCX | **python-docx** — `paragraphs` uniquement (⚠ **pas les tableaux**) | `document_processor.py:63` |
| XLSX/XLS/ODS | **openpyxl** / xlrd / odfpy — cellules jointes par `\t` ou ` \| ` | `document_processor.py:76`, `document_tagger.py:199` |
| TXT | decode utf-8 | `document_processor.py:70` |
| Conversion → PDF (preview/surlignage) | **LibreOffice headless** (`subprocess`) | `services/pdf_converter.py` |
| Surlignage | PyMuPDF `page.search_for` (fuzzy) | `services/pdf_highlighter.py` |
| OCR | **AUCUN** | — |
| Extraction de tableaux dédiée | **AUCUNE** (camelot/pdfplumber/Docling absents) | — |

Dépendances PDF déclarées : `requirements.txt` → `PyPDF2==3.0.1`, `openpyxl`, `python-docx`, `Pillow`. (PyMuPDF présent dans le venv, utilisé en pratique.)

## Maillon par maillon

### 1. Upload & dézippage — `routers/projects.py:489` (`upload_project_document`)
- Stream vers `SpooledTemporaryFile` (RAM ≤ 10 Mo puis disque), cap **2 Go**, extensions whitelistées (`.pdf .docx .doc .xlsx .xls .zip .png .jpg`).
- ZIP : `_handle_zip_upload` (l.1232) dézippe, gère l'encodage des noms (`_decode_zip_entry_name` l.253), puis **extraction texte en parallèle par threads** (`_extract_all_parallel` l.646).
- **Force** : robuste aux gros DCE, pas de chargement mémoire intégral. **Faiblesse** : pas d'anti-zip-bomb explicite au-delà du cap taille.

### 2. Classification du type de document — `routers/projects.py:57` (`_detect_doc_type`)
- **100 % regex sur le nom de fichier** (cascade DC1→DC2→AE→DPGF→BPU→DQE→…→RC→CCAP→CCTP→plan→autre). Aucune analyse du **contenu**.
- Désambiguïsation « RDC » (Règlement de Consultation vs Rez-De-Chaussée) via présence de marqueurs « plan » dans le nom.
- **Force** : rapide, déterministe, lisible. **Faiblesse** : un fichier mal nommé est mal routé → impacte la découpe 2 passes (un CCTP nommé `doc1.pdf` part en « autre » et est ignoré de l'analyse).

### 3. Extraction de texte — `services/document_processor.py` (`DocumentProcessor.extract`)
- PDF : `fitz.get_text()` page par page, **concaténées par `\n\n` SANS marqueur de page** → l'information de pagination est **perdue** avant l'IA.
- `max_pages` optionnel (troncature). Retourne `("", None)` **silencieusement** en cas d'échec ou de PDF sans couche texte (scanné).
- DOCX : paragraphes seulement (**tableaux ignorés**). XLSX : valeurs de cellules jointes par `\t`.
- **Force** : PyMuPDF rapide et fiable sur PDF natifs. **Faiblesses** : (a) **pas d'OCR** → PDF scanné = texte vide silencieux ; (b) **pas de pages** → traçabilité dégradée ; (c) **tableaux PDF aplatis** en texte brut (DPGF/BPU mal structurés) ; (d) échec silencieux masque les problèmes.

### 4. Tagging lot & DPGF — `services/document_tagger.py`
- `assign_document_lots` : regex nom fichier → `["all"] | ["info"] | ["N"]`. Docs informatifs (diag, plomb, PGC, plans…) filtrés avant IA.
- DPGF Excel : `extract_excel_sheet_for_lot` extrait **uniquement l'onglet du lot sélectionné** (cellules ` | `), data_only=True.
- **Force** : réduit le bruit envoyé à l'IA, lecture Excel structurée par onglet. **Faiblesse** : DPGF en **PDF** (pas Excel) ne bénéficie d'aucune lecture tabulaire → texte brut.

### 5. Orchestration de l'analyse — `routers/analysis.py:34` (`trigger_analysis`)
- Filtrage par lot (`get_documents_for_lot`), **dédup par hash md5** du texte.
- Découpe **2 passes** avec **caps de troncature par type** :
  - Passe 1 (admin) : `rc=50 000`, `ccap=30 000`, `acte_engagement=10 000` chars.
  - Passe 2 (technique) : `cctp=30 000`, `dpgf=10 000` chars.
- En-tête de contexte lot + injection de l'onglet DPGF du lot (3 000 chars).
- **Force** : évite le bloat de contexte, passes courtes (<60 s) → pas de timeout WSL2. **Faiblesse** : **troncature dure** → un CCTP > 30 k chars perd des exigences ; les types `autre`/`plan` ne sont jamais analysés.

### 6. Extraction des exigences — `services/ai/dce_analyzer.py`
- `claude-sonnet-4-6`, `temperature=0`, `max_tokens=16384`, **streaming**, **prompt caching** (system + skills BTP).
- **JSON libre** (pas de structured outputs / tool-use natif) → `json_repair` → validation **Pydantic** `RequirementFromAI`.
- Skills BTP injectés (`analyse-dce-expert`, `reglementation-marches-publics`, `pieges-dce-detecteur`, sections DTU selon le lot).
- Sortie : `requirements[]` = `{exigence, source_document, source_page, source_excerpt, category, priority, source_kind, expected_template_type}` + `criteres_jugement[]` + `infos_marche{}`.
- Garde-fou : log si `< 15` exigences ; `stop_reason=max_tokens` → `partial_analysis=True`.
- **Force** : validation stricte + réparation JSON robuste, caching = ~90 % d'économie d'input tokens sur les appels 2..N. **Faiblesses** : (a) `source_page`/`source_excerpt` **produits par le modèle**, non vérifiés contre la source ; (b) `max_tokens=16384` peut tronquer la réponse sur DCE dense.

### 7. Surlignage — `services/pdf_highlighter.py`
- Recherche **fuzzy** : découpe l'excerpt en segments ~45 chars → `page.search_for` ; fallback mots-clés ; fallback scan de **toutes** les pages.
- **N'exige NI un excerpt exact NI une page correcte** → tolérant.
- **Force** : rattrape les excerpts/page imparfaits. **Faiblesse** : si l'excerpt est trop paraphrasé, échec ou surlignage partiel ; aucune garantie de correspondance au caractère près.

## Format de sortie des exigences (schéma `schemas/compliance.py`)
```
RequirementFromAI:
  exigence: str
  source_document: Optional[str]      # "CCAP", "CCTP"… (libellé, pas un id de fichier)
  source_page: Optional[int]          # estimé par le modèle (aucun marqueur de page en entrée)
  source_excerpt: Optional[str]       # généré par le modèle (pas garanti verbatim)
  category / priority / source_kind / expected_template_type
```

## Synthèse forces / faiblesses architecturales

**Forces**
- PyMuPDF rapide et fiable sur PDF natifs ; pipeline 2 passes + caching maîtrisé en coût/latence.
- Lecture Excel DPGF structurée par onglet/lot ; dédup, filtrage lot et filtrage docs informatifs.
- Validation Pydantic + `json_repair` ; surlignage fuzzy tolérant.

**Faiblesses (par ordre d'impact pour un RAG)**
1. **Pagination perdue** : aucun marqueur de page avant l'IA → `source_page` non fiable/non vérifiable.
2. **Excerpt non verbatim** : généré par le modèle, non re-vérifié sur la source → surlignage/citation non garantis au caractère.
3. **Pas d'OCR** : PDF scanné → texte vide **silencieux** → 0 exigence sans alerte.
4. **Tableaux** : DOCX (tableaux ignorés) et PDF (aplatis) → DPGF/BPU mal lus hors Excel.
5. **Classification par nom de fichier seul** : fichier mal nommé → mal routé/ignoré.
6. **Troncature dure** (caps 30–50 k) : gros CCTP/CCAP → exigences perdues.
7. **Échecs silencieux** (`return ""`) : aucun signal qualité remonté.
```
