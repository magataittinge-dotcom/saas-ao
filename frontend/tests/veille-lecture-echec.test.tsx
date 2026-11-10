// Inventaire, annexe B : quand la lecture de la veille échouait, l'Accueil envoyait quand même un PUT /api/veille/preferences
// (il réécrivait, avec les valeurs par défaut, des préférences qu'il n'avait pas pu lire) et montrait « Choisissez une zone sur
// la carte », comme si rien n'était choisi. Une erreur n'est jamais un vide, et on n'enregistre pas ce qu'on n'a pas lu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VeilleAccueil from '@/components/veille/VeilleAccueil'
import { CLES_VEILLE } from '@/hooks/useVeille'
import { lire, sansCommentaires } from './outils/sources'

/** Un client dont la lecture des préférences a échoué (500), sans aucune donnée en mémoire. */
function clientEnEchec(): QueryClient {
  // retryOnMount: false : au rendu serveur, la requête en échec reste « en erreur » (sinon elle se dit « en chargement »)
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  const q = c.getQueryCache().build(c, { queryKey: CLES_VEILLE.preferences })
  q.setState({ ...q.state, status: 'error', error: new Error('500'), fetchStatus: 'idle', errorUpdateCount: 1, errorUpdatedAt: Date.now() })
  return c
}

test('la lecture des préférences a échoué : la veille dit son erreur et propose « Réessayer », jamais « Choisissez une zone »', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={clientEnEchec()}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('La veille n’a pas pu se charger'), 'l’erreur est dite')
  assert.ok(html.includes('Réessayer'), 'le geste pour repartir')
  assert.ok(html.includes('role="alert"'), 'annoncée aux lecteurs d’écran')
  assert.ok(!html.includes('Choisissez une zone sur la carte'), 'pas le texte de l’état vide')
  assert.ok(!html.includes('Aucun avis ouvert'), 'pas « aucun avis » non plus')
})

test('aucun enregistrement ne part tant que les préférences n’ont pas été lues : l’échec n’ouvre pas l’écriture', () => {
  const code = sansCommentaires(lire('src/hooks/useVeille.ts'))
  // l'écriture (PUT) ne se planifie que si `hydrate` est vrai…
  assert.match(code, /if \(!hydrate\) return\s*envoyer\.planifier\(/)
  // … et `hydrate` ne devient vrai qu'avec des préférences lues (en mémoire ou reçues), jamais sur une erreur
  assert.doesNotMatch(code, /isError[^\n]*setHydrate\(true\)/, 'une lecture en échec ne rend pas l’écran enregistrable')
  assert.equal((code.match(/setHydrate\(true\)/g) ?? []).length, 1, 'un seul chemin vers l’enregistrement : les préférences lues')
  assert.match(code, /preferencesEnErreur: prefs\.isError && !hydrate/)
})
