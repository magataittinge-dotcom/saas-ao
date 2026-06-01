# Phase 4 — memoire (28 skills #36-#63) — Progression

**Démarré :** 2026-06-01 (contexte neuf dédié)
**Pattern de référence :** `expert_ite` (#26) — 3 fichiers + raw extract + __init__ + pytest
**Notebooks principaux :** N3 (Mémoires gagnants, 43615791) + N4 (DTU, 777badb4) + N7 (Scoring, 8ff1cdc4)
**Auth NotebookLM :** OK (Pro, token_fetch true)

---

## Journal

### Group 1 — Récupération données (#36-#39) ✅ — 8 tests verts
- [OK] #36 recuperation-profil-entreprise (Haiku, N3) — 7 rubriques canoniques + ordre, marqueur `[À COMPLÉTER PAR L'ENTREPRISE]`, zéro invention. memoire.
- [OK] #37 selection-references-pertinentes (Sonnet, N3) — volumétrie **3-5 strict**, 5 critères "miroir", scoring 0-100, classement décroissant. memoire.
- [OK] #38 recuperation-bibliotheque-memoire (Haiku, N3) — double axe section/métier, granularité paragraphe-thématique, exclusion métier incompatible. memoire.
- [OK] #39 extraction-memoire-importe (Sonnet, N3) — **catégorie sidebar** (registry), parsing sans TDM, tag section+métier, 5+ sections, extraits verbatim. → placé dans `skills/sidebar/`.

### Group 2 — Rédacteurs long-form (#40-#44) ✅ — 10 tests verts
- [OK] #40 redacteur-preambule (**Opus**, N3) — structure 4 mouvements (effet miroir, visite site, solution chiffrée, transition), anti-plaqué corporate.
- [OK] #41 redacteur-presentation-entreprise (**Opus**, N3) — PARTIE A, sous-sections = rubriques canoniques, anti-autobiographie, zéro invention.
- [OK] #42 redacteur-equipe-dediee (Sonnet, N3) — CV synthétiques factuels, engagement FERME (CE 21/03/2018 anti-affectation conditionnelle).
- [OK] #43 redacteur-references-chantiers (Sonnet, N3) — tableau 7 colonnes (format Cariso/SERI), photos avant/après, volumétrie 3-5.
- [OK] #44 redacteur-presentation-prestation (**Opus**, N3) — PARTIE B, reformulation (anti copier-coller CCTP), tableau Contraintes=Solutions, aléas.

---

### Group 3 — Méthodologie + sections (#45-#49) ✅ — 13 tests verts
- [OK] #45 redacteur-methodologie (**Opus**, N3+N4) — PARTIE C, phases chronologiques, **méthode SPAC** (Situation→Problème→Action→Conclusion/Bénéfice), normes DTU verbatim, autocontrôles, nourri par expert métier #25-#34.
- [OK] #46 redacteur-securite-ppsps (Sonnet, N3) — section sécurité toujours + ébauche PPSPS si option ; co-activité/VIC/coordonnateur SPS. Réf. Code du travail R.4532 marquée [À COMPLÉTER] (hors corpus N3).
- [OK] #47 redacteur-environnement-soged (Sonnet, N3) — tri **5 flux** (bois/métaux/plastiques/inertes/plâtre), SOGED si option ; **REP PMCB marquée hors corpus, à vérifier**.
- [OK] #48 redacteur-qualite-paq (Sonnet, N3) — points d'arrêt + autocontrôles explicites, PAQ/SOPAQ si option (respect structure RC).
- [OK] #49 redacteur-planning-gantt (Sonnet, N3) — **cohérence stricte CCAP (piège éliminatoire)**, marges intempéries, annotations RC, structure Gantt.

---

## Compteurs
- OK : 14 (Group 1 = 4, Group 2 = 5, Group 3 = 5)
- Incomplètes : 0
- Restantes : 14 (#50-#63)

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- #39 confirmé en catégorie `sidebar` conformément au registry (et non `memoire`).
- Note #41 : N3 recommande 2-3 pages présentation entreprise ; registry vise 5-7 pages. Prompt = densité utile prioritaire. À arbitrer.
- **#46 sécurité/PPSPS** : N3 ne fournit PAS les articles exacts du Code du travail ni les seuils jours-hommes (registry indique R.4532). → enrichir un notebook (N1 réglementaire ?) avec R.4532, ou marquer définitivement.
- **#47 environnement/SOGED** : N3 ne couvre PAS la REP PMCB (signalé par NotebookLM). Contenu REP PMCB (Valobat, Ecominéro, reprise gratuite) = connaissances générales marquées à vérifier. → ajouter un corpus REP PMCB / ADEME.
- **#48 qualité** : N3 ne dresse pas de liste standardisée de KPI chiffrés (extrapolés des bonnes pratiques). À confirmer.

## Modèles utilisés (suivi coût)
- Haiku : #36, #38
- Sonnet : #37, #39, #42, #43, #46, #47, #48, #49
- Opus : #40, #41, #44, #45

## REPRENDRE À
Group 4 / memoire / #50 generateur-organigramme (Sonnet)
