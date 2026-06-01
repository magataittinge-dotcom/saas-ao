# Phases 5-8 — Progression (verification, export, sidebar, chatbot)

**Démarré :** 2026-06-01 (suite Phase 4)
**Pattern :** expert_ite — 3 fichiers + raw + __init__ + pytest
**Notebooks :** N1=08531eb6 N2=7a661d76 N3=43615791 N4=777badb4 N5=39ae9088 N6=1108bddc N7=8ff1cdc4 N8=5574a7d1
**Point de départ :** 63 skills registered → cible 91.

---

## Journal

### Phase 5 — verification (11 skills) ✅ — 23 tests verts
- [OK] #64 recherche-format-rapport-conformite (Sonnet, N6) — sections rapport, criticité 🔴🟡🟢, ton positif.
- [OK] #65 recherche-criteres-evaluation-memoire (Sonnet, N7) — triptyque + axes + échelle 0-5, pondérations indicatives.
- [OK] #66 recherche-nomenclature-fichiers-ao (Haiku, N5) — caractères proscrits, ≤30 car, chemin ≤150, format Societe_TypePiece.
- [OK] #67 recherche-procedures-depot-plateformes (Sonnet, N5) — PLACE/AWS étape par étape, preuves à conserver.
- [OK] #68 detection-pieces-manquantes-vs-ao (Sonnet, N2) — matching sémantique, 0 faux négatif, doute→a_verifier.
- [OK] #69 detection-validite-pieces-administratives (Haiku, N2/#35) — expirées + bientôt expirées, validité inconnue→a_completer.
- [OK] #70 synorix-score-evaluateur (**Opus**, N7) — /100 par axe + justifications (grille 0-5). D5.
- [OK] #71 synorix-score-suggestions (**Opus**, N7) — suggestions actionnables par axe sous seuil, ton positif. D4.
- [OK] #85 simulateur-prix-DAJ (**none/déterministe**, N7) — 3 formules DAJ + AMF, formule la plus favorable. D6.
- [OK] #86 RAO-predictif (Sonnet, N7) — grille 0-5 par sous-critère + classement, R2152-6 à R2152-8 CCP. D8.
- [OK] #95 calculateur-OAB-temps-reel (**none/déterministe**, N7) — double moyenne L2152-5 (M1, >1.2×M1 exclu, M2, 0.9×M2), gauge, TA Nantes Verchéenne. D7.

---

## Compteurs
- OK : 11 (Phase 5)
- Incomplètes : 0
- Total registry : 63 + 11 = 74
- Restantes vers 91 : 17 (export 5 + extraction 1 + sidebar 5 + chatbot 5 + memoire 1)

## Divergences registry/NotebookLM à arbitrer (Mohamed)
- **#85 simulateur-prix-DAJ** et **#95 calculateur-OAB** : registry indiquait Haiku 4.5, mais ce sont des **calculs purs déterministes** → implémentés en `model="none"` (0 LLM, vérifiable), conformément à la règle de mission « calculateurs/formules → none si calcul pur ». Comme #24 calculatrice. À valider.

## Modèles utilisés (suivi coût) — Phase 5
- none : #85, #95
- Haiku : #66, #69
- Sonnet : #64, #65, #67, #68, #86
- Opus : #70, #71 (registry l'exige explicitement pour le Synorix Score)

### Phase 6 — export (5) + extraction #87 (6 skills) ✅ — 12 tests verts
- [OK] #72 recherche-format-zip-ao-pro (Haiku, N5) — sous-dossiers Candidature/Offre_Lot_X, checklist en racine.
- [OK] #73 recherche-page-garde-memoire (Sonnet, N3) — lot/MOA exacts, logos réassurance, charte, chaînage sommaire. D2.
- [OK] #74 recherche-checklist-depot-plateforme (Sonnet, N5) — vérifs avant envoi, pièges (mauvais lot/fichier/signature).
- [OK] #75 recherche-suivi-post-depot (Sonnet, N8) — J+1/J+30/J+90, perdu→demander RAO, gagné→standstill 11j.
- [OK] #88 conseil-recours-eviction (Sonnet, N6, **export**) — référé précontractuel L551-1, contractuel L551-13 (31j/6mois), Tarn-et-Garonne CE 4/4/2014 (2 mois). D11.
- [OK] #87 detection-criteres-disproportionnes (Sonnet, N6, **extraction**) — CA > 2× montant (R2142-6), R2142-14, CE 10/4/2024 n°482722, CAA Marseille 19/1/2022 n°19MA02554. D10.

---

## Compteurs (mise à jour)
- OK : 17 (Phase 5 = 11, Phase 6+#87 = 6)
- Total registry : 63 + 17 = 80
- Restantes vers 91 : 11 (sidebar 5 + chatbot 5 + memoire 1)

### Phase 7 — sidebar (5 skills #76-80) ✅ — 10 tests verts
- [OK] #76 recherche-structure-profil-entreprise-btp (Sonnet, N2) — champs DC1/DC2, CERTIBAT 30/09/2026, décennale L241-1.
- [OK] #77 recherche-format-references-chantiers (Sonnet, N3) — champs obligatoires/optionnels + score de pertinence (#37).
- [OK] #78 recherche-bibliotheque-phrases-memoire (Sonnet, N3) — taxonomie section × corps de métier, granularité paragraphe.
- [OK] #79 recherche-coffre-fort-pieces-administratives (Sonnet, N2) — >30 catégories (DC/NOTI/EXE), Kbis ≤3 mois, validités + alternatives.
- [OK] #80 analyse-historique-ao-entreprise (Sonnet, BE) — insights actionnables premium, axes à renforcer, zéro chiffre inventé.

---

## Compteurs (mise à jour)
- OK : 22 (Phase 5 = 11, Phase 6+#87 = 6, Phase 7 = 5)
- Total registry : 63 + 22 = 85
- Restantes vers 91 : 6 (chatbot 5 + memoire 1)

## REPRENDRE À
Phase 8 / chatbot / #81 recherche-architecture-chatbot-saas-pro
