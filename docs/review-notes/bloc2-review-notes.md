# Bloc 2 — Skills #10 à #35 (Step 3 AI Analysis) — Review Notes

**Date de la review :** 2026-05-17
**Status :** Patches en attente — bloqués jusqu'à la fin de la phase audit NotebookLM
**Pourquoi en attente :** Les patches identifiés ci-dessous reposent sur des intuitions BTP. Avant de les appliquer, on doit d'abord interroger NotebookLM sur les Questions NotebookLM de chaque skill pour récupérer la vraie matière (mémoires gagnants, jurisprudence, formations, guides DAJ, normes DTU). Beaucoup de décisions (choix de modèle, granularité des sub-skills, severity enum) seront affinées avec ces vrais faits BTP en main.

## Règle d'or rappelée

Mohamed + Claude (chat) définissent UNIQUEMENT le besoin produit et l'UX.
Claude Code + NotebookLM cherchent les VRAIES pratiques métier sur web/YouTube/sources officielles.
**On n'invente pas les règles métier** (pondérations, formats, volumétries, critères).

---

## 13 problèmes identifiés sur le Bloc 2

### Problème 1 — Alignement experts métier (RÉSOLU à la review)
- Vérifié : les 10 enum du Skill #7 (post-renumérotation, ex-#8) correspondent exactement aux skills #25-#34. Pas de patch nécessaire.

### Problème 2 — Skill #16 detection-pieges-dce : `gravite` non typé
- Output actuel : `{type, gravite, description, source}`
- Patch à appliquer : remplacer `gravite` par `severity: 'critical' | 'warning' | 'info'` (aligné PRD §7.2.1 et Skill #9)
- Sévérité du patch : 🔴 cohérence cross-skills

### Problème 3 — Skills #28 à #34 (électricité, CVC, plomberie, peinture, VRD, menuiserie, étanchéité) sans Inputs/Outputs
- Constat : seules #25 (façade), #26 (ITE), #27 (gros œuvre) ont leurs I/O documentés.
- Patch à appliquer : harmoniser les 10 experts métier sur la même structure d'I/O.
- Structure proposée :
  - Inputs : Lot sélectionné (avec corps_de_metier), CCTP du lot, Profil entreprise (extraits pertinents), Section de mémoire en cours (si applicable)
  - Outputs : Analyse métier-spécifique du CCTP, Liste des DTU/normes applicables (avec citations exactes), Suggestions méthodologiques (phrases types), Pièges détectés (severity enum), Arguments différenciants pour mémoire
- Sévérité : 🔴 sans ça, Claude Code va inventer 10 interfaces différentes au moment du code.
- À valider avec NotebookLM : la structure I/O ci-dessus est-elle suffisante ? Manque-t-il un champ critique (ex. SOGED pour gros œuvre, certificats Qualifelec pour électricité) ?

### Problème 4 — Cas 'autre' (corps de métier hors 10 experts)
- Constat : si Skill #7 retourne 'autre', aucun expert ne se déclenche → mémoire technique dégradé.
- Options envisagées :
  - A. Nouvelle skill `expert-corps-de-metier-generique` qui se déclenche pour 'autre' (recherche live des DTU via NotebookLM dynamique)
  - B. Ne rien faire (le cas est rare, mémoire utilisera méthodologie générique)
  - C. Rejeter les lots 'autre' à l'analyse, demander confirmation utilisateur
- Décision : reportée à après audit NotebookLM. À ce moment, on saura combien d'AO ont ce cas en pratique (jurisprudence + retours BE) et on tranchera.

### Problème 5 — Skill #17 detection-incoherences-dce : liste d'inputs imprécise
- Inputs actuels : "Outputs structurés des skills #10–#15"
- Problème : #14 (visite obligatoire formattée) n'est pas une source d'incohérence ; #9 (incohérences lots RC↔DPGF) manque
- Patch à appliquer : remplacer par "#9, #10, #11, #12, #13, #15"
- Sévérité : 🟡 cohérence

### Problème 6 — Skill #18 liaison-coffre-fort : Haiku peut-être insuffisant
- Constat : matching sémantique critique (mauvais match = candidature rejetée). Haiku peut faire des erreurs subtiles sur synonymes, faux amis.
- Options :
  - A. Sonnet 4.6 (matière critique)
  - B. Haiku 4.5 + seuil confiance strict + fallback humain "Synorix n'est pas certain, voulez-vous valider ?"
- Décision : reportée à après audit NotebookLM. Tester sur 20-30 cas réels de matching coffre-fort issus de DCE réels pour valider.

### Problème 7 — Skill #19 enrichissement-source-document : pas besoin de LLM
- Modèle actuel : Haiku 4.5
- Constat : mapping offset → page est déterministe via PyMuPDF.
- Patch à appliquer : "Modèle IA recommandé : aucun (utilitaire Python via PyMuPDF)"
- Sévérité : 🟡 économie API

### Problème 8 — Skill #20 surlignage-exigence-complete : pas besoin de LLM
- Modèle actuel : Sonnet 4.6
- Constat : surligner une phrase = calcul géométrique de bounding boxes via `page.search_for()` PyMuPDF, pas de NLP.
- Patch à appliquer : "Modèle IA recommandé : aucun (calcul de bounding boxes via PyMuPDF + post-processing pour multi-ligne/césures)"
- Économie estimée : ~€0.05/AO sur DCE avec 50 surlignages cliqués.
- Sévérité : 🟡 économie API significative

### Problème 9 — Skill #14 detection-visite-obligatoire Analyse-side
- Constat : c'est une skill "UI" qui réutilise les outputs de #5 et les formatte. Pas une vraie skill au sens Architecture (Input/Output Pydantic + prompt LLM + appel API).
- Options :
  - A. Supprimer la skill, déplacer logique dans frontend (composant `<VisitMandatoryBanner>`) — total skills passerait à 83
  - B. Garder en clarifiant "sans LLM, juste formattage"
- Décision : reportée à après audit NotebookLM. NotebookLM nous dira si la diversité des formulations "visite obligatoire" dans les RC justifie une vraie skill avec LLM ou si du formattage suffit.

### Problème 10 — Skill #22 validation-completude-document trop générique
- Constat : DPGF et DC1 ont des règles complètement différentes. Une seule skill pour tout valider = lourd à implémenter et tester.
- Options :
  - A. Splitter en `validation-dpgf-completude`, `validation-cerfa-completude`
  - B. Garder #22 mais déléguer à sub-validators typés par catégorie (defer à NotebookLM pour les règles Cerfa 2026)
  - C. Garder telle quelle
- Décision : reportée à après audit NotebookLM. À ce moment, on aura la liste exacte des Cerfa actifs en 2026 et leurs règles de validation.

### Problème 11 — Skill #23 synthese-executive-dce : Sonnet sur-dimensionnée
- Modèle actuel : Sonnet 4.6
- Constat : agrégation déterministe de données déjà structurées. Pas de jugement, pas de génération.
- Patch à appliquer : "Modèle IA recommandé : aucun (agrégation déterministe + template de rendu)"
- Sévérité : 🟢 économie API

### Problème 12 — Skill #25 expert-facade : scope flou avec #26 expert-ite
- Constat : Mission #25 inclut "ITE" dans sa liste de techniques, mais #26 est expert-ite séparé.
- Patch à appliquer : clarifier Mission #25 → "Façade hors ITE — bardage, enduit hydraulique, enduit organique, peinture, ravalement. Le scope ITE relève de la skill #26."
- Sévérité : 🟢 clarté

### Problème 13 — Pas de mention `confidence` standardisé
- Constat : aucune skill du Bloc 2 ne mentionne le champ `confidence: float` standardisé pourtant exigé par la Global Rule #2 v2.1.
- Patch à appliquer : ajouter dans outputs de chaque skill d'extraction/détection un champ `confidence: float (0.0–1.0)` + rappel "persisté dans skill_invocations.metadata, jamais exposé UI".
- Skills concernées : #10, #11, #12, #13, #15, #16, #17, #18, #21, #22
- Sévérité : 🔴 application uniforme de la Global Rule

---

## Décisions reportées à la phase post-audit NotebookLM

Les patches suivants seront tranchés UNE FOIS l'audit NotebookLM terminé :

1. Skill #14 : supprimer ou clarifier
2. Skill #18 : Sonnet ou Haiku+seuil
3. Cas 'autre' : skill générique ou rejet
4. Skill #22 : split ou délégation interne
5. Tous les choix de modèle IA (peuvent être révisés à la baisse si les exemples NotebookLM montrent que la tâche est plus simple que prévu)

---

## Patches "purs" qui peuvent être appliqués sans NotebookLM

Les patches suivants ne dépendent PAS de la matière BTP, juste de la cohérence cross-skills. Ils peuvent être appliqués maintenant si besoin urgent, mais on attendra l'audit final :

- Problème 2 (severity enum #16)
- Problème 5 (inputs corrigés #17)
- Problème 7 (#19 pas de LLM)
- Problème 8 (#20 pas de LLM)
- Problème 11 (#23 pas de LLM)
- Problème 12 (scope #25)
- Problème 13 (confidence standardisé)

---

## Reprise

Quand on revient sur ce fichier :
1. Lire la phase audit NotebookLM (résultats par catégorie)
2. Revalider chaque problème ci-dessus avec la matière réelle
3. Construire UN prompt patch unique pour Claude Code intégrant TOUT (Bloc 2 + résultats audit)
