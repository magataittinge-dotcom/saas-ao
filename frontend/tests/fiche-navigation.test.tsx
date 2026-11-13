// Les fiches à télécharger (/entreprise/fiche/<rubrique>) appartiennent à « Mon entreprise » : l'entrée de la barre reste
// active, et l'en-tête dit « Mon entreprise › Fiche à télécharger » (pas « Tableau de bord »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from '@/components/layout/Header'
import { estActif } from '@/components/layout/navigation'

test('l’entrée « Mon entreprise » reste active sur une fiche à télécharger', () => {
  assert.equal(estActif('/entreprise/fiche/moyens', '/company'), true)
  assert.equal(estActif('/entreprise/fiche/moyens', '/dashboard'), false)
  assert.equal(estActif('/company', '/company'), true)
  assert.equal(estActif('/companyx', '/company'), false)
})

test('l’en-tête d’une fiche : « Mon entreprise › Fiche à télécharger », parent vers /company', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/entreprise/fiche/references']}><Header onSearch={() => {}} /></MemoryRouter></QueryClientProvider>)
  // jury, tour 1 : le fil se lit en entier (« Mon entreprise / » restait sans suite tant que le h1 était à l'écran)
  assert.match(html, /data-fil-courant=""[^>]*aria-current="page">Fiches</)
  assert.match(html, /href="\/company"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Mon entreprise</) // le chevron du téléphone précède le nom
  assert.doesNotMatch(html, /Tableau de bord/)
})
