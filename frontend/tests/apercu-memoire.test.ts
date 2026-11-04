// 1.15 — L'aperçu du mémoire reste lisible en thème sombre : toute zone
// « prose » (classe Tailwind Typography) porte sa variante sombre, sinon
// titres, gras et liens sont en #111827 sur #18181A (contraste 1,00:1).
// Depuis B2 (4/11), le lecteur du mémoire (`lecteur-memoire`) reprend les jetons du thème, clair comme nuit :
// ses couleurs sont vérifiées par lecteur-memoire.test.tsx, il remplace prose-invert (blanc sur fond clair).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire } from './outils/sources'

test('chaque bloc « prose » a la variante sombre (prose-invert) ou les jetons du thème (lecteur-memoire)', () => {
  const blocs: string[] = []
  const fautifs: string[] = []
  for (const f of fichiersSource().filter((x) => x.endsWith('.tsx'))) {
    for (const m of lire(f).matchAll(/className="([^"]*)"/g)) {
      const classes = m[1].split(/\s+/)
      if (!classes.includes('prose')) continue // « legal-prose » a ses propres couleurs
      blocs.push(f)
      if (!classes.includes('prose-invert') && !classes.includes('lecteur-memoire')) fautifs.push(`${f} : ${m[1]}`)
    }
  }
  assert.ok(blocs.length > 0, 'au moins un bloc prose (aperçu du mémoire)')
  assert.deepEqual(fautifs, [])
})
