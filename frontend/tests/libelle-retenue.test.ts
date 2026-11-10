// Le mot « Calculateurs » n'existe plus à l'écran : l'entrée /outils s'appelle « Retenue de garantie »
// (le calculateur OAB est retiré ; il ne reste que le calcul de retenue). Pas de couleur #E4E9F2 en dur sur l'écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('aucune occurrence de « Calculateurs » dans frontend/src (hors commentaires)', () => {
  const fautifs = fichiersSource('src').filter((f) => /Calculateurs/i.test(sansCommentaires(lire(f))))
  assert.deepEqual(fautifs, [])
})

test('l\'accès /outils porte le libellé « Retenue de garantie » partout', () => {
  // la palette Ctrl K lit navigation.ts (ACCES_PALETTE) ; la barre n'a plus cette entrée (S1)
  for (const f of ['src/components/layout/navigation.ts', 'src/components/layout/Header.tsx']) {
    assert.match(sansCommentaires(lire(f)), /'\/outils'[^\n]*Retenue de garantie/, f)
  }
  // le h1 est celui de <Page> (un seul par écran)
  assert.match(sansCommentaires(lire('src/routes/Tools.tsx')), /<Page\s+titre="Retenue de garantie"/)
})

test('l\'écran n\'a qu\'un titre (« Retenue de garantie ») et un seul geste (« Calculer ») : plus de carte titrée « Calculer ma retenue »', () => {
  const code = sansCommentaires(lire('src/routes/Tools.tsx'))
  assert.doesNotMatch(code, /Calculer ma retenue/)
  assert.equal((code.match(/variante="principal"/g) ?? []).length, 1)
  assert.match(code, />Calculer<\/Bouton>/)
})

test('Tools.tsx : plus de #E4E9F2 en dur', () => {
  assert.doesNotMatch(lire('src/routes/Tools.tsx'), /#E4E9F2/i)
})
