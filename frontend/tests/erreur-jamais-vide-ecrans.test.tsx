// F-03 — les quatre lectures qui, en panne, montraient un état vide (« aucun avis », « les notifications arriveront ici »,
// des cases de dépôt sans leur état, « aucun appel d'offres ne contient… ») disent maintenant leur erreur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import AvisPourVous from '@/components/veille/AvisPourVous'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { CLES_VEILLE } from '@/hooks/useVeille'
import { lire, sansCommentaires } from './outils/sources'

/** Un client dont ces lectures ont échoué (500), sans aucune donnée en mémoire. */
function clientEnEchec(...cles: QueryKey[]): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  for (const cle of cles) {
    const q = c.getQueryCache().build(c, { queryKey: cle })
    q.setState({ ...q.state, status: 'error', error: new Error('500'), fetchStatus: 'idle', errorUpdateCount: 1, errorUpdatedAt: Date.now() })
  }
  return c
}

test('Mes AO vide : la lecture des avis a échoué → l’erreur et « Réessayer », jamais « Choisissez votre zone » ni « Aucun avis »', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={clientEnEchec(CLES_VEILLE.preferences)}><MemoryRouter><AvisPourVous /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('role="alert"'), html)
  assert.ok(html.includes('Réessayer'))
  assert.ok(!html.includes('Choisissez votre zone'))
  assert.ok(!html.includes('Aucun avis ouvert'))
})

test('Mon entreprise : l’état des dépôts n’a pas pu se lire → l’erreur, pas des cases qui se disent vides', () => {
  const c = clientEnEchec(['depots', 'etat', 'identite'])
  c.setQueryData(['depots', 'cases'], [{ id: 'kbis', libelle: 'Extrait Kbis', rubrique: 'identite', formats: ['pdf'], plusieurs: false }])
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><CasesDepot rubrique="identite" /></QueryClientProvider>)
  assert.ok(html.includes('role="alert"'), html)
  assert.ok(html.includes('Réessayer'))
  assert.ok(!html.includes('Extrait Kbis'), 'les cases ne s’affichent pas sans leur état')
})

test('Mon entreprise : la liste des cases n’a pas pu se lire → l’erreur, plus un bloc qui disparaît sans un mot', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={clientEnEchec(['depots', 'cases'])}><CasesDepot rubrique="identite" /></QueryClientProvider>)
  assert.ok(html.includes('role="alert"'), html)
})

test('la cloche : en panne, le panneau dit l’erreur au lieu de « Les notifications arriveront ici »', () => {
  const code = sansCommentaires(lire('src/components/layout/NotificationBell.tsx'))
  assert.match(code, /const \{ data, isError[^}]*\} = useQuery/)
  // l'état vide n'est rendu que si la lecture n'est pas en erreur
  assert.match(code, /isError && !data \? \(\s*<EtatErreur/)
})

test('Ctrl K : en panne de la liste des AO, la recherche ne dit pas « aucun appel d’offres ne contient… »', () => {
  const code = sansCommentaires(lire('src/components/layout/CommandPalette.tsx'))
  assert.match(code, /const \{ data: projects = \[\], isError: aoEnErreur \} = useProjects\(\)/)
  assert.match(code, /aoEnErreur\s*\?/)
})
