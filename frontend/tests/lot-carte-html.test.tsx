// R7 — la carte de lot contient un vrai bouton (« Renommer ») : elle ne peut pas être elle-même un <button>
// (HTML invalide, avertissement React validateDOMNesting, clavier et lecteurs d'écran peu fiables).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('la carte de lot est un role="button" au clavier, pas un <button> qui en contient un autre', () => {
  const src = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.doesNotMatch(src, /<button[^>]*onClick=\{onSelect\}/)
  const carte = /<div\s+role="button"\s+tabIndex=\{0\}\s+aria-pressed=\{selected\}\s+onClick=\{onSelect\}\s+onKeyDown=\{\(e\) => \{[^}]*e\.key === 'Enter'[^}]*e\.key === ' '/.exec(src)
  assert.ok(carte, 'carte de lot : role="button", tabIndex, aria-pressed, onClick et touches Entrée/Espace')
  // « Renommer » et « Retirer de la liste » : dans le menu « … » de la carte (hors de la zone cliquable), plus d'infobulle native
  assert.match(src, /<MenuElement onSelect=\{startEdit\}>/)
  assert.match(src, /<MenuElement danger onSelect=\{onDelete\}>/)
  assert.doesNotMatch(src, /title="(Renommer|Supprimer|Enregistrer|Annuler)/)
})
