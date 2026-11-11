// R24 + R25 — écran mémoire : formulation factuelle de la pondération (aucun lien au prix),
// phrase du quota non contradictoire (aucune offre n'est illimitée depuis le 11/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('R24 : la pondération est « relevée dans le règlement », le mémoire n\'est pas « optimisé »', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.ok(code.includes('Pondération relevée dans le règlement'))
  assert.ok(!/optimisé pour/i.test(code))
})

test('R25 / G8 : une seule phrase de coût (la carte), plus de « non décompté » ni de « Consommera 1 mémoire »', () => {
  const code = sansCommentaires(lire('src/components/project/MemoirePreflight.tsx'))
  assert.ok(!code.includes('Consommera 1 mémoire'))
  assert.ok(!/non décompté|n’est pas décompté/.test(code))
  assert.ok(!/illimit/i.test(sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))))
})
