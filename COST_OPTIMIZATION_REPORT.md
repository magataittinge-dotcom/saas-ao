# Optimisation des coûts IA — Synorix

**Date :** 2026-04-30
**Objectif (brief) :** ramener le coût IA d'un mémoire technique de ~0.50-0.80 € à **< 0.10 €**.

---

## 1. État avant optimisation (baseline)

### 1.1 Architecture des appels Claude

Trois services consomment l'API Anthropic :

| Service | Modèle | Tokens in (estimé) | Tokens out (max) | Volumes |
|---|---|---|---|---|
| `dce_analyzer` (extraction des exigences DCE) | Sonnet 4.x | 30-100 K | 8 K | 3-8 appels/AO |
| `memoire_importer` (analyse mémoire d'archive) | Sonnet 4.x | ~30 K | ~3 K | 0-1 / org |
| `memoire_generator` (génération mémoire) | Opus 4.5 | 60-180 K | 16 K | 1-2 / AO |

### 1.2 Tarifs Anthropic (avril 2026, `claude.com/pricing`)

- **Sonnet 4.6** : 3 $/M input · 15 $/M output
- **Opus 4.7** : 15 $/M input · 75 $/M output
- **Cache read** : 0.10× le prix normal d'input
- **Cache write** : 1.25× le prix normal d'input (sur les tokens cachés à la première écriture)

### 1.3 Coût d'un mémoire avant optimisation

Hypothèse pour un mémoire moyen (lot façade, 25 références, DCE de 90 K caractères texte utile) :

- Génération mémoire (Opus, modèle erroné `claude-opus-4-5` mais tarification équivalente) :
  - Input : ~75 K tokens × 15 $/M = **1.13 $**
  - Output : ~14 K tokens × 75 $/M = **1.05 $**
  - **Total : ~2.18 $ ≈ 2.00 € HT** par mémoire

- Analyse DCE (Sonnet, 5 chunks moyens, sans cache) :
  - Input : 5 × 50 K × 3 $/M = **0.75 $**
  - Output : 5 × 5 K × 15 $/M = **0.38 $**
  - **Total : ~1.13 $ ≈ 1.05 € HT** par AO

**Total IA / AO complet (analyse + mémoire) : ~3 € HT.** 4-6× le budget visé.

> Note : le brief mentionnait 0.50-0.80 € — l'écart vient d'hypothèses de volume DCE plus modestes. Les chiffres ci-dessus reflètent un AO façade lourd type Gueux (90 K chars de CCTP). Pour des AO plus petits (40 K chars), le coût avant optimisation tombait à ~0.80 €.

---

## 2. Optimisations implémentées (commit à venir)

### 2.1 Prompt caching Anthropic — sur les deux services

Le commit met en place le mécanisme `cache_control: ephemeral` (TTL 5 min) sur les blocs **stables** :

#### `memoire_generator`
Découpage des prompts en 3 blocs :
- **Stable inter-org (cached)** : `MEMOIRE_GENERATION_SYSTEM` (~4 K tokens) + skills BTP (`memoire-technique-expert` + `scoring-offres-expert` + `redaction-gagnante-btp` ± `references-intelligentes`) + `methodologie-par-corps-de-metier` matched lot file = **~30-50 K tokens cachés**
- **Stable intra-org (cached)** : profil entreprise + 25 références = **~3-5 K tokens cachés**
- **Dynamique (uncached)** : variables, critères de jugement, exigences DCE, texte DCE, template référence = **~15-25 K tokens**

Sur le 2ᵉ mémoire généré dans la même session (cache HOT) :
- Tokens cachés × 0.10 = ~3-5 K tokens "facturés" en input
- Tokens dynamiques × 1 = ~20 K tokens facturés normalement
- **Économie : ~75-80 %** sur l'input. Output inchangé.

#### `dce_analyzer`
- **Stable (cached)** : `DCE_ANALYSIS_SYSTEM` + skills BTP référentiel
- **Dynamique (uncached)** : chunk DCE en cours d'analyse

Pour un DCE découpé en 5 chunks, le 1er appel paie le cache write (×1.25), les 4 suivants payent le cache read (×0.10). **Économie : ~70 %** sur les chunks 2..N.

### 2.2 Mise à jour des modèles

- `memoire_generator` : Opus 4.5 (deprecated alias) → **Opus 4.7** (latest, meilleure qualité par dollar)
- `dce_analyzer` : Sonnet 4 dated (`claude-sonnet-4-20250514`) → **Sonnet 4.6** (alias rolling, meilleure perf)
- `memoire_importer` : idem Sonnet 4.6

### 2.3 Logs d'usage cache

Le `_sync_call` du `memoire_generator` log désormais à chaque appel :
```
[TIMING] Memoire streaming: 142.3s, 14872 chars, stop_reason=end_turn,
tokens in=18234, cache_read=42951, cache_write=0, out=14102
```

Mohamed pourra ainsi **mesurer dans les logs serveur le ratio cache_read / cache_write / input_uncached** et confirmer le ROI.

---

## 3. Coût après optimisation (estimation)

Hypothèse : un client génère 1 mémoire, puis quelques minutes plus tard un 2ᵉ mémoire (cache HOT 5 min). Sur le 2ᵉ :

### Mémoire 2ᵉ (cache HOT)

Input :
- Tokens cachés (skills + system + company + refs) : ~50 K → 50 K × 0.1 × 15 $/M = **0.075 $**
- Tokens dynamiques : ~25 K × 15 $/M = **0.375 $**

Output : ~14 K × 75 $/M = **1.05 $**

**Total Opus mémoire 2ᵉ : ~1.50 $ ≈ 1.40 € HT**

⚠️ L'output reste ~70 % du coût Opus. Pour aller plus bas que 0.10 € il faudrait :
- Réduire `max_tokens` (16 K → 8-10 K) en demandant un mémoire plus dense
- OU passer certaines sections (préambule, partie A) à Sonnet 4.6 — beaucoup moins cher

### Analyse DCE — 5 chunks (cache HOT)

Chunk 1 (cache write) :
- Input : 50 K × 1.25 × 3 $/M = **0.19 $** (système + skills cachés)
- Plus chunk dynamique : 30 K × 3 $/M = **0.09 $**
- Output : 5 K × 15 $/M = **0.075 $**
- Total chunk 1 : **0.36 $**

Chunks 2..5 (cache read) :
- Input cached : 50 K × 0.1 × 3 $/M = **0.015 $**
- Plus chunk dynamique : 30 K × 3 $/M = **0.09 $**
- Output : 5 K × 15 $/M = **0.075 $**
- Total par chunk 2..N : **~0.18 $**

**Total analyse DCE (5 chunks) avec cache : 0.36 + 4×0.18 = 1.08 $ ≈ 1.00 € HT** vs 1.13 $ avant.
*L'économie sur le DCE est plus modeste car chaque chunk a un payload dynamique massif. Le cache aide surtout quand le payload dynamique est petit.*

### Bilan global avec ces optimisations

- AO mémoire seul (cache HOT) : **~1.40 €** (au lieu de 2.00 €) → **−30 %**
- AO complet (analyse + mémoire) : **~2.40 €** (au lieu de ~3.00 €) → **−20 %**
- AO mémoire seul (cache COLD, 1ʳᵉ génération de la journée) : **~2.30 €** (similaire au baseline)

---

## 4. Pour atteindre vraiment **< 0.10 € / mémoire** — étapes P1

L'optimisation prompt caching seule ne suffit pas. Pour atteindre la cible 0.10 € il faudra :

### 4.1 Mode incrémental (P0.15 — pas implémenté cette nuit)

Au 2ᵉ AO d'une entreprise sur un lot similaire :
- Charger le mémoire précédent comme TEMPLATE
- Demander à Claude de retourner UNIQUEMENT les **diffs/sections à adapter** au nouveau DCE
- Output réduit de 14 K → 4-5 K tokens
- **Économie output : -65 %** → coût total ~0.50 €

### 4.2 Modèle dégradé — split par section (P1)

- Préambule + partie A (présentation, démarche qualité, sécurité) : sections génériques peu spécifiques → **Sonnet 4.6**
- Partie B (équipe, références, organigramme) : Sonnet
- Partie C (méthodologie, planning, contraintes site) : **Opus 4.7** (qualité critique)

Si 60 % du contenu passe sur Sonnet à 5× moins cher :
- Output : (0.4 × 14 K × 75 $/M) + (0.6 × 14 K × 15 $/M) = **0.420 + 0.126 = 0.55 $**
- Vs full Opus : 1.05 $
- **Économie : -50 %** sur l'output → coût total ~0.70 €

### 4.3 Fragments DB (P1)

- Stocker en DB les sections génériques pré-générées (présentation entreprise, démarche qualité, sécurité, environnement) — par lot type
- L'IA ne rédige que les sections spécifiques (méthodologie d'exécution, équipe dédiée, références ciblées)
- Output divisé par 3 : 14 K → 4-5 K tokens
- **Économie : -65 %** sur l'output

### 4.4 Combinaison 4.1 + 4.2 + 4.3 = cible 0.10 €

Sur le 3ᵉ-4ᵉ mémoire d'une entreprise (cache HOT + template + sections fragments) :
- Input : ~5 K facturés (cache + minimum dynamique)
- Output : ~3 K (juste les diffs et sections critiques)
- Coût : 5 K × 15 $/M + 3 K × 75 $/M = **0.075 + 0.225 = 0.30 $**

Si on pousse le partage Opus/Sonnet jusqu'au bout (90 % Sonnet pour les sections récurrentes) :
- Coût Sonnet : 5 K × 0.1 × 3 $/M + 3 K × 0.9 × 15 $/M = **~0.05 $** ≈ **0.05 €**
- Coût Opus (10 % du contenu, sections critiques) : ~0.05 $

**Total estimé : ~0.10 € HT** ✅ — atteignable avec les 3 optimisations P1 cumulées.

---

## 5. Recommandations finales

### 5.1 À faire en P0 (terminé cette nuit)
- ✅ Prompt caching activé sur memoire_generator + dce_analyzer
- ✅ Modèles mis à jour (Opus 4.7 + Sonnet 4.6)
- ✅ Logs d'usage cache pour mesurer le ROI

### 5.2 À faire en P1 (semaine prochaine, prio)
- [ ] **Mode incrémental** — flag `MemoireTemplate.is_winning_template` dans la DB, et logique "si DCE similaire (lot, MO type) → utiliser ce template comme base, demander uniquement les diffs"
- [ ] **Split modèle Opus/Sonnet** par section — Sonnet pour sections génériques (préambule, présentation, démarche), Opus pour sections critiques (méthodologie, planning, références)
- [ ] **Fragments DB** : table `MemoireFragment` (org_id, lot_type, section, content) qui stocke les sections génériques pré-générées + interface pour les éditer

### 5.3 Décisions de produit à prendre par Mohamed
1. Accepter de générer le 1er mémoire d'une entreprise plus cher (~2 €) en valorisant l'effet "wow" — puis tarifer les suivants à coût quasi nul ?
2. Free tier : 1 DCE GRATUIT mais avec limite de qualité (Sonnet only) ? Ou Opus pour le 1er aussi (coût d'acquisition élevé mais conversion meilleure) ?
3. Plans : facturer au DCE (€19 unitaire au-delà du quota) ou rester forfaitaire ?

---

## 6. Pour aller plus loin (P2)

- **Caching côté serveur** : si Mohamed veut zero-cost après le 1er mémoire, on peut stocker les mémoires générés et faire un dedup hash → si DCE identique soumis 2× (rare en pratique), retourner le cache.
- **Fine-tuning** : irrelevant à <100 clients. Pour > 1000 clients, envisageable.
- **Anthropic batch API** : −50 % du prix sur les jobs non-urgents. Compatible avec un mode "génération nocturne" des mémoires planifiés.

---

## 7. Procédure de bench (à valider en prod)

Une fois le déploiement effectué :

1. Générer 3 mémoires sur 3 AO similaires consécutifs (cache HOT)
2. Capturer les logs serveur :
```bash
journalctl -u synorix-api --since "1 hour ago" | grep "TIMING.*Memoire streaming"
```
3. Calculer la moyenne `cache_read / (cache_read + input)` → c'est le taux de hit du cache
4. Multiplier le ratio par les tarifs pour confirmer le coût réel par mémoire

Cible : `cache_read >= 60 % du total input` sur les mémoires 2..N de la même session.
