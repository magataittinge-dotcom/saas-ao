// R5 — règle de ton : aucun point d'exclamation dans ce qui s'affiche à l'écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

// « mot !' » ou « mot ! » en fin de texte (typographie française : espace avant le « ! »),
// ou « mot!' » juste avant un guillemet. Les opérateurs (!==, !x) et les « x! » du
// typage TypeScript (non-null) ne sont pas des textes.
const EXCLAMATION = /\s!(['"`<]|\s*$)|[\p{L}]!['"`]/mu

test('aucun point d\'exclamation dans les textes de l\'application', () => {
  const fautifs: string[] = []
  for (const f of fichiersSource('src')) {
    const code = sansCommentaires(lire(f))
    code.split('\n').forEach((ligne, i) => {
      if (EXCLAMATION.test(ligne)) fautifs.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(fautifs, [])
})
