// Lot c — une erreur n'est jamais un vide (audit du front, F-03). Pour chaque écran qui lit des données, la requête
// principale est coupée : l'écran dit l'erreur et propose « Réessayer » ; le texte de son état vide n'apparaît pas.
// (Le coffre-fort a le sien dans coffre-fort-ecran.test.tsx, la fiche dans fiche-entreprise.test.tsx.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Company from '@/routes/Company'
import Billing from '@/routes/Billing'
import { useAuthStore } from '@/stores/authStore'

/** Un client dont les requêtes données sont en échec, sans rien en cache (au rendu serveur, elles restent en échec). */
function clientEnPanne(cles: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } })
  for (const cle of cles) {
    client.getQueryCache().build(client, { queryKey: [cle] })
      .setState({ status: 'error', error: new Error('500'), fetchStatus: 'idle', data: undefined })
  }
  return client
}

const rendre = (client: QueryClient, el: React.ReactElement, url: string) => {
  const g = globalThis as unknown as { window?: unknown }
  const avant = g.window
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{el}</MemoryRouter></QueryClientProvider>)
  } finally { g.window = avant }
}

test('Mon entreprise : une panne du serveur n’est pas un profil vide : l’erreur et « Réessayer », jamais « Commencer par votre SIRET »', () => {
  // un compte sans rien de saisi : sans réponse du serveur, on ne sait pas si le profil est vide
  useAuthStore.setState({ organization: null })
  const html = rendre(clientEnPanne(['memoire-config', 'team', 'references', 'documents', 'qualifications']), <Company />, '/company')
  assert.match(html, /<h1[^>]*>Mon entreprise<\/h1>/, 'le titre de la page reste là')
  assert.ok(html.includes('data-etat-erreur'))
  assert.ok(html.includes('Votre entreprise n’a pas pu se charger') && html.includes('Réessayer'))
  assert.ok(!html.includes('Commencer par votre SIRET'), 'le texte de l’état vide n’apparaît pas')
  assert.ok(!html.includes('role="tablist"') && !html.includes('data-visage'), 'ni les rubriques ni le visage : rien n’est affirmé sans données')
  assert.ok(!/Request failed|status code|\[object Object\]/.test(html), 'jamais le message brut')
})

test('Mon entreprise : une seule lecture en échec suffit à dire l’erreur ; les lectures déjà reçues ne sont pas jetées', () => {
  useAuthStore.setState({ organization: null })
  const client = clientEnPanne(['memoire-config'])
  for (const cle of ['team', 'references', 'documents', 'qualifications']) client.setQueryData([cle], [])
  const html = rendre(client, <Company />, '/company')
  assert.ok(html.includes('data-etat-erreur') && !html.includes('Commencer par votre SIRET'))
})

test('Abonnement : les unités du mois en panne disent l’erreur, pas « Vos unités du mois apparaîtront ici » ; l’offre reste affichée', () => {
  useAuthStore.setState({ organization: { id: 'o1', name: 'Entreprise inventée', plan: 'pro', created_at: '2026-01-01' } as never })
  const html = rendre(clientEnPanne(['billing-quota']), <Billing />, '/settings/billing')
  assert.match(html, /<h1[^>]*>Abonnement<\/h1>/)
  assert.ok(html.includes('data-etat-erreur'))
  assert.ok(html.includes('Les unités du mois n’ont pas pu se charger') && html.includes('Réessayer'))
  assert.ok(!html.includes('Vos unités du mois apparaîtront ici'), 'le texte de l’état vide n’apparaît pas')
  assert.ok(!/Request failed|status code|\[object Object\]/.test(html))
  useAuthStore.setState({ organization: null })
})
