// P2-4 (REVUE-FRONT) : une pièce ouverte depuis une adresse rendue par le serveur s'ouvrait par
// window.open(url, '_blank') : l'onglet ouvert gardait window.opener (il pouvait renvoyer Synorix vers une fausse page)
// et recevait l'adresse d'origine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('pièce ouverte dans un onglet : noopener et noreferrer, http(s) seulement', () => {
  for (const f of ['src/routes/project/StepAnalysis.tsx', 'src/components/memoire/RelectureMemoire.tsx', 'src/hooks/useSourceChamp.tsx']) {
    const src = sansCommentaires(lire(f))
    assert.doesNotMatch(src, /window\.open\(doc\.file_url, '_blank'\)/, f)
    assert.match(src, /ouvrirOngletExterne\(doc\.file_url\)/, f)
  }
})

test('ouvrirOngletExterne : refuse javascript:, data: et les chemins ; ouvre http(s) sans opener ni referrer', async () => {
  const appels: unknown[][] = []
  ;(globalThis as { window?: unknown }).window = { open: (...a: unknown[]) => { appels.push(a); return null } }
  const { ouvrirOngletExterne } = await import('@/lib/adresseSure')
  for (const a of ['javascript:alert(1)', 'data:text/html,x', 'httpx://a', '/api/files/view/x', '//tiers.example']) assert.equal(ouvrirOngletExterne(a), false, a)
  assert.equal(ouvrirOngletExterne('https://stockage.example/piece.pdf'), true)
  assert.deepEqual(appels, [['https://stockage.example/piece.pdf', '_blank', 'noopener,noreferrer']])
})
