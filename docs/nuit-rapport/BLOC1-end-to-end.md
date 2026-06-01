# BLOC 1 — Test END-TO-END sur DCE Gueux (lot 02 Étanchéité)

**Date :** 2026-06-02 (nuit) · **DCE :** Restructuration école élémentaire de GUEUX (51390) — Groupe scolaire Les Tilleuls · **Maître d'ouvrage :** Commune de GUEUX · **Lot :** 02 Étanchéité / Couverture
**Mode d'exécution :** appel DIRECT des services (fallback autorisé, comme la comparaison A/B) — serveur+DB+Celery non montés cette nuit. Script jetable : `scripts/e2e_memoire_gueux.py`.

---

## Tableau étape par étape

| # | Étape | Résultat | Temps | Mesures / notes |
|---|-------|----------|-------|-----------------|
| 1 | **Analyse DCE** | ✅ OK (réutilisée) | — (0 API) | 98 exigences, traçabilité 100 % (source_document/page/excerpt). Categories : candidature 3 · offre 11 · planning 12 · technique 72. ⚠️ `criteres_jugement` = **0** (vide). Réutilise `docs/comparaison-AB/A-analyse-output.json` (run 00:17) → **0 appel API**. |
| 2 | **Checklist candidature** | ✅ OK | 0,00 s (0 API) | 3 exigences candidature → 3 items, tous `status=manquant` (vault vide = scénario Adil). Pièces détectées : RC en cours (≥ 8 M€), RC après travaux (≥ 3 M€), décennale. ⚠️ **DC1/DC2/DC4 non extraits** comme exigences candidature (voir réserves). |
| 3 | **Mémoire technique** | ⚠️ OK avec réserve **MAJEURE** | 486 s | Modèle `claude-opus-4-7`. Skills chargés (memoire-technique-expert, scoring-offres-expert, redaction-gagnante-btp = 33 525 chars) + référentiel `07-etancheite-couverture.md` + `00-transversal.md`. **`stop_reason=max_tokens` → TRONQUÉ.** 67 672 chars, 32 000 tokens out (cap atteint). |
| 4 | **Inspection qualité** | ✅ (voir section dédiée) | — | Très spécifique au DCE, sections Vague 2 présentes, **aucune donnée entreprise inventée**, 57 placeholders `[À COMPLÉTER]`. MAIS partie_c méthodologie coupée + artefacts json_repair en fin. |
| 5 | **Export DOCX** | ✅ OK | 0,49 s (0 API) | `docs/nuit-rapport/memoire-gueux.docx` — 68 250 octets, zip **valide** (testzip OK), 19 entrées, `word/document.xml` présent (308 KB). S'ouvre. ZIP dossier AO non testé (export mémoire seul ici). |

---

## 🔴 3 défauts BLOQUANTS découverts sur le maillon mémoire (jamais testé avant cette nuit)

Le moteur A produit les 98 exigences sans souci, mais la **génération de mémoire était cassée de bout en bout** avec la config actuelle. Trois problèmes empilés, découverts en cascade :

### Défaut #1 — `temperature` déprécié pour `claude-opus-4-7` (BLOQUANT en prod)
`memoire_generator.py:433` passe `temperature=0` (hardcodé). Le modèle `claude-opus-4-7` répond **HTTP 400 `temperature is deprecated for this model`** → **aucune génération possible**. En production aujourd'hui, le bouton « générer mémoire » renverrait une erreur 400.
**Fix trivial (1 ligne) :** retirer `temperature=0` du `client.messages.stream(...)`. Cœur en lecture seule cette nuit → **non appliqué**, contourné par monkeypatch dans le script de test.

### Défaut #2 — `max_tokens=16000` → mémoire systématiquement TRONQUÉ (BLOQUANT)
`memoire_generator.py:432` hardcode `max_tokens=16000`. Le mémoire attendu (préambule + 3 parties détaillées) dépasse largement :
- à **16000** tokens out → coupé en pleine partie_b ;
- à **32000** tokens out (max opus-4-7, testé via monkeypatch) → **coupé encore**, en pleine partie_c.

Le mémoire réel veut **> 32 000 tokens de sortie** dans un seul appel. C'est un problème **d'architecture**, pas qu'un paramètre : la structure complète ne tient pas en un seul appel Opus.

### Défaut #3 — le cœur LÈVE sur troncature au lieu de récupérer le partiel
`memoire_generator.py:507-509` : si les 4 clés `{preambule, partie_a, partie_b, partie_c}` ne sont pas toutes présentes → `raise ValueError("Structure JSON incomplète")`. Donc en cas de troncature (cas nominal vu ci-dessus), **rien n'est retourné** — pas même le contenu déjà généré. Côté utilisateur : échec sec après ~8 min d'attente.

> **Conséquence combinée :** en l'état du repo, la génération de mémoire **échoue à 100 %** (400 immédiat #1, ou après 8 min #2+#3). Ce test de nuit est le **premier** à le révéler.

---

## ✅ Inspection qualité du mémoire (sur le contenu récupéré par json_repair)

Malgré la troncature, le contenu produit avant coupure a été récupéré (json_repair côté script) et est de **très bonne qualité de fond**. Réponses factuelles aux questions de la mission :

| Critère | Verdict | Preuve |
|---------|---------|--------|
| **Adapté au DCE (vs générique) ?** | ✅ **Fortement adapté** | « Gueux » ×26, « Les Tilleuls » ×3, « rue du Moutier » ×5, « école élémentaire » ×5, « Commune » ×11, « étanchéité » ×64, « couverture » ×31. Cite des contraintes CCAP réelles : pénalité 300 €/j retard (plafond 50 %), réunion hebdo obligatoire (200 €/absence), **3 000 € HT/arbre blessé**, seuils assurance 8 M€/3 M€, conformité ERP enseignement. |
| **Sections Vague 2 présentes ?** | ✅ **Toutes présentes** | PPSPS ×12 + **R.4532** ×1 (§5 « SÉCURITÉ — PPSPS ADAPTÉ »), **SOGED** ×4 + REP PMCB ×2 (§6 « TRAITEMENT DÉCHETS — SOGED DÉTAILLÉ »), **ISO 9001** ×4 + KPI (§3 « PAQ »), méthodologie **SPAC** ×5, **DTU 43** ×14 (43.1 ×7, 43.3 ×13, 43.5), pare-vapeur ×8, relevés d'acrotère, partenariat SOPREMA. |
| **Placeholders bien placés, sans invention ?** | ✅ **Excellent** | 57 × `[À COMPLÉTER]`. **CA des 3 exercices = tableau 100 % `[À COMPLÉTER]`**, effectifs `[À COMPLÉTER]`, historique `[À COMPLÉTER]`. **Aucune donnée entreprise inventée.** Les montants € présents viennent TOUS du CCAP (pénalités, seuils d'assurance), pas de chiffres entreprise fabriqués. SIRET/nom = ceux passés en entrée (org de test), pas inventés. |
| **Structure** | ✅ Préambule + 5 engagements + Partie A (implantation, historique, qualitatif, activités, organigramme, rôles, moyens info, véhicules…) + Partie B (PAQ, planning/phasage, PPSPS, SOGED, environnement) + Partie C (méthodologie exécution **tronquée**). | ~1184 lignes markdown. |
| **Longueur / lisibilité** | ~30 pages estimées. Lisible, ton professionnel, structuré en titres. | 63 954 chars markdown. |
| **Défaut qualité** | ⚠️ **Partie_c (méthodo détaillée) coupée** + artefacts json_repair en fin (titres dégradés `### minimum**`, `### 6)`, fragments isolés) là où le JSON a été tronqué puis réparé. | Visible dans les ~40 dernières lignes. |

### Verdict qualité honnête
Le **fond** est de qualité professionnelle, présentable à un acheteur public : adaptation profonde au DCE, contenu réglementaire/technique juste (DTU étanchéité, PPSPS, SOGED), zéro invention de données entreprise, placeholders propres. **MAIS** en l'état il **N'EST PAS livrable** à cause de la **troncature** (partie_c méthodologie incomplète + queue dégradée par json_repair). Une fois les défauts #1/#2/#3 corrigés (génération multi-appels ou section par section), ce mémoire serait **présentable**.

---

## Mesures / coût API

| Run | Config | stop_reason | out tokens | Temps | Compteur |
|-----|--------|-------------|-----------|-------|----------|
| 1 (system py) | — | échec init client (httpx/proxies) | 0 | — | 0 (non facturé) |
| 2 (venv) | temp non patché | 400 temperature | 0 | — | 0 (non facturé) |
| 3 (venv) | temp strippé, max=16000 | max_tokens | 16 000 | 249 s | **mémoire 1/3** |
| 4 (venv) | + max=32000 | max_tokens (raise core) | ~32 000 | ~? | **mémoire 2/3** |
| 5 (venv) | + capture brut | max_tokens (repair OK) | 32 000 | 486 s | **mémoire 3/3** |

- **Analyse : 0/3** (réutilisée, 0 API). **Mémoire : 3/3 (cap ATTEINT — plus aucun appel mémoire cette nuit).**
- Input ~34 k tokens (cache_write ~34,8 k, cache_read 0 car TTL 5 min dépassé entre runs), output 16–32 k.
- **Coût mémoire estimé ≈ 8 $** (3 runs Opus 4.7 : ~$15/M in, ~$75/M out). Exports = 0 $.

---

## VERDICT GLOBAL END-TO-END

> **🟠 OUI AVEC RÉSERVES MAJEURES.**
>
> Le pipeline tourne **techniquement** de bout en bout (analyse → checklist → mémoire → export DOCX valide), et le **fond** du mémoire est excellent (spécifique, réglementaire, sans invention). **MAIS** la génération de mémoire est **cassée en production** par 3 défauts empilés (temperature déprécié → 400 ; max_tokens trop bas → troncature ; raise sur partiel). **Aucun mémoire complet n'est livrable aujourd'hui sans correctif.** C'est le maillon n°1 à réparer.

### Réserves secondaires (non bloquantes, à noter)
- `criteres_jugement` = **0** dans l'analyse → le mémoire ne peut pas pondérer ses arguments sur les critères de jugement (RAS sur ce DCE, mais à vérifier : extraction des critères absente ?).
- **DC1/DC2/DC4 non remontés** comme exigences candidature (seules les attestations d'assurance le sont) → la checklist candidature est incomplète vs un vrai dossier (à confirmer côté `dce_analyzer` / `checklist`).
- Environnement : le `python3` système a **httpx 0.28.1** (incompatible anthropic 0.31, erreur `proxies`) ; seul `backend/venv` (httpx 0.27.0 pin) fonctionne. À garder en tête pour le déploiement.

### Recommandation prioritaire pour Mohamed
1. **Réparer la génération mémoire** (défauts #1+#2+#3) — c'est LE blocage produit. Piste : retirer `temperature`, et générer le mémoire **partie par partie** (1 appel Opus par partie, max_tokens 16–20 k chacun) puis assembler → évite la troncature ET réduit le risque de raise.
2. Re-tester end-to-end après correctif (budget : 1 génération).

**Fichiers produits :** `memoire-gueux-genere.md` (rendu lisible), `memoire-gueux-genere.json`, `memoire-gueux-RAW.txt` (brut streamé), `memoire-gueux-CAPTURE.json` (stop_reason/usage), `memoire-gueux.docx`, `BLOC1-checklist.json`, `BLOC1-meta.json`.
