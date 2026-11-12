// Les textes du serveur ne sont plus réécrits à l'écran par des expressions régulières (fragile : une phrase changée au
// serveur, et l'écran se trompait). Le serveur écrit la bonne phrase ; ses tests la tiennent :
//  - notifications « mémoire prêt » et « analyse terminée » : backend/tests/test_notifications.py ;
//  - nom d'une pièce sans « (N exigences du RC regroupées) » ni « — rédigé par Synorix à l'étape … » :
//    backend/tests/test_note_regroupement_pieces.py ;
//  - explications du score sans « (s) » : backend/tests/test_textes_serveur_accords.py.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('plus aucune correction de la note de regroupement ni des pluriels « (s) » du serveur dans src/', () => {
  const fautifs = fichiersSource('src').filter((f) => /regroupées\?\\\)|exigences\?? du RC regroupées|\\\(\(e\?s\)\\\)|\\\(s\\\)/.test(sansCommentaires(lire(f))))
  assert.deepEqual(fautifs, [])
  assert.doesNotMatch(sansCommentaires(lire('src/components/project/SynorixScoreCard.tsx')), /explication\.replace\(/)
  assert.doesNotMatch(sansCommentaires(lire('src/lib/nomsPieces.ts')), /sansNoteDeRegroupement/)
  // « Mémoire technique — rédigé par Synorix à l'étape Rédiger » : le serveur écrit le nom seul, l'écran dit l'étape
  assert.doesNotMatch(sansCommentaires(lire('src/routes/project/StepVerification.tsx')), /par Synorix\.\*/)
})
