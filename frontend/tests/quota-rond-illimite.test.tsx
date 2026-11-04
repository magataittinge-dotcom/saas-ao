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
