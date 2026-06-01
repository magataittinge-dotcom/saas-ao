# Système A (actuel, en prod) — sortie analyse DCE

**Date :** 2026-06-01
**Système :** `services/ai/dce_analyzer.DCEAnalyzer.extract_full_analysis_multi_pass`
**Modèle :** `claude-sonnet-4-6` (streaming), enrichi par `.claude/skills/` markdown
**Skills markdown chargés :** `analyse-dce-expert`, `reglementation-marches-publics`, `pieges-dce-detecteur`, `normes-dtu-btp[Couverture]` — 32 200 chars
**Entrée (identique à B) :** CCAP (120 635 chars / 48 p, passe 1 admin) + CCTP lot 02 Étanchéité-couverture (69 437 chars / 25 p, passe 2 technique)
**Sortie brute complète :** `A-analyse-output.json`

---

## Résultat chiffré

- **77 exigences** extraites (`stop_reason=end_turn`, **non tronqué**).
  - Passe 1 (CCAP) : **28** · Passe 2 (CCTP) : **49**
- Catégories : `technique` 51 · `planning` 16 · `offre` 7 · `candidature` 3
- **Traçabilité : 77/77 avec `source_page` ET `source_excerpt`** (extrait verbatim du document d'origine).
- `criteres_jugement` : **0** (cohérent : pas de RC dans le dossier — les critères de jugement vivent dans le RC).
- Temps : **204,7 s** (2 appels streaming : 79,9 s + 124,8 s).
- Réponses : 16 189 chars (passe 1) + 22 816 chars (passe 2).

## Schéma d'une exigence (clés)
`exigence` · `source_document` · `source_page` · `source_excerpt` · `category` · `priority` · `source_kind` · `expected_template_type`

## 5 exemples avec source verbatim
1. « Fournir l'attestation d'assurance décennale en cours de validité à la date d'ouverture du chantier » — *candidature, src=CCAP*
2. « Compléter, dater et signer l'acte d'engagement (AE) joint au DCE » — *offre, src=CCAP*
3. « Participer à toutes les réunions de chantier (**pénalité de 300 € HT par absence**) » — *src=CCAP p.23, excerpt « en cas d'absence aux réunions de chantier… »*
4. « Transmettre les demandes de paiement par voie électronique via **Chorus Pro** » — *src=CCAP p.17*
5. « Produire les éléments de traçabilité des déchets conformément aux **articles 36.2.1 et 36.2.x** » — *src=CCAP p.23*

## Références normatives structurées repérées dans la sortie
- DTU : `DTU 40.35`, `DTU 43.3`, `NF DTU 20.12` (3 distinctes)
- Code : `article L.2192-1` · Norme produit : `NF EN 12101`
- → A cite **peu** de références normatives *structurées* ; sa force est l'**extrait verbatim + page** par exigence (traçabilité), pas le référencement DTU exhaustif.

## Limite qualité observée
- **Imprécision de taxonomie** : plusieurs clauses d'**exécution administrative** du CCAP (Chorus Pro, pénalité réunions 300 €, traçabilité déchets) sont classées `category=technique`. Ce sont de vraies exigences (avec source verbatim) mais mal catégorisées.
- Aucune erreur factuelle de chiffre/norme repérée (pas de diviseur de pénalité ni de DTU erroné dans la sortie).
