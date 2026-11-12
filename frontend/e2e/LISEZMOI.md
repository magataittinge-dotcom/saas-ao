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
