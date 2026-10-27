// Un onglet resté ouvert pendant un déploiement demande un morceau de code qui n'existe plus
// (vite:preloadError) : un seul rechargement automatique, jamais de boucle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reagirAuMorceauIntrouvable, CLE_RECHARGEMENT, DELAI_MIN_MS } from '@/lib/rechargementDeploiement'

function stockageFactice(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}
const evenement = () => { const e = { empeche: false, preventDefault() { e.empeche = true } }; return e }

test('première erreur : la page est rechargée une fois, l\'erreur n\'est pas levée', () => {
  const s = stockageFactice(); const e = evenement(); let recharges = 0
  const fait = reagirAuMorceauIntrouvable(e, s, () => { recharges++ }, 1_000_000)
  assert.equal(fait, true); assert.equal(recharges, 1); assert.equal(e.empeche, true)
  assert.equal(s.m.get(CLE_RECHARGEMENT), '1000000', 'la garde est posée AVANT le rechargement')
})

test('une deuxième erreur juste après le rechargement : aucun rechargement (pas de boucle), l\'erreur suit son cours', () => {
  const s = stockageFactice({ [CLE_RECHARGEMENT]: '1000000' }); const e = evenement(); let recharges = 0
  const fait = reagirAuMorceauIntrouvable(e, s, () => { recharges++ }, 1_000_000 + DELAI_MIN_MS - 1)
  assert.equal(fait, false); assert.equal(recharges, 0); assert.equal(e.empeche, false)
})

test('un déploiement bien plus tard dans la même session : un nouveau rechargement est permis', () => {
  const s = stockageFactice({ [CLE_RECHARGEMENT]: '1000000' }); let recharges = 0
  assert.equal(reagirAuMorceauIntrouvable(evenement(), s, () => { recharges++ }, 1_000_000 + DELAI_MIN_MS), true)
  assert.equal(recharges, 1)
})

test('stockage indisponible (navigation privée, quota) : on ne recharge pas, faute de garde', () => {
  const casse = { getItem: () => { throw new Error('refusé') }, setItem: () => { throw new Error('refusé') } }
  const e = evenement(); let recharges = 0
  assert.equal(reagirAuMorceauIntrouvable(e, casse, () => { recharges++ }, 5), false)
  assert.equal(recharges, 0); assert.equal(e.empeche, false)
})

test('valeur de garde illisible : remplacée par la nouvelle garde, un seul rechargement', () => {
  const s = stockageFactice({ [CLE_RECHARGEMENT]: 'n\'importe quoi' }); let recharges = 0
  assert.equal(reagirAuMorceauIntrouvable(evenement(), s, () => { recharges++ }, 9_999_999), true)
  assert.equal(recharges, 1)
})
