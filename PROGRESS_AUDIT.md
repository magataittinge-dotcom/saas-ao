# Audit du système de progression — Synorix

**Date :** 2026-05-04
**Scope :** lecture seule, aucune modification de code.
**Méthodologie :** lecture exhaustive du backend (routers, `pipeline_tracker.py`,
`lot_detector.py`, `dce_analyzer.py`, `memoire_generator.py`) et du frontend
(`StepUpload`, `StepLotSelection`, `StepAnalysis`, `StepMemoire`,
`LoadingProgress`, `PipelineProgress`).

---

## Verdict en 1 phrase

Aujourd'hui, **2 étapes sur 4** ont une vraie progression (Upload + Détection des lots), **2 étapes sur 4 affichent un faux % simulé par minuteur** (Analyse IA + Génération mémoire). Le visuel est correct mais souffre de plusieurs hacks (animation "crawl" 0.3 %/200 ms, plafond à 95 %, fallback à 15 % fixe, endpoint manquant).

---

## 1. Upload DCE

### Backend

| Phase | Mécanisme | Vraie progression ? |
|---|---|---|
| 1 — Transfert HTTP du fichier | XHR upload event sur `POST /api/projects/{id}/documents` | ✅ vrai (octets reçus / octets totaux) |
| 2 — Extraction du ZIP | `processing_status='extracting_zip'` mais **pas de %** par fichier interne | ❌ pas de granularité |
| 3 — Indexation PDF (PyMuPDF + ThreadPoolExecutor) | Tracker thread d'arrière-plan, écrit `processing_progress = (extracted/total)*100` toutes les ~2 s | ✅ vrai et précis |
| 4 — Tagging + insert BDD | Dans le même flux que phase 3 (par doc) | ✅ inclus dans le compteur |

**Endpoint exposé :**
- `GET /api/projects/{id}/processing-status` (polling 2 s côté front)
- `GET /api/projects/{id}/extraction-status` (count brut total/extracted)

**Fichiers :**
- `backend/routers/projects.py:489-590` — endpoint upload + écritures DB
- `backend/routers/projects.py:868-920` — `_extract_all_parallel` thread tracker
- `backend/routers/projects.py:1276-1316` — endpoint `/processing-status`
- `backend/models/project.py:56-58` — colonnes `processing_status / processing_progress / processing_detail`

### Frontend

- **Composant :** `LoadingProgress.tsx` — cercle SVG 160 px, anneau cyan, glow, pulse-ring, confettis à 100 %.
- **Style :** **propre**. SVG custom, transitions stroke-dashoffset, design cohérent. Pas honteux.
- **Mécanisme côté front :** axios `onUploadProgress` pour la phase 1 (mappe le % réel sur `0-30 %` du compteur global), puis polling 2 s sur `/processing-status` pour la phase 3 (mappe `0-100 %` serveur sur `30-95 %` du compteur global).
- **Fichiers :**
  - `frontend/src/routes/project/StepUpload.tsx:131-199` — orchestration des phases
  - `frontend/src/services/upload.ts:29-42` — wiring axios onUploadProgress
  - `frontend/src/components/common/LoadingProgress.tsx`

### Verdict

- ✅ **Globalement vrai temps réel**. Phase 1 réelle au byte près, phase 3 réelle au document près.
- ⚠️ **Un trou de 30→33 % pendant l'extraction du ZIP** : le frontend lance un timer "crawl" `prev + 0.15` toutes les 200 ms (ligne 142-144 StepUpload) en attendant que le backend bascule de `extracting_zip` à `extracting_text`. Ce n'est pas un faux compteur catastrophique parce que la phase de scan ZIP est courte, mais c'est un placeholder sans donnée réelle.
- **Problèmes UX :** aucun majeur. La transition phase 1 → phase 3 saute un peu (30 % puis bonds vers `30 + (extracted/total)*65`).

---

## 2. Détection des lots

### Backend

- Détection lancée en thread d'arrière-plan via `_run_lot_detection_background` (`projects.py:1400`).
- Le thread passe un callback `on_progress(pct, detail)` à `lot_detector.detect_all_lots`.
- Les % émis sont **hardcodés par étape** :
  - 5 % : "Scan des noms de fichiers..."
  - 10 % : "Analyse du règlement de consultation..."
  - 20 % : "Analyse des DPGF..."
  - 25 % : "Scan du contenu des documents..."
  - 25 → 95 % : interpolé en **vrai** sur le scan PDF (`pct = 25 + ((idx+1)/total_pdfs) * 70`)
  - 95 % : "Consolidation des lots..."
- Chaque `_report(...)` écrit `processing_progress`/`processing_detail` en BDD via le callback du router.

**Endpoint exposé :**
- `GET /api/projects/{id}/processing-status` (même que upload)
- `GET /api/projects/{id}/lots` (renvoie `status: detecting_lots, progress, detail` ou les lots si terminé)

**Fichiers :**
- `backend/services/lot_detector.py:660-775` — `detect_all_lots` avec callback `_report`
- `backend/routers/projects.py:1341-1450` — endpoint `/lots` + thread

### Frontend

- **Composant :** `LoadingProgress.tsx` (le même SVG cyan).
- **Mécanisme :** double timer (cf `StepLotSelection.tsx:296-310`) :
  - `startDetectCrawl()` — interpolation locale `+0.3 %` toutes les 200 ms, plafonnée à 20 %, en attendant le 1ᵉʳ vrai chiffre.
  - `startDetectPoll()` — polling 2 s sur `/processing-status` qui prend le relais dès qu'une valeur ≥ 20 % arrive.
- **Fichiers :**
  - `frontend/src/routes/project/StepLotSelection.tsx:267-360`

### Verdict

- ✅ **Vrai temps réel sur la phase scan PDF (25-95 %)** — c'est la phase qui prend du temps.
- ⚠️ **Phases 0-25 % en sauts hardcodés** (5/10/20/25). C'est ok parce que ces étapes sont quasi instantanées.
- ⚠️ **Crawl 0.3 %/200 ms** avant l'arrivée du 1ᵉʳ poll : 100 % décoratif. Mineur.
- **Problèmes UX :** le compteur peut "sauter" de 5 à 10 puis 20 puis 25 puis monter en continu, ce qui peut se voir comme une vibration sur les petits DCE (peu de PDF à scanner).

---

## 3. Analyse IA en 2 passes

### Backend

- Suivi via `pipeline_tracker.py` (in-memory dict thread-safe).
- Le router `analysis.py:159-186` appelle `pipeline_tracker.start_step("analyzing_pass1")` puis `complete_step("analyzing_pass1")` autour de chaque appel Claude. **Aucun callback intermédiaire** pendant les passes.
- Le streaming Claude est consommé pour des raisons réseau (`for text in stream.text_stream: collected += text`), mais **les tokens ne sont jamais propagés** vers la BDD ou un canal vers le client.
- `pipeline_tracker.get_status` (lignes 136-214) calcule la progression dans un step `in_progress` ainsi :

```python
elapsed = now - s.started_at
ratio = min(elapsed / max(s.estimated_s, 1), 0.95)
progress = s.pct_start + int((s.pct_end - s.pct_start) * ratio)
```

→ **% interpolé sur le temps écoulé / temps estimé**, plafonné à 95 % du step. Estimés codés en dur :
- `analyzing_pass1` : 50 s (range 35-60 %)
- `analyzing_pass2` : 50 s (range 60-85 %)

**Endpoint exposé :** `GET /api/projects/{id}/processing-status` (même que les autres).

**Fichiers :**
- `backend/services/pipeline_tracker.py` (intégralement)
- `backend/routers/analysis.py:159-269` — orchestration tracker
- `backend/services/ai/dce_analyzer.py:253-308` — boucle streaming sans hook progress

### Frontend

- **Composant principal :** **aucun** pour la phase IA elle-même côté StepAnalysis. La page affiche seulement `LoadingProgress` avec un % qui vient d'une 2ᵉ source (cf bug ci-dessous).
- **Bug détecté :** `StepAnalysis.tsx:165-189` poll `/api/projects/:id/analysis-progress` — **endpoint qui N'EXISTE PAS** côté backend (vérifié au grep). La requête échoue silencieusement (try/catch retourne null), et le code a un fallback :

```ts
const analysisPercent = analysisProgress
  ? analysisProgress.total_docs > 0
    ? (analysisProgress.analyzed_docs / analysisProgress.total_docs) * 100
    : 10
  : 15
```

→ **15 % fixe affiché pendant TOUTE la durée de l'analyse IA quand `items.length === 0`**. Pas un mouvement.

- **Fichiers :**
  - `frontend/src/routes/project/StepAnalysis.tsx:165-244`

### Verdict

- ❌ **Faux pourcentage**. Le `pipeline_tracker` interpole sur le temps estimé. La vraie progression Claude (tokens reçus) n'est nulle part exposée.
- ❌ **Pire encore** : sur StepAnalysis, le composant n'utilise même pas le `pipeline_tracker` — il poll un endpoint mort et retombe sur **15 % fixe**.
- **Problèmes UX :**
  - Le compteur monte à vitesse constante (estimé) puis bloque à 95 % le temps que la passe se termine vraiment.
  - Sur une analyse rapide (30 s) le compteur arrive à 70-80 % et "saute" brutalement à 100 %.
  - Sur une analyse longue (90 s) le compteur stagne à 95 % pendant 30+ s.
  - Sur StepAnalysis specifically: 15 % gelé toute la durée → impression que rien n'avance.

---

## 4. Génération mémoire technique

### Backend

- Identique à l'analyse IA : `pipeline_tracker` avec 3 steps (`preparing` 3 s, `generating` 120 s, `finalizing` 5 s).
- `memoire.py:94-119` appelle `start_step('generating')` avant l'appel Opus, `complete_step('generating')` après.
- `memoire_generator.py:357-440` consomme le stream Claude (`for text in stream.text_stream: collected += text`) pour garder le TCP vivant. **Le contenu n'est ni envoyé section par section, ni poussé via un canal au front**.
- Mémoire produit en un seul appel JSON. Pas de génération section par section.

**Endpoint exposé :** `GET /api/projects/{id}/processing-status`.

**Fichiers :**
- `backend/services/pipeline_tracker.py:26-30` — définition `MEMOIRE_STEPS`
- `backend/routers/memoire.py:94-119`
- `backend/services/ai/memoire_generator.py:357-440`

### Frontend

- **Composant :** `PipelineProgress.tsx` — fullscreen modal `z-[9999]`, fond `rgba(6,9,15,0.92)`, cercle SVG 200 px, liste des étapes avec icônes (check / spinner / dot), durées par étape, bouton Annuler.
- **Mécanisme :** polling 2 s sur `/processing-status`. Le `displayProgress` est lerpé vers `targetProgressRef.current` via requestAnimationFrame (`prev + (target-prev) * 0.12`) → animation lisse même si le serveur saute.
- **Style :** **plus pro que LoadingProgress**. Affiche les étapes sous le cercle, le temps restant estimé, la durée de chaque step terminé.
- **Fichiers :**
  - `frontend/src/components/project/PipelineProgress.tsx`

### Verdict

- ❌ **Faux pourcentage** : interpolé sur 120 s d'estimation. Si la génération prend 60 s, le compteur arrive à 50 % et saute à 100 %. Si elle prend 200 s, ça plafonne à 95 % ~ 80 s.
- ✅ **Visuel le mieux abouti des 4 étapes** (modal portail, lerp animation, liste d'étapes, durées affichées, bouton annuler).
- **Problèmes UX :** plateau à 95 % très visible sur les générations longues. Dépend du temps Anthropic du jour, hors de notre contrôle. Pas de visibilité sur "combien de tokens reçus / 14 K attendus".

---

## Synthèse globale

| Étape | Vrai % ? | Visuel pro ? | Notes |
|---|---|---|---|
| 1 — Upload DCE | ✅ majoritairement (octets transfert + docs extraits) | ✅ propre (`LoadingProgress` SVG cyan + confettis) | Petit trou pendant extraction ZIP |
| 2 — Détection lots | ✅ pour la phase scan PDF (25→95 %) | ✅ même `LoadingProgress` | Sauts hardcodés 5/10/20/25 sur les premières étapes |
| 3 — Analyse IA | ❌ simulé temps + bug 15 % fixe sur StepAnalysis | ⚠️ `LoadingProgress` mais isolé du tracker | Endpoint `/analysis-progress` manquant, plateau à 95 % |
| 4 — Génération mémoire | ❌ simulé temps | ✅ `PipelineProgress` (le mieux fini) | Plateau à 95 % sur les longues générations |

---

## Bugs détectés pendant l'audit

1. **`/api/projects/:id/analysis-progress` n'existe pas** côté backend mais est polled toutes les 2 s par `StepAnalysis.tsx:175`. Conséquence : 15 % fixe affiché pendant toute la durée d'analyse. À fixer (soit créer l'endpoint, soit utiliser `processing-status` comme les autres steps).
2. **Confusion `LoadingProgress` vs `PipelineProgress`.** Deux composants différents pour le même besoin :
   - `LoadingProgress` (cercle 160 px) : utilisé par Upload, LotSelection, Analysis.
   - `PipelineProgress` (modal fullscreen 200 px + steps) : utilisé par Mémoire.
   Pas un bug fonctionnel, mais UX incohérente.
3. **Estimés `pipeline_tracker` non recalibrés.** Les `estimated_s` (50 s pour pass1, 50 s pour pass2, 120 s pour mémoire) sont des valeurs "magiques". Une fois en production avec du caching prompt + Opus 4.7 + Sonnet 4.6, les vraies durées peuvent être 2× plus rapides ou plus lentes. Aucun apprentissage automatique.
4. **`processing_status` vs `pipeline_tracker`** se chevauchent. Le tracker en mémoire est l'autorité pour analyse + mémoire, mais les colonnes BDD `processing_status`/`processing_progress` continuent d'exister pour upload + détection lots. L'endpoint `/processing-status` consulte d'abord le tracker, puis la BDD si vide. Maintainable mais source de confusion.

---

## Recommandations techniques

### Option A — Polling enrichi (effort minimum, impact moyen)

**Principe :** garder le polling actuel mais publier de VRAIS signaux pendant les phases IA.

#### A.1 — Estimation de tokens reçus (fonctionne avec polling 2 s)

Modifier `dce_analyzer._sync_call` et `memoire_generator._sync_call` :

```python
chars = 0
chars_estimate = 14000  # max_tokens * 4 chars/token environ
with self.client.messages.stream(...) as stream:
    for text in stream.text_stream:
        collected += text
        chars += len(text)
        # publier chars / chars_estimate dans le tracker
        if pipeline_tracker:
            pipeline_tracker.update_step_progress(project_id, chars/chars_estimate)
```

Puis dans `pipeline_tracker.get_status`, si un `internal_progress` existe pour le step in_progress, l'utiliser au lieu de l'interpolation temporelle.

- **Pour :** vrai % basé sur le travail réel (tokens reçus).
- **Effort :** ~2 h (3 fichiers à toucher : `pipeline_tracker.py`, `dce_analyzer.py`, `memoire_generator.py`).
- **Risque :** très faible — on ajoute un signal, on n'enlève rien.

#### A.2 — Fix endpoint `/analysis-progress` manquant

Soit créer l'endpoint, soit migrer `StepAnalysis.tsx` vers `/processing-status` comme les autres.

- **Effort :** 30 min.
- **Risque :** nul.

**Total Option A :** ~2-3 h, lève les 2 bugs critiques + donne un vrai % sur l'IA. Pas de changement d'archi.

---

### Option B — Server-Sent Events (effort moyen, impact fort)

**Principe :** ouvrir un endpoint `GET /api/projects/{id}/progress-stream` (FastAPI `StreamingResponse` avec `media_type="text/event-stream"`) qui pousse les events au lieu d'être polled.

Côté frontend : `new EventSource(...)` à la place du polling 2 s.

- **Pour :** vrai temps réel, granularité aussi fine que voulu, charge serveur moindre (pas de 0.5 req/s par projet en cours).
- **Contre :** ne fonctionne qu'en HTTP/1.1 sans buffering nginx (à configurer côté reverse proxy `proxy_buffering off`). FastAPI gère bien — déjà dans `DEPLOYMENT.md` § nginx.
- **Effort :** ~4-6 h (nouvel endpoint, tracker pub/sub, refactor des 3 composants front pour utiliser EventSource avec fallback polling si la connexion casse).
- **Risque :** WSL2 a parfois des soucis de timeout sur les longs streams. À tester. Mais comme on a déjà du streaming Anthropic côté backend qui marche, ce n'est pas un blocker.

**Recommandation :** prêt à utiliser sur Hostinger nginx (cf `DEPLOYMENT.md` qui déjà désactive le buffering pour le streaming Anthropic).

---

### Option C — WebSocket (effort élevé, sur-dimensionné)

- Bi-directionnel, persistance de connexion, possibilité d'envoyer "annuler" au backend.
- Nécessite un broker (Redis pubsub) si plusieurs workers uvicorn.
- **Effort :** ~12-16 h pour faire ça proprement.
- **Risque :** complexité de gestion (reconnexion, cleanup à la déconnexion, scale).

**Pour Synorix aujourd'hui :** sur-dimensionné. À garder en réserve si on veut la fonction "annuler une génération en cours".

---

## Recommandation pour Synorix

| Étape | Solution | Effort |
|---|---|---|
| 1 — Upload | **Garder l'existant** (déjà bon) | 0 h |
| 2 — Détection lots | **Garder** + lisser les sauts hardcodés (5→10→20→25 → continu) | 1 h |
| 3 — Analyse IA | **Option A.2 (fix bug) + Option A.1 (tokens)** | 2-3 h |
| 4 — Mémoire | **Option A.1 (tokens)** | déjà inclus dans 2-3 h |

**Total recommandé : ~3-4 h pour passer de "2/4 vrai" à "4/4 vrai".**

Si Mohamed veut plus tard une vraie expérience "ChatGPT" (tokens qui apparaissent au fur et à mesure dans la zone d'édition mémoire), passer à **Option B (SSE)** dans un 2ᵉ temps.

---

## Bibliothèque visuelle pour le %

### Aujourd'hui

- Aucune lib de progress installée.
- `LoadingProgress.tsx` et `PipelineProgress.tsx` sont des composants custom utilisant SVG natif + `stroke-dashoffset` + `lucide-react` pour les icônes.
- Les anneaux ont la bonne tête : couleurs cyan du design system, glow filter, pulse-ring, lerp sur le compteur (PipelineProgress).

### Recommandations pour upgrader le visuel

| Lib | Avantages | Inconvénients | Verdict pour Synorix |
|---|---|---|---|
| `react-circular-progressbar` | Lib dédiée, simple, props standard | Style très "neutre", customisation limitée | ❌ ne va pas matcher le design system |
| `framer-motion` + SVG custom | Contrôle total, animations spring, easings avancés | +50 KB gz, à apprendre | ✅ si on veut vraiment polish (plus tard) |
| `recharts` `RadialBarChart` | Si on veut des dashboards plus tard | Pas une vraie lib de progress, +60 KB gz | ❌ overkill |
| **HTML/CSS pur + SVG `stroke-dashoffset` (existant)** | 0 dépendance, contrôle total, zone parfaitement intégrée au design | Tout fait main | ✅ **continue avec ça** |

**Verdict :** **garder le SVG custom**. Le visuel n'est pas le problème — il est déjà au niveau d'un produit pro. Ce qui manque, c'est l'honnêteté du % derrière. Investir le temps sur l'Option A (vrai temps réel) plutôt que sur une lib visuelle.

---

## Annexe — fichiers cités

| Fichier | Rôle |
|---|---|
| `backend/services/pipeline_tracker.py` | Tracker en mémoire pour analyse + mémoire (interpolation temporelle, source du faux %) |
| `backend/services/lot_detector.py` | Détection lots avec callback `_report` (vrai % par PDF scanné) |
| `backend/services/ai/dce_analyzer.py` | Streaming Claude consommé en local, **rien n'est propagé** |
| `backend/services/ai/memoire_generator.py` | Idem |
| `backend/routers/projects.py` | Endpoints `/processing-status`, `/lots`, `/extraction-status`, upload, threads tracker |
| `backend/routers/analysis.py` | Orchestration `pipeline_tracker.start_step / complete_step` (boundaries seulement) |
| `backend/routers/memoire.py` | Idem mémoire |
| `backend/models/project.py` | Colonnes BDD `processing_status`, `processing_progress`, `processing_detail` |
| `frontend/src/components/common/LoadingProgress.tsx` | Cercle SVG cyan utilisé Upload + Lots + Analyse |
| `frontend/src/components/project/PipelineProgress.tsx` | Modal fullscreen utilisée Mémoire |
| `frontend/src/routes/project/StepUpload.tsx` | Phase 1 (upload axios) + phase 3 (polling /processing-status) |
| `frontend/src/routes/project/StepLotSelection.tsx` | Polling /processing-status + crawl 0.3 % |
| `frontend/src/routes/project/StepAnalysis.tsx` | **Endpoint /analysis-progress manquant → 15 % fixe** |
| `frontend/src/routes/project/StepMemoire.tsx` | Mute `PipelineProgress` (modal) |
| `frontend/src/services/upload.ts` | Hook `onUploadProgress` axios |
