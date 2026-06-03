# BLOC 5 — Validation mémoire sur un 2e DCE (optionnel)

## Conclusion : pas de 2e cas exploitable → non exécuté (budget préservé)

**Recherche effectuée** (0 API) des DCE/CCTP disponibles dans le repo :
- `docs/comparaison-AB/_input_CCAP.txt` (CCAP Gueux, partagé tous lots)
- `docs/comparaison-AB/_input_CCTP_lot02_etancheite.txt` (**seul CCTP extrait**)

L'analyse Gueux liste bien 13 lots (démolition/GO, étanchéité, menuiseries, ITE façade, plâtrerie, carrelage, peinture, électricité, plomberie, CVC, ascenseur, PV), **mais seul le texte CCTP du lot 02 (étanchéité) est disponible** dans le repo. Aucun autre projet/DCE n'est présent.

**Pourquoi ne pas tester un autre lot de Gueux ?** Générer un mémoire pour un autre lot (ex. lot 05 ITE) sans son CCTP — avec uniquement le CCAP partagé — produirait un mémoire **dégradé et non représentatif** (la méthodologie Partie C s'appuie sur le contenu technique du CCTP du lot). Ce ne serait **pas** un « DCE différent » valide : même projet, même CCAP, sans matière technique nouvelle. Cela consommerait le budget mémoire (1/1) sur un test peu concluant.

**Décision (conforme à la règle de mission)** : ne PAS regénérer sur Gueux (déjà validé cette semaine — 26/26, end_turn ×4, 0 troncature, 0 invention, ~1 $, densité réglementaire renforcée). Documenter l'absence de 2e cas et passer.

**Budget API : mémoire 0/1 (non consommé), analyse 0/1 (non consommée).**

## Pour réaliser cette validation plus tard (quand un 2e DCE sera dispo)
- Fournir un CCTP réel d'un autre lot/projet (idéalement un corps de métier différent — ITE, électricité, VRD… pour exercer un autre référentiel méthodologie).
- Rejouer `scripts/e2e_memoire_gueux_sonnet_renforce.py` adapté aux nouveaux inputs (CCTP + CCAP + analyse).
- Vérifier les mêmes critères : 26/26 sous-sections, `end_turn` ×4, 0 troncature, 0 invention (scan des références normatives vs corpus), coût ~1 $, densité réglementaire (DTU/Avis Technique du corps de métier concerné).
- But : confirmer la robustesse du full-Sonnet renforcé hors lot étanchéité.
