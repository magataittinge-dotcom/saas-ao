// Le mot « Calculateurs » n'existe plus à l'écran : l'entrée /outils s'appelle « Retenue de garantie »
// (le calculateur OAB est retiré ; il ne reste que le calcul de retenue). Pas de couleur #E4E9F2 en dur sur l'écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('aucune occurrence de « Calculateurs » dans frontend/src (hors commentaires)', () => {
  const fautifs = fichiersSource('src').filter((f) => /Calculateurs/i.test(sansCommentaires(lire(f))))
  assert.deepEqual(fautifs, [])
})

test('l\'entrée /outils porte le libellé « Retenue de garantie » partout', () => {
  for (const f of ['src/components/layout/navigation.ts', 'src/components/layout/CommandPalette.tsx', 'src/components/layout/Header.tsx']) {
    assert.match(sansCommentaires(lire(f)), /'\/outils'[^\n]*Retenue de garantie/, f)
  }
  assert.match(sansCommentaires(lire('src/routes/Tools.tsx')), /<h1[^>]*>Retenue de garantie<\/h1>/)
})

test('la carte du calcul s\'appelle « Calculer ma retenue » (le h1 garde « Retenue de garantie »)', () => {
  assert.match(sansCommentaires(lire('src/routes/Tools.tsx')), /<h2[^>]*>Calculer ma retenue<\/h2>/)
})

test('Tools.tsx : plus de #E4E9F2 en dur', () => {
  assert.doesNotMatch(lire('src/routes/Tools.tsx'), /#E4E9F2/i)
})
