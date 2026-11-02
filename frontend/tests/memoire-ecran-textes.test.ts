// R24 + R25 — écran mémoire : formulation factuelle de la pondération (aucun lien au prix),
// phrase du quota non contradictoire pour une offre illimitée.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('R24 : la pondération est « relevée dans le règlement », le mémoire n\'est pas « optimisé »', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.ok(code.includes('Pondération relevée dans le règlement'))
  assert.ok(!/optimisé pour/i.test(code))
})

test('R25 : offre illimitée → plus de « Consommera 1 mémoire — offre illimitée »', () => {
  const code = sansCommentaires(lire('src/components/project/MemoirePreflight.tsx'))
  assert.ok(!code.includes('Consommera 1 mémoire — offre illimitée'))
  assert.ok(code.includes('Offre illimitée : ce mémoire n’est pas décompté'))
  // les offres à quota gardent leur phrase
  assert.ok(code.includes('Consommera 1 mémoire'))
})
