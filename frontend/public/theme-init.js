/* Pose data-theme sur <html> AVANT le premier affichage : aucun éclair.
   Choix mémorisé (localStorage, clé « synorix.theme ») ; sinon préférence du système.
   Fichier externe (et non en ligne) : la CSP n'autorise que script-src 'self'.
   Garder la clé et les valeurs alignées sur src/lib/theme.ts (un test le vérifie). */
(function () {
  var theme = null;
  try { theme = localStorage.getItem('synorix.theme'); } catch (e) { /* stockage indisponible */ }
  if (theme !== 'light' && theme !== 'dark') {
    try { theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { theme = 'light'; }
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
