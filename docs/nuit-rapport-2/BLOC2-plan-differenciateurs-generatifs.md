# BLOC 2 — Plan de branchement des différenciateurs GÉNÉRATIFS (0 API, lecture seule)

Suite du BLOC3 nuit 1. Toutes ces skills existent (`backend/synorix/skills/`), sont typées + testées, **non câblées**. Principe coût (décision d'aujourd'hui) : **Sonnet 4.6 par défaut** (mémoire est passé Sonnet à −85 % sans perte notable), **Opus seulement si justifié**. Endpoint = router dédié en AJOUT (pattern BLOC1), jamais le cœur. Estimations Sonnet : ~3 $/M in, ~15 $/M out.

---

## Fiche #92 — critères-RSE-2026 `memoire/criteres_rse_2026.py` (Sonnet)
- **Produit** : détecte les exigences RSE du DCE + 5 catégories Loi Climat (déchets, carbone, biosourcés, insertion, mobilité), suggestions + `section_rse_markdown` + écarts. Indicateurs chiffrés **toujours `[À COMPLÉTER PAR L'ENTREPRISE]`**.
- **In** : `cctp_ccap_text`, `profil_entreprise: dict`, `phrases_rse_bibliotheque: list`. **Out** : `criteres_detectes[]`, `suggestions[]`, `section_rse_markdown`, `ecarts_step5[]`.
- **Inputs réels** : texte CCTP/CCAP (déjà extrait au pipeline), profil entreprise (MemoireConfig). **Tout est disponible.**
- **Endpoint/UI** : `POST /api/projects/{id}/synorix/rse` → panneau « RSE 2026 » dans l'étape Mémoire (enrichit la note environnementale déjà produite).
- **Coût** : ~30k in + ~2k out ≈ **0,10 $/appel** (Sonnet). **Risque : FAIBLE** (inputs prêts, sortie structurée, philosophie [À COMPLÉTER] alignée).

## Fiche #70 — synorix-score-evaluateur `verification/synorix_score_evaluateur.py` (skill=Opus → **recommandé Sonnet**)
- **Produit** : note le mémoire /100 ventilée par axe + justification (grille 0-5 type commission). Reproductible.
- **In** : `memoire_text`, `ponderations: dict` (axe→%). **Out** : `score_global`, `axes[]` (note_sur_5, pondération, justification), `sources_nbk`.
- **Inputs réels** : **sortie du moteur mémoire** (réparé/fiable depuis cette semaine) + pondérations (critères RC). Dépendance forte au mémoire (OK maintenant).
- **Endpoint/UI** : `POST /api/projects/{id}/synorix/score` → badge score + radar par axe dans l'étape Mémoire (onglet « Évaluation »).
- **Coût** : ~22k in + ~2k out ≈ **0,10 $ en Sonnet** (vs ~0,48 $ en Opus). **Reco : tester en Sonnet d'abord** (la notation est de l'analyse structurée, pas de la génération longue). **Risque : FAIBLE-MOYEN** (la skill est déclarée Opus → vérifier que Sonnet tient la grille ; A/B rapide).

## Fiche #71 — synorix-score-suggestions `verification/synorix_score_suggestions.py` (skill=Opus → **recommandé Sonnet**)
- **Produit** : transforme le score #70 en recommandations actionnables d'amélioration du mémoire.
- **In** : score/axes #70 + memoire_text. **Out** : suggestions formulées.
- **Inputs réels** : sortie de #70. **Couple naturellement avec #70.**
- **Endpoint/UI** : même onglet « Évaluation » que #70 (« Comment gagner des points »). Idéalement chaîné après #70.
- **Coût** : ~0,10 $ Sonnet. **Risque : FAIBLE-MOYEN** (dépend de #70).

## Fiche #86 — RAO-prédictif `verification/rao_predictif.py` (Sonnet)
- **Produit** : Rapport d'Analyse d'Offres prédictif — grille 0-5 par sous-critère, note pondérée, classement probable, écarts critiques (cadre R2152-6 à 8 CCP).
- **In** : `memoire_text`, `criteres_ponderes: list`, `references_entreprise: list`. **Out** : `rao` (sous_criteres[], note_globale, classement), `cadre_juridique`.
- **Inputs réels** : mémoire + **critères de jugement de l'analyse**. ⚠️ **Dépendance bloquante** : `criteres_jugement = 0` sur le DCE Gueux (cf. nuit 1) → l'extraction des critères doit être fiabilisée AVANT, sinon RAO tourne à vide.
- **Endpoint/UI** : `POST /api/projects/{id}/synorix/rao` → tableau RAO dans l'étape Analyse/Export.
- **Coût** : ~0,10 $ Sonnet. **Risque : MOYEN** (dépend de l'extraction des critères, à corriger côté `dce_analyzer` — hors périmètre nuit).

## Fiche #89 — cotraitance-groupement `chatbot/cotraitance_groupement.py` (Sonnet)
- **Produit** : aide PME à structurer un GME conjoint/solidaire (R2142-20 CCP), pédagogie des régimes, orchestration DC1/DC2 (jamais DC4).
- **In** : contexte projet/entreprise (capacités, lot). **Out** : `Formulaire` + conseils.
- **Inputs réels** : profil entreprise + exigences candidature (analyse). Disponible.
- **Endpoint/UI** : `POST /api/projects/{id}/synorix/cotraitance` → assistant dans l'étape Candidature (à côté de la checklist pièces).
- **Coût** : petits I/O ≈ **0,02 $ Sonnet**. **Risque : FAIBLE-MOYEN** (conseil, pas de dépendance critique).

## Fiche #88 — conseil-recours-éviction `export/conseil_recours_eviction.py` (Sonnet)
- **Produit** : conseille le candidat évincé sur le bon recours (référé précontractuel L551-1 / contractuel L551-13 / Tarn-et-Garonne 2014) selon le contexte temporel.
- **In** : contexte (marché signé ou non, délais, motif). **Out** : `Recours` (type, délais, démarche).
- **Inputs réels** : **saisie manuelle post-résultat** (hors pipeline de réponse).
- **Endpoint/UI** : `POST /api/projects/{id}/synorix/recours` → écran « Suite à un rejet » déclenché manuellement (hors 6 étapes).
- **Coût** : ≈ **0,02 $ Sonnet**. **Risque : FAIBLE** (isolé, inputs manuels). Cas d'usage de niche → priorité basse.

## Fiches #81-84 — Coach conversationnel `chatbot/recherche_*.py`
Ce ne sont pas des endpoints isolés mais la **spécification d'une feature « Coach »** :
- **#81** architecture chatbot (bulle + page, surfaces) · **#82** mode coaching (ton par persona) · **#83** suggestions stratégiques (choix lot/références/prix — **Opus**) · **#84** suivi résultat (relance J+30, analyse gagné/perdu).
- **Inputs réels** : état du projet (étape courante, analyse, profil) + historique conversation.
- **Endpoint/UI** : surface conversationnelle dédiée (bulle persistante + page Coach) + backend de session/chat — **chantier à part entière** (gestion d'historique, streaming, contexte projet).
- **Coût** : variable (conversationnel). **Risque : ÉLEVÉ / gros effort** (nouvelle surface UI + état conversationnel). **Priorité : après les briques ci-dessus.**

---

## Ordre de priorité recommandé

| # | Différenciateur | Modèle reco | Coût/appel | Risque | Dépendance |
|---|---|---|---|---|---|
| 1 | **#92 RSE-2026** | Sonnet | ~0,10 $ | Faible | inputs prêts |
| 2 | **#70 + #71 Synorix Score** | Sonnet (A/B vs Opus) | ~0,10 $ | Faible-Moyen | mémoire (OK) |
| 3 | **#89 cotraitance** | Sonnet | ~0,02 $ | Faible-Moyen | profil + candidature |
| 4 | **#88 recours-éviction** | Sonnet | ~0,02 $ | Faible | saisie manuelle |
| 5 | **#86 RAO-prédictif** | Sonnet | ~0,10 $ | Moyen | ⚠️ critères_jugement à fiabiliser |
| 6 | **#81-84 Coach** | Sonnet (+Opus #83) | variable | Élevé | nouvelle surface UI/chat |

**Reco** : commencer par **#92 RSE** (meilleur ratio valeur/risque, inputs prêts), puis **#70/#71 Score** (en testant Sonnet d'abord — la skill est déclarée Opus mais la notation structurée devrait tenir en Sonnet à 1/5 du coût). **#86 RAO** est conditionné par la fiabilisation de l'extraction des critères de jugement (`dce_analyzer`, hors périmètre nuit). Le **Coach (#81-84)** est un chantier dédié, à planifier après les briques unitaires. Tous se branchent via un router `synorix_generatif.py` en AJOUT, sans toucher le cœur.
