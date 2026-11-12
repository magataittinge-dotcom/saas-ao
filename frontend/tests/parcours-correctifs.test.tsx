// Les bugs trouvés par le test de bout en bout (frontend/e2e, rapport E2E du 12/11), un test chacun. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verrouLancement } from '@/lib/verrouLancement'
import { lire, sansCommentaires } from './outils/sources'

test('double clic sur « Télécharger le dossier » : un seul dossier (le second lancement est refusé tant que le premier court)', () => {
  const verrou = verrouLancement()
  assert.equal(verrou.prendre(), true, 'premier clic : lancé')
  assert.equal(verrou.prendre(), false, 'second clic pendant le premier : refusé')
  verrou.rendre()
  assert.equal(verrou.prendre(), true, 'le téléchargement fini, un nouveau clic relance')
  const code = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.doesNotMatch(code, /onClick=\{\(\) => exportZip\(\)\}/, 'le bouton ne lance plus exportZip sans garde')
  assert.match(code, /if \(!verrouZip\.prendre\(\)\) return/)
  assert.match(code, /exportZip\(undefined, \{ onSettled: verrouZip\.rendre \}\)/)
})
