// 1.15 — L'aperçu du mémoire reste lisible en thème sombre : toute zone
// « prose » porte sa variante sombre (sinon titres, gras et liens en #111827
// sur #18181A, contraste 1,00:1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire } from './outils/sources'

test('chaque bloc « prose » a la variante sombre prose-invert', () => {
  const fautifs: string[] = []
  for (const f of fichiersSource().filter((x) => x.endsWith('.tsx'))) {
    for (const m of lire(f).matchAll(/className="([^"]*\bprose\b[^"]*)"/g)) {
      if (!/\bprose-invert\b/.test(m[1])) fautifs.push(`${f} : ${m[1]}`)
    }
  }
  assert.deepEqual(fautifs, [])
})
