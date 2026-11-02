// R2 — la pastille de « Mes AO » dit ce qu'elle compte : les AO en cours à remettre sous 7 jours (libellé accessible + infobulle).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libelleUrgents } from '@/lib/echeance'
import { lire, sansCommentaires } from './outils/sources'

test('libellé de la pastille : ce qu\'elle compte, accord au singulier et au pluriel', () => {
  assert.equal(libelleUrgents(1), '1 AO en cours à remettre sous 7 jours')
  assert.equal(libelleUrgents(3), '3 AO en cours à remettre sous 7 jours')
})

test('la barre de bureau et les onglets du téléphone portent le même libellé, lu par les lecteurs d\'écran', () => {
  for (const f of ['src/components/layout/Sidebar.tsx', 'src/components/layout/BarreOnglets.tsx']) {
    const code = sansCommentaires(lire(f))
    assert.match(code, /libelleUrgents\(urgents\)/, f)
    assert.match(code, /role="img"/, f)
    assert.match(code, /aria-label=\{libelleUrgents\(urgents\)\}/, f)
    assert.doesNotMatch(code, /échéance sous 7 jours/, f)
  }
})
