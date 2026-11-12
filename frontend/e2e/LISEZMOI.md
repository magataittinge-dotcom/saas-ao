# Test de bout en bout (parcours d'un client, IA simulée)

1. Lancer le front d'une copie sur un banc (`banc.sh lancer <nom>`), puis arrêter **seulement son API** : le port de l'API doit être libre.
2. `cd frontend && npm run e2e` : le test fabrique un dossier de consultation inventé (`backend/tests/e2e/dce_invente.py`), lance sa propre API à **IA simulée** (`backend/tests/e2e/api_simulee.py`, refus si une clé d'IA est posée ou si la base n'est pas `synorix_fin_*`), puis joue le parcours.
3. Parcours, à 1 440 × 900 puis à 390 × 844 : Dépôt → Lots (Lot 01) → Décider → Pièces (un DC2 déposé) → Plan (validé) → Rédiger (le mémoire s'écrit, une partie s'ouvre, une modification s'enregistre seule, rechargement) → Export (double clic sur « Télécharger le dossier », ZIP ouvert, mémoire en Word ouvert, « Je l'ai déposé ») → l'AO quitte Mes AO et l'Accueil.
4. À chaque écran : titre, étape active du fil, un seul bouton principal, 0 erreur de console, aucune 5xx, rien qui déborde à 390 px, action principale ≥ 44 px au téléphone. Une étape qui ne mène plus à la suivante fait échouer le test (code 1).
5. Les mots attendus sont dans `e2e/contrat.mjs`, une seule fois chacun : un libellé changé à l'écran fait échouer le test, c'est voulu.
6. Bugs connus, déjà portés au rapport : tolérés et listés en fin de passage (« constats ») ; `E2E_STRICT=1 npm run e2e` les fait échouer. Retirez la ligne de `parcours.mjs` quand le bug est corrigé.
7. Réglages : `E2E_BASE` (front, défaut `http://localhost:3127`), `E2E_API_PORT` (8127), `E2E_PYTHON` (Python du dépôt), `E2E_EMAIL` (compte Clerk de développement), `E2E_TRAVAIL` (dossier de travail), `E2E_CAPTURES` (captures de chaque étape).
8. Rejouable : chaque passage supprime d'abord les AO « E2E Ecole des Grebes » d'un passage précédent. Chaque passage décompte 1 analyse et 1 mémoire du quota du mois de l'entreprise de test.
9. En fin de test : les appels simulés par AO (lecture du dossier, rédaction…), mesure du nombre d'appels d'IA d'un parcours.
10. Navigateur : `playwright-core` (Apache-2.0) et le Chromium local de `banc/ecran.mjs` (`E2E_CHROMIUM`, `E2E_PLAYWRIGHT` pour un autre chemin).

## Second test : `npm run e2e:2` (`e2e/parcours-2.mjs`, même banc, même API simulée, moins de 2 minutes)
1. A (1 440) : une attestation rangée au coffre-fort est **choisie** à l'étape Pièces et se retrouve dans le ZIP (octet pour octet) ; « Préparer les questions » (Décider) affiche la question simulée et sa source ; l'IA tombe pendant la rédaction (message du produit, unité intacte, relance) ; « Je l'ai déposé » → « Gagné » → « Corriger : Perdu » depuis Mes AO, et la ligne « Taux de réussite » de l'Accueil suit.
2. B (1 440) : un dossier à deux lots, une DPGF par lot (`dce_invente --parcours-2`) ; les deux lots lus d'un coup (2 unités) ; l'Export de chaque lot propose et télécharge la DPGF de **son** lot.
3. C (1 440 puis 390) : quota du mois épuisé → « Analyser 1 lot » ouvre le mur d'abonnement ; rien décompté, aucun appel d'IA. D (1 440) : « Supprimer mon compte » sans abonnement : dialogue et phrase vérifiés, **jamais confirmé** (la suppression appelle Clerk).
4. C et D tournent sur « E2E2 Organisation de test » (offre Essentiel, 5 analyses sur 5), posée dans la **base jetable** par `backend/tests/e2e/base_jetable.py` (refus hors `synorix_fin_*`) : le compte du test y est rattaché le temps de C et D, puis rendu à son organisation (aussi au départ du passage suivant si un passage a été interrompu).
5. Marque `E2E2 Grebes` : son ménage ne touche pas aux AO du premier test. Les captures d'un passage précédent (`<largeur>-<A|B|C|D>-…`) sont remplacées.
6. Constats tolérés et listés en fin de passage, `E2E_STRICT=1` les rend bloquants ; `E2E2_SEUL=A,C` ne joue que ces parcours. Le lanceur relève aussi le plafond « Préparer les questions » (10 par 24 h) à 500, jamais coupé.
