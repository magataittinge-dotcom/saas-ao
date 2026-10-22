// 1.15 — L'aperçu du mémoire reste lisible en thème sombre : toute zone
// « prose » (classe Tailwind Typography) porte sa variante sombre, sinon
// titres, gras et liens sont en #111827 sur #18181A (contraste 1,00:1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire } from './outils/sources'

test('chaque bloc « prose » a la variante sombre prose-invert', () => {
  const blocs: string[] = []
  const fautifs: string[] = []
  for (const f of fichiersSource().filter((x) => x.endsWith('.tsx'))) {
    for (const m of lire(f).matchAll(/className="([^"]*)"/g)) {
      const classes = m[1].split(/\s+/)
      if (!classes.includes('prose')) continue // « legal-prose » a ses propres couleurs
      blocs.push(f)
      if (!classes.includes('prose-invert')) fautifs.push(`${f} : ${m[1]}`)
    }
  }
  assert.ok(blocs.length > 0, 'au moins un bloc prose (aperçu du mémoire)')
  assert.deepEqual(fautifs, [])
})
