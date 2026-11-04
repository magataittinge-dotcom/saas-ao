// G4 (recette du 4/11) — les tableaux du mémoire s'affichaient en barres brutes (`| Élément | Information |`) dans
// Rédiger, alors que le Word les rend. Le lecteur les rend en vrais tableaux.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import LecteurMarkdown from '@/components/memoire/LecteurMarkdown'
import { decouperTables } from '@/lib/tablesMarkdown'

const TABLE = '| Élément | Information |\n|---|:---:|\n| Effectif | 12 **personnes** |\n| Zone | Marne \\| Aisne |'

test('decouperTables sépare le texte courant et les tableaux, dans l\'ordre', () => {
  const segs = decouperTables(`Avant.\n\n${TABLE}\n\nAprès, avec une barre | isolée.`)
  assert.deepEqual(segs.map((s) => s.type), ['texte', 'table', 'texte'])
  const t = segs[1]
  assert.ok(t.type === 'table')
  assert.deepEqual(t.entetes, ['Élément', 'Information'])
  assert.deepEqual(t.lignes, [['Effectif', '12 **personnes**'], ['Zone', 'Marne | Aisne']])
  assert.deepEqual(t.alignements, [null, 'center'])
  assert.match(segs[2].type === 'texte' ? segs[2].texte : '', /Après, avec une barre \| isolée/)
})

test('un texte sans tableau reste un seul segment ; une ligne à barres sans séparateur n\'est pas un tableau', () => {
  assert.deepEqual(decouperTables('Rien ici.').map((s) => s.type), ['texte'])
  assert.deepEqual(decouperTables('| a | b |\nsuite normale').map((s) => s.type), ['texte'])
})

test('le lecteur rend un vrai <table> avec en-têtes, cellules et gras, sans barres brutes', () => {
  const html = renderToStaticMarkup(<LecteurMarkdown text={`Intro.\n\n${TABLE}\n\nFin.`} />)
  assert.match(html, /<table/)
  assert.match(html, /<th[^>]*>Élément<\/th>/)
  assert.match(html, /<td[^>]*>Effectif<\/td>/)
  assert.match(html, /<strong>personnes<\/strong>/)
  assert.doesNotMatch(html, /\|---|\| Élément/)
  assert.match(html, /Intro\./)
  assert.match(html, /Fin\./)
})
