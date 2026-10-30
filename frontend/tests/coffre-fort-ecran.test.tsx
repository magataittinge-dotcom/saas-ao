// Phase C — Coffre-fort : l'écran suit le thème, les catégories et les textes ne changent pas, la zone de dépôt et
// le bloc « Non classés » lisent les jetons ; la fenêtre de classement est le Dialog du socle (focus piégé,
// Échap, étiquettes associées).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Vault from '@/routes/Vault'
import type { Document } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const doc = (id: string, over: Partial<Document>): Document => ({
  id, organization_id: 'org-test', type: 'kbis', category: 'attestations_sociales_fiscales', file_url: `vault/${id}.pdf`,
  file_name: `piece-${id}.pdf`, status: 'valid', uploaded_at: '2026-10-10T09:00:00', ...over,
})

function rendre(documents: Document[], url = '/vault') {
  const client = new QueryClient()
  client.setQueryData(['documents'], documents)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Vault /></MemoryRouter></QueryClientProvider>)
}

test('le coffre-fort rend son titre, la zone de dépôt du socle et le bloc « Non classés » en jetons', () => {
  const html = rendre([doc('a', {}), doc('b', { category: 'unclassified', status: 'unclassified', type: 'autre' })])
  assert.ok(/<h1[^>]*>Coffre-fort documentaire<\/h1>/.test(html), 'un seul h1')
  assert.ok(html.includes('2 documents stockés'))
  assert.ok(html.includes('Glissez vos documents ici ou cliquez pour parcourir'))
  assert.ok(html.includes('PDF — 20 MB max'))
  const zone = html.match(/<div[^>]*border-dashed[^>]*>/)?.[0] ?? ''
  assert.ok(zone.includes('border-input'), 'bord de zone à 3:1 (jeton de champ)')
  assert.ok(html.includes('Non classés (1) — à classer pour être utilisables dans vos candidatures'))
  assert.ok(/<div[^>]*border-warning-border[^>]*bg-warning-bg[^>]*>/.test(html), 'bloc « Non classés » en jetons warning')
})

test('coffre-fort vide : le message positif est conservé', () => {
  const html = rendre([])
  assert.ok(html.includes('Votre coffre-fort est vide'))
  assert.ok(html.includes('0 documents stockés'))
})

test('le retour à la vérification suit le contexte AO (returnTo)', () => {
  assert.ok(rendre([], '/vault?returnTo=%2Fprojects%2Fp1%2Fverification').includes('Retour à la vérification'))
  assert.ok(!rendre([]).includes('Retour à la vérification'))
})

test('la fenêtre de classement est le Dialog du socle, avec des étiquettes associées aux champs', () => {
  const code = sansCommentaires(lire('src/components/vault/ClassifyDocumentModal.tsx'))
  assert.match(code, /from '@\/components\/ui\/dialog'/)
  assert.doesNotMatch(code, /createPortal/)
  for (const id of ['classer-categorie', 'classer-type', 'classer-emission', 'classer-validite']) {
    assert.ok(code.includes(`htmlFor="${id}"`) && code.includes(`id="${id}"`), id)
  }
})

test('les lignes de pièce passent à la ligne et leurs boutons font 44 px sur écran tactile', () => {
  const code = sansCommentaires(lire('src/routes/Vault.tsx'))
  assert.match(code, /LISTE_PIECES = '[^']*\[@media\(pointer:coarse\)\]:\[&_button\]:min-h-11/)
  assert.match(code, /LISTE_PIECES = '[^']*\[&>div\]:flex-wrap/)
  assert.equal((code.match(/className=\{LISTE_PIECES\}/g) ?? []).length, 2, 'les deux listes (Non classés, catégories)')
})

test('/vault suit le thème clair / nuit', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /PAGES_THEMEES = \[[^\]]*'\/vault'/)
})
