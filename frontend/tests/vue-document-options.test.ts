// Lecteur PDF : les options de pdf.js sont un objet stable (react-pdf recharge le document si leur
// identité change) et `isEvalSupported` est coupé, pour qu'une CSP sans `unsafe-eval` ne remonte pas
// un rapport `eval` à chaque ouverture d'un document (répétition du serveur, 3/11).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire } from './outils/sources'

const source = lire('src/components/project/source/VueDocument.tsx')

test('isEvalSupported est à false dans les options du document', () => {
  const bloc = source.match(/const OPTIONS_PDFJS = \{([^}]*)\}/)
  assert.ok(bloc, 'OPTIONS_PDFJS introuvable')
  assert.match(bloc![1], /isEvalSupported:\s*false/)
})

test('les options sont une constante de module, passée telle quelle à <Document>', () => {
  assert.match(source, /<Document[^>]*options=\{OPTIONS_PDFJS\}/s)
})
