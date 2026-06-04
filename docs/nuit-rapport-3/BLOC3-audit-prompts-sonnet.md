# BLOC 3 — Audit robustesse des prompts pour Sonnet (lecture seule)

Contexte : passage Opus→Sonnet (mémoire ~1 $ vs 6,71 $). Sonnet est plus **littéral** : il infère moins, suit les consignes au pied de la lettre, et sa densité/qualité varie davantage si le prompt laisse des zones grises. **Audit uniquement — aucun prompt modifié** (cœur, modif supervisée).

## Constat général : les prompts sont DÉJÀ solides
`prompts.py` (1087 l) contient 4 system prompts : `DCE_PASS1_SYSTEM` (admin), `DCE_PASS2_SYSTEM` (technique), `CHECKLIST_MATCHING_SYSTEM`, `MEMOIRE_GENERATION_SYSTEM`, + `REFERENCE_SELECTION_SYSTEM`. Points forts déjà en place : format **« JSON strict, commence par { »**, **10 few-shot** sur l'analyse (vault vs dce_template), règles impératives numérotées, consigne **anti-invention** + densité normative (renforcée cette semaine). → Bon socle ; les fragilités ci-dessous sont des **durcissements ciblés**, pas une refonte.

## Fragilités repérées + durcissements proposés (NON appliqués)

### F1 — Densité réglementaire du mémoire = variance résiduelle (priorité 1)
- **Fragilité** : on a mesuré (RESULTAT.md) que Sonnet cite moins de DTU/Avis Techniques qu'Opus, avec variance run-to-run (temperature non figeable). La consigne « cite systématiquement les normes du corpus » a aidé mais reste **abstraite** pour un modèle littéral.
- **Durcissement** : ajouter dans `MEMOIRE_GENERATION_SYSTEM` **1-2 few-shot exemplaires** d'une sous-section de méthodologie « 5/5 » (avec citations DTU + Avis Technique + seuils chiffrés intégrés au texte). Un exemple concret ancre Sonnet bien mieux qu'une instruction. + Imposer un **mini-quota explicite** : « pour chaque étape de mise en œuvre, au moins 1 référence normative du corpus si elle existe ».
- **Impact/risque** : fort rapprochement d'Opus / risque faible (le few-shot vient du corpus, pas d'invention). ⚠️ touche `prompts.py` → supervisé.

### F2 — `criteres_jugement` : extraction binaire (priorité 2)
- **Fragilité** : extraits **uniquement en passe 1** (`result1`, RC+CCAP) et `dce_analyzer` ne garde que `result1.get("criteres_jugement", [])`. Un Sonnet littéral retourne `[]` plus volontiers qu'Opus si la section « Jugement des offres » du RC est implicite/dispersée. (Le `=0` observé sur Gueux venait de l'**absence du RC** dans le test A/B — pas un bug prompt ; mais en prod le RC est présent et l'extraction doit être fiable.)
- **Durcissement** : dans `DCE_PASS1_SYSTEM`, **guider explicitement** : « Les critères de jugement se trouvent dans la section "Critères d'attribution / Jugement des offres" du RC ; extraire chaque critère + sa pondération exacte (%) + sous-critères. Si le RC convertit en points, convertir en %. Ne retourner [] QUE si aucune section critères n'existe. » + 1 few-shot d'un bloc critères réaliste.
- **Impact/risque** : débloque #86 RAO + pondération mémoire / risque faible.

### F3 — `source_page` « estimer si incertain » trop vague (priorité 3)
- **Fragilité** : consigne « OBLIGATOIRE, jamais null — estimer si incertain ». Un modèle littéral peut **mettre 1 par défaut** systématiquement → traçabilité PDF dégradée.
- **Durcissement** : « indiquer la page la plus probable d'après la structure du document ; ne jamais mettre 0 ni null ; si vraiment indéterminable, page du chapitre concerné ». Mineur mais améliore le surlignage.

### F4 — Tension concision ↔ exhaustivité (priorité 3)
- **Fragilité** : `DCE_PASS*` dit « Sois concis, limite source_excerpt à 100 caractères » tout en demandant des exigences exhaustives. Sonnet, littéral, peut **tronquer le source_excerpt au point de casser le surlignage** (l'excerpt doit matcher le PDF).
- **Durcissement** : préciser « source_excerpt = phrase EXACTE du document (copier-coller), max ~120 car. ; ne pas reformuler — c'est utilisé pour le surlignage ». Garantit le match.

### F5 — Format de sortie mémoire par segment (priorité 4 — déjà robuste)
- **Fragilité** : le scoping par partie (`_build_segment_instruction`, code) prime sur le schéma global du prompt système. Solide, mais si Sonnet renvoyait des clés hors-schéma, la récupération gracieuse les ignore (placeholder). Pas de régression observée (26/26 sur tous les runs Sonnet).
- **Durcissement** (optionnel) : ajouter dans la consigne de segment « N'ajoute AUCUNE clé hors de la liste ci-dessus » pour verrouiller. Risque ~nul, gain marginal.

## Priorisation (valeur Sonnet / risque)

| Prio | Durcissement | Valeur | Risque | Fichier |
|---|---|---|---|---|
| 1 | **F1** few-shot méthodologie « 5/5 » + quota citation/étape | ↑↑ densité (rapproche Opus) | Faible | `prompts.py` MEMOIRE |
| 2 | **F2** guidage extraction critères + few-shot | ↑ débloque RAO/pondération | Faible | `prompts.py` PASS1 |
| 3 | **F3/F4** source_page + source_excerpt verbatim | ↑ traçabilité/surlignage | Très faible | `prompts.py` PASS1/2 |
| 4 | **F5** verrou clés segment | marginal | ~nul | code `memoire_generator` |

## Méthode recommandée pour appliquer (quand Mohamed validera)
- Modifier `prompts.py` **section par section**, et **re-tester sur Gueux** (1 génération + 1 analyse) en comparant densité/criteres aux baselines (`docs/comparaison-memoire-AB/`). Mesurer avant/après. Garder l'anti-invention comme garde-fou (scan des références vs corpus, déjà outillé).
- Ne jamais durcir la densité sans re-vérifier le **scan anti-invention** (le risque d'un quota de citations = halluciner pour « remplir »).

## Verdict
Prompts **déjà robustes** ; le plus gros levier Sonnet est **F1** (few-shot exemplaire + quota de citations dans le mémoire) pour effacer l'écart de densité vs Opus, puis **F2** (extraction critères). Tous les durcissements sont **ciblés, faible risque, à appliquer en supervisé avec re-test A/B**. **Rien modifié cette nuit.**
