// Composants morts retirés (jamais importés) : ils ne doivent pas revenir, et rien ne doit les importer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { RACINE, fichiersSource, lire } from './outils/sources'

for (const nom of ['PlanetBackground', 'PaymentCard']) {
  test(`${nom} : fichier retiré et aucun import`, () => {
    assert.equal(existsSync(path.join(RACINE, `src/components/common/${nom}.tsx`)), false)
    const importeurs = [...fichiersSource('src'), ...fichiersSource('tests')]
      .filter((f) => !f.endsWith('composants-retires.test.ts'))
      .filter((f) => new RegExp(`from\\s+['"][^'"]*/${nom}['"]`).test(lire(f)))
    assert.deepEqual(importeurs, [])
  })
}
