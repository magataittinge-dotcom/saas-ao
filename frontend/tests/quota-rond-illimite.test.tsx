// Recette du 4/11 — le rond « ∞ » de la barre latérale (offre illimitée), sans nom écrit dessous comme les autres entrées,
// déroutait. En offre illimitée la barre n'affiche plus de jauge ; les offres à unités gardent la leur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QuotaRond } from '@/components/layout/QuotaGauge'
import { lire, sansCommentaires } from './outils/sources'

const rendre = (quota: unknown, masquer: boolean) => {
  const c = new QueryClient()
  c.setQueryData(['billing-quota'], quota)
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><QuotaRond masquerIllimite={masquer} /></MemoryRouter></QueryClientProvider>)
}
const ILLIMITE = { plan: 'business', analyses: { used: 5, limit: null }, memoires: { used: 2, limit: null } }
const UNITES = { plan: 'pro', analyses: { used: 20, limit: 40 }, memoires: { used: 16, limit: 40 } }

test('offre illimitée : plus de rond « ∞ » dans la barre latérale', () => {
  assert.equal(rendre(ILLIMITE, true), '')
  assert.doesNotMatch(rendre(ILLIMITE, true), /∞/)
})

test('offre à unités : la jauge reste, avec son pourcentage', () => {
  const html = rendre(UNITES, true)
  assert.match(html, /50%/)
  assert.match(html, /href="\/settings\/billing"/)
})

test('la barre latérale demande le retrait ; le menu du téléphone garde son rond, nommé « Abonnement »', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Sidebar.tsx')), /<QuotaRond masquerIllimite \/>/)
  assert.match(rendre(ILLIMITE, false), /∞/)
})

// Jury, tour 1 (bloquant, accueil-quota-atteint et abonnement-quota-atteint) : « 100% » débordait de son anneau.
test('quota atteint : « 100% » tient dans l\'anneau (anneau de 40 px, chiffre en 11 px, sans chasse fixe)', () => {
  const html = rendre({ plan: 'pro', analyses: { used: 40, limit: 40 }, memoires: { used: 12, limit: 40 } }, true)
  assert.match(html, />100%</)
  const anneau = html.match(/<svg[^>]*data-anneau-quota[^>]*>/)?.[0] ?? ''
  assert.match(anneau, /size-10/, 'anneau de 40 px : 31 px de creux')
  const chiffre = html.match(/<span[^>]*data-chiffre-quota[^>]*>/)?.[0] ?? ''
  assert.match(chiffre, /text-micro/, 'chiffre en 11 px : « 100% » fait 27 px')
  assert.doesNotMatch(chiffre, /tabular-nums|text-xs|text-sm/)
})
