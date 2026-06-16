# PHASE 0 — Recommandation

> Synthèse décisionnelle issue de la cartographie (`PHASE0-cartographie-dce-reader.md`) et de la mesure sur Gueux (`PHASE0-mesure-gueux.md`). Lecture seule — rien n'a été installé ni modifié.

## 1. Le lecteur DCE est-il une fondation SOLIDE pour le RAG ?

**Réponse : OUI pour l'extraction (recall + classification), NON pour la traçabilité — qu'il faut renforcer AVANT/AVEC le RAG.**

- ✅ Ce qui est déjà bon : rappel élevé (98 exigences sur Gueux), extraction PDF natif fiable (PyMuPDF), lecture DPGF Excel structurée, pipeline 2 passes maîtrisé en coût (prompt caching) et latence, validation Pydantic robuste.
- 🔴 Ce qui bloque un RAG fiable :
  1. **Pas de pagination réelle** transmise à l'IA → `source_page` estimé (invérifiable sur 68 % des cas).
  2. **`source_excerpt` non verbatim** (32 % exacts seulement) → citations/surlignage non garantis au caractère.
  3. **Pas d'OCR** → tout DCE scanné produit 0 exigence **silencieusement**.
  4. **Tableaux PDF/DOCX aplatis** → DPGF/BPU hors Excel mal lus.

Un RAG hérite directement de ces 4 points : il indexerait du texte sans ancrage page/offset fiable, citerait des passages non vérifiables, et ignorerait en silence les sources scannées. **Donc : construire le socle de traçabilité d'abord.**

## 2. Renforcements nécessaires, par priorité

### 🔴 P1 — Pré-requis indispensables au RAG (à faire avant l'indexation)
1. **Ancrage page + offsets à l'extraction.** Conserver, pour chaque bloc de texte, `(document_id, page, char_start, char_end)`. PyMuPDF le permet déjà (extraction page par page, `get_text("dict")` donne les bbox). Coût faible, impact maximal : rend `source_page` vérifiable et le surlignage exact.
2. **`source_excerpt` verbatim garanti.** Ne plus faire confiance au texte renvoyé par le modèle : après extraction, **re-localiser** l'exigence dans la source (recherche fuzzy → snap sur le texte réel) et stocker l'extrait **réel** + ses offsets. Alternative : demander au modèle des offsets/citations et les valider côté backend (rejet si non trouvé).

### 🟠 P2 — À traiter pour une robustesse générale (avant d'élargir à tout type de DCE)
3. **OCR de secours.** Détecter `texte vide / densité anormalement basse` après extraction → fallback OCR (`ocrmypdf`/Tesseract, ou Docling qui intègre l'OCR). Au minimum : **alerter** au lieu d'échouer en silence.
4. **Extraction de tableaux dédiée** pour DPGF/BPU/DQE en PDF et DOCX (PyMuPDF `find_tables()`, `pdfplumber`, ou **Docling** qui structure nativement les tableaux). Améliore la fidélité prix/quantités et la détection de lignes vides.
5. **Classification à repli sur le contenu** quand le nom de fichier est ambigu (premiers ko de texte → mots-clés « règlement de consultation », « clauses administratives »…). Évite qu'un fichier mal nommé soit ignoré de l'analyse.

### 🟡 P3 — Optimisations (le RAG les rend moins urgentes)
6. **Supprimer/relever les caps de troncature** (30–50 k) : avec un RAG, on indexe tout et on récupère les passages pertinents au lieu de tronquer en aveugle. Sur Gueux, le CCAP fait 120 k chars vs cap 30 k → 75 % perdus en pipeline réel.
7. **Signaux qualité** : remonter (au lieu de masquer) les extractions vides, les troncatures (`partial_analysis`), le nombre d'exigences faible.

### Sur Docling / pgvector / Voyage (Phase 1+, NE PAS installer maintenant)
- **Docling** est pertinent : il couvre d'un coup P1.1 (layout + pages), P2.3 (OCR), P2.4 (tableaux). À **évaluer en Phase 1** sur Gueux + DCE scannés, en mesurant le gain réel vs le couple PyMuPDF + table-finder + OCR (plus léger). Décision data-driven, pas par hype.
- pgvector / Voyage : Phase d'indexation/retrieval, hors périmètre Phase 0.

## 3. DCE supplémentaires à récupérer pour une VRAIE mesure

Le diagnostic Gueux est biaisé (PDF natifs, fichiers bien nommés, 1 corps de métier). Pour mesurer sérieusement, rassembler :
1. **Au moins 1 DCE scanné / photocopié** (PDF image) → éprouve l'OCR (le point le plus risqué, totalement non testé).
2. **D'autres corps de métier** (CVC, électricité, VRD, charpente) → vocabulaire et structures CCTP différents.
3. **D'autres acheteurs / maîtres d'œuvre** → gabarits RC/CCAP variés (chaque MOE a son modèle).
4. **Un DCE avec DPGF/BPU uniquement en PDF** (pas d'Excel) → éprouve l'extraction de tableaux.
5. **Une archive mal nommée** (`doc1.pdf`, `scan0001.pdf`) → éprouve la classification.
6. **Un très gros CCTP (> 30 k chars)** → éprouve la troncature / le besoin de chunking.

> Cible : ~8–12 DCE variés pour passer d'un « diagnostic de départ » à une mesure représentative avec un jeu de vérité terrain (exigences attendues annotées manuellement sur 1–2 lots).

## Prochaine étape recommandée
**Avant d'indexer quoi que ce soit dans le RAG : implémenter P1.1 (ancrage page/offsets) + P1.2 (excerpt verbatim).** Ce sont des modifications ciblées du lecteur (PyMuPDF déjà en place), peu coûteuses, qui transforment la traçabilité — le maillon le plus faible — en fondation fiable. Puis P2 (OCR + tableaux) en parallèle de la collecte des DCE de test, et évaluation Docling en Phase 1.
