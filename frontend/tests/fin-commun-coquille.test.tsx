// Jury, tour 1 (11/11/2026) — les défauts communs de la coquille, corrigés une fois pour tous les écrans.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import LegalFooter from '@/components/layout/LegalFooter'
import { lire, sansCommentaires } from './outils/sources'

test('pied de page : sur la grille du contenu (le conteneur de la coquille), plus de largeur à lui', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LegalFooter /></MemoryRouter>)
  assert.match(html, /<footer[^>]*data-coquille="pied"[^>]*><div class="conteneur /)
  assert.doesNotMatch(html, /max-w-\[1680px\]|max-w-6xl|mx-auto|px-6/)
})

test('pied de page au téléphone : deux rangées de trois (cinq liens et le copyright), aucun mot seul sur sa ligne', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LegalFooter /></MemoryRouter>)
  assert.match(html, /max-md:grid max-md:grid-cols-\[auto_auto_auto\]/)
  assert.match(html, /<nav[^>]*class="[^"]*max-md:contents/)
  assert.equal((html.match(/<a /g) ?? []).length, 5)
  assert.match(html, /<span class="[^"]*max-md:order-last[^"]*">© \d{4} Synorix<\/span>/)
})

test('la coquille ne force plus la nuit sur un écran : <main> ne porte un thème que si la liste le demande, et elle ne le demande plus', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /export const estThemee = \(_pathname: string\) => true/)
})
