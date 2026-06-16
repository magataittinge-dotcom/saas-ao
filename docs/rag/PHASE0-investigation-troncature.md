# PHASE 0 — Investigation : la troncature est-elle réelle en production ?

> Enquête **lecture seule, zéro appel API**. Objectif : déterminer si le cap de 30 k chars sur le CCAP signalé au point #4 du diagnostic est un **vrai problème de production** ou un **artefact de mesure**. Chaque affirmation est étayée par le code (fichier:ligne).

## Verdict en une phrase
**OUI, la troncature est réelle en production** : sur le DCE de Gueux, le CCAP (120 635 chars / 48 pages) est coupé à **page 13/48** avant analyse, et **~71 % des exigences CCAP (32/45) se trouvent au-delà** du seuil — donc silencieusement perdues. Le « 98 exigences » du diagnostic provient d'un **script de test qui contourne le cap**, pas du pipeline de production.

---

## 1. Inventaire des caps du pipeline d'ingestion

| Cap | Valeur | Fichier:ligne | Chemin | Portée |
|---|---|---|---|---|
| **PASS1_CAPS** rc/ccap/ae | **50k / 30k / 10k** | `routers/analysis.py:81` | ✅ **PRODUCTION** | par document, **avant** l'IA |
| **PASS2_CAPS** cctp/dpgf | **30k / 10k** | `routers/analysis.py:82` | ✅ **PRODUCTION** | par document, **avant** l'IA |
| application du cap | `text[:cap]` | `routers/analysis.py:111` et `:115` | ✅ PRODUCTION | slice du texte |
| onglet DPGF dans l'en-tête | `[:3000]` | `routers/analysis.py:150` | ✅ PRODUCTION | contexte lot |
| `_guard_tokens` | 150k tokens (~600k chars) | `services/ai/dce_analyzer.py:259-267` | ✅ PRODUCTION | par passe — **ne se déclenche jamais** (passes < 600k) |
| `max_chars = 60_000` | 60k | `services/ai/dce_analyzer.py:246-248` | ⚠️ **LEGACY** `extract_full_analysis` (single-pass) | **non utilisé en prod** (voir §3) |
| placeholder « document volumineux » | PDF > 500 Ko **non-clé** | `routers/projects.py:684-688` | ✅ PROD (extraction) | **n'affecte PAS** rc/ccap/cctp/dpgf/ae |
| caps mémoire (rc 8k, cctp 55k) | — | `services/ai/memoire_generator.py:337-343` | autre phase (génération mémoire) | hors périmètre ingestion |

## 2. Le chemin de PRODUCTION (upload client → analyse)

Endpoint unique d'analyse : `POST /{project_id}/analyze` → `trigger_analysis` (`routers/analysis.py:34`). C'est le **seul** déclencheur (aucun autre endpoint d'analyse, vérifié par grep).

### Le CCAP est extrait EN ENTIER…
`_KEY_TYPES = {'rc','ccap','cctp','dpgf','acte_engagement'}` (`routers/projects.py:666`). Le placeholder « document volumineux » ne s'applique qu'aux **PDF non-clés > 500 Ko** (`projects.py:684`). Le CCAP étant clé, il passe en extraction complète → `extracted_text` = **120 635 chars** stockés.

### …puis TRONQUÉ à l'analyse
```python
# routers/analysis.py
81  PASS1_CAPS = {"rc": 50_000, "ccap": 30_000, "acte_engagement": 10_000}
...
109 if doc_type in PASS1_CAPS:
110     cap = PASS1_CAPS[doc_type]
111     entry = f"=== {label} — {doc.file_name} ===\n{text[:cap]}"   # ← CCAP coupé à 30 000
112     pass1_parts.append(entry)
```
Le slice `text[:cap]` garde les **30 000 premiers chars** et jette le reste. C'est **avant** l'envoi au modèle (`pass1_text` → `extract_full_analysis_multi_pass`, `analysis.py:172`). Le modèle ne voit donc **jamais** les pages 14 à 48.

### Pas de découpe en sections
Le « 2-passes » sépare par **type de document** (admin RC/CCAP/AE vs technique CCTP/DPGF), **pas** par sections d'un même document (`analysis.py:78-116`). Un CCAP = **une seule entrée**, coupée une seule fois. Il n'existe **aucun** mécanisme de chunking / « continue-from-cut » pour un document trop long.

## 3. Réconciliation : pourquoi 98 exigences malgré le cap ?

Le diagnostic citait 98 exigences (45 CCAP + 53 CCTP). Cette mesure vient de `docs/comparaison-AB/A-analyse-output.json`, produit par **`scripts/compare_a_analyse.py`** — un script de test, pas la production :
```python
# scripts/compare_a_analyse.py
30  CCAP = (OUT / "_input_CCAP.txt").read_text(encoding="utf-8")   # 120 635 chars, ENTIER
38  result = await analyzer.extract_full_analysis_multi_pass(
39      pass1_text=CCAP,                                            # ← passé DIRECTEMENT, sans cap
```
Le script appelle `extract_full_analysis_multi_pass` **directement** avec le texte complet. Or **le cap n'est PAS dans l'analyzer** — il est uniquement dans `analysis.py` (l'orchestration de production). Donc le script **court-circuite le cap**.

➡️ **Conséquence** : les 98 exigences sont le résultat **NON capé**. En production, le CCAP aurait été coupé à 30 k → bien moins d'exigences admin. **Le « 98 » sur-estime le recall réel de production.** Le diagnostic avait raison sur l'existence du cap, mais a involontairement mélangé une mesure non-capée (98) avec un cap de prod (30 k).

## 4. Impact chiffré réel sur Gueux (mesuré en local, sans API)

Reconstitution du texte exact (`"\n\n".join` des pages, comme `document_processor.py:61`) puis position du seuil 30 k :

| Mesure | Valeur |
|---|---|
| CCAP | 48 pages / 120 635 chars |
| Le cap 30 k tombe à… | **page 13** (≈35 % de la page 13) → pages 1-13 envoyées, **14-48 perdues** |
| Exigences CCAP (sortie non-capée) avec page | 45 |
| …page ≤ 13 (gardées en prod) | 13 |
| …**page > 13 (PERDUES en prod)** | **32 (71 %)** |

**Exigences qui seraient ratées en production** (extraits) :
- p15 — Garantie à première demande en contrepartie de l'avance (10 %)
- p17 — Facturation dématérialisée Chorus Pro
- p22 — Pénalités de retard 300 €/jour, plafond 50 % du montant HT
- p23 — Attestations d'assurance RC et décennale (délais)
- p23 — Remise DOE / plans de récolement à la réception
- p39/p40 — Assurance RC 8 M€ par sinistre

→ Ce sont des obligations **financières, assurantielles et de pénalités** — typiquement situées dans les **articles de fin** d'un CCAP, donc précisément la zone tronquée.

> ⚠️ Réserve méthodo : `source_page` est estimé par le modèle (pas de marqueur de page en entrée — cf. diagnostic). Mais la vérification du sous-ensemble verbatim a montré 10/11 excerpts sur la bonne page, et la **structure d'un CCAP** confirme que assurances/pénalités sont en fin de document. Le constat « majorité des exigences au-delà de la page 13 » est donc robuste, même avec une marge d'erreur sur le numéro exact.

Note : le même cap touche la **CCTP** (30 k) ; la CCTP lot 02 de Gueux fait 69 k → **~57 % tronqué** en production également.

## 5. Réponses aux questions de la mission

1. **Perte de 75 % en production ? → OUI (partiellement nuancé : ~75 % du *volume* du CCAP, ~71 % des *exigences* CCAP de Gueux).** Preuve : `analysis.py:81,110-111` (`ccap: 30_000`, `text[:cap]`), seuil mesuré à la page 13/48.
2. **Où exactement / quoi raté ?** `routers/analysis.py:109-116`, slice par document avant l'IA. Exigences ratées = tout ce qui suit ~la page 13 du CCAP : assurances, pénalités, garanties financières, Chorus Pro, DOE (liste §4).
3. **Pourquoi le diagnostic l'a signalé alors que 98 exigences ?** Le cap est **bien réel en prod**, mais le chiffre « 98 » a été mesuré par `scripts/compare_a_analyse.py` qui **nourrit le texte complet sans cap** (le cap vit dans `analysis.py`, pas dans l'analyzer). Ce n'est donc **pas** un faux positif sur le cap ; c'est une **sur-estimation du recall** par une mesure faite sur le chemin de test.
4. **Gravité réelle : ÉLEVÉE pour la correction fonctionnelle, mais pas une panne urgente.** C'est une **sous-extraction silencieuse** : aucune erreur, aucun log d'alerte (le slice est muet), mais un outil de conformité qui rate les clauses d'assurance/pénalités d'un CCAP expose le client à un risque réel. Ce n'est pas un crash → pas « urgence P0 minuit », mais **à corriger avant de fiabiliser le produit / lancer le RAG**.

   Contexte atténuant honnête : le cap est **intentionnel** (commentaire `analysis.py` : passes < 30 k → < 60 s → éviter le timeout WSL2). C'est un compromis latence/recall, pas une étourderie. Le RAG (chunking + retrieval au lieu de troncature) est précisément la bonne réponse structurelle.

## Conclusion
Le point #4 du diagnostic est **confirmé et même sous-estimé en impact fonctionnel** (71 % des exigences CCAP de Gueux perdues en prod), avec une **correction de forme** : le « 98 exigences » provenait du chemin de test non capé, pas de la production. **Vrai problème de prod, gravité élevée, non urgent-crash.**
