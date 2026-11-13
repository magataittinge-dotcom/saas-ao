// Coffre-fort (mission finale, lot c) : la page du système, un seul geste (« Déposer des documents »), plus de zone en
// pointillés au repos, plus de rubriques « (0) Aucun document » : les rubriques sans pièce rejoignent une seule surface
// « À déposer ». L'état vide dit ce que le coffre-fort fera (A10). Une panne du serveur n'est jamais « vous n'avez rien ».
// La fenêtre de classement est le Dialogue du système, avec ses listes et ses dates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Vault, { piecesDansLOrdre } from '@/routes/Vault'
import type { Document } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const doc = (id: string, over: Partial<Document>): Document => ({
  id, organization_id: 'org-test', type: 'kbis', category: 'attestations_sociales_fiscales', file_url: `vault/${id}.pdf`,
  file_name: `piece-${id}.pdf`, status: 'valid', uploaded_at: '2026-10-10T09:00:00', ...over,
})

function rendre(documents: Document[] | 'panne', url = '/vault') {
  // retryOnMount: false : au rendu serveur, une requête en échec reste en échec (elle n'est pas montrée « en chargement »)
  const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } })
  if (documents === 'panne') {
    client.getQueryCache().build(client, { queryKey: ['documents'] })
      .setState({ status: 'error', error: new Error('500'), fetchStatus: 'idle', data: undefined })
  } else client.setQueryData(['documents'], documents)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Vault /></MemoryRouter></QueryClientProvider>)
}

const nb = (html: string, motif: RegExp) => (html.match(motif) ?? []).length

test('le coffre-fort rend un seul h1, un seul bouton principal et aucune zone en pointillés au repos', () => {
  const html = rendre([doc('a', {}), doc('b', { category: 'unclassified', status: 'unclassified', type: 'autre' })])
  assert.equal(nb(html, /<h1\b/g), 1)
  assert.ok(/<h1[^>]*>Coffre-fort<\/h1>/.test(html), 'le nom de la barre, pas « Coffre-fort documentaire »')
  assert.equal(nb(html, /Déposer des documents/g), 1, 'un seul geste')
  assert.ok(!html.includes('border-dashed'), 'la zone de dépôt n’apparaît qu’au survol d’un fichier')
  assert.ok(html.includes('data-page='), 'la page du système')
})

test('P20 : plus de rubrique « (0) Aucun document » ; les rubriques sans pièce sont des rangées « À déposer », sans compteur', () => {
  const html = rendre([doc('a', {}), doc('b', { category: 'unclassified', status: 'unclassified', type: 'autre' })])
  assert.ok(!html.includes('Aucun document'))
  assert.ok(!/\(\d+\)/.test(html), 'aucun compteur entre parenthèses')
  assert.ok(html.includes('>À déposer</h2>'))
  for (const rubrique of ['Documents légaux', 'Assurances', 'Qualifications', 'Références et moyens', 'Autres']) {
    assert.ok(html.includes(rubrique), rubrique)
  }
  assert.ok(html.indexOf('>À ranger</h2>') < html.indexOf('Attestations sociales'), 'ce qui reste à ranger passe en premier')
  // une surface par rubrique qui a des pièces (rangées à filets), une seule pour les rubriques à déposer
  assert.equal(nb(html, /data-surface=""/g), 1 + nb(html, /<h2[^>]*id="coffre-(?!a-deposer)/g))
  assert.equal(nb(html, /data-piece=""/g), nb(html, /aria-label="Ouvrir /g), 'chaque pièce est une rangée, pas une carte')
})

test('A10 : coffre-fort vide = ce qu’il fera, et un seul bouton', () => {
  const html = rendre([])
  assert.ok(html.includes('Vos attestations (URSSAF, assurance, Kbis) se rangent ici.'))
  assert.ok(html.includes('Synorix les joint à chaque dossier et vous prévient avant la fin de leur validité.'))
  assert.equal(nb(html, /Déposer des documents/g), 1)
  assert.ok(!html.includes('À déposer</h2>'), 'pas de liste de trous sous l’état vide')
  assert.ok(!html.includes('Aucune pièce'))
})

test('une panne du serveur n’est pas un coffre-fort vide : l’erreur, « Réessayer », et pas le texte de l’état vide', () => {
  const html = rendre('panne')
  assert.ok(html.includes('data-etat-erreur'))
  assert.ok(html.includes('Le coffre-fort n’a pas pu s’ouvrir'))
  assert.ok(html.includes('Réessayer'))
  assert.ok(!html.includes('vivent ici'), 'le texte de l’état vide n’apparaît pas')
  assert.ok(!html.includes('Aucune pièce stockée'))
})

test('500 pièces : des pages de 50, ce qui reste à ranger en tête', () => {
  const pieces = Array.from({ length: 500 }, (_, i) => doc(`p${i}`, i % 10 === 0 ? { category: 'unclassified', status: 'unclassified', type: 'autre' } : {}))
  assert.equal(piecesDansLOrdre(pieces)[0].category, 'unclassified')
  const html = rendre(pieces)
  assert.equal(nb(html, /piece-p\d+\.pdf<\/p>/g), 50)
  assert.ok(html.includes('Pièces 1 à 50 sur 500') && html.includes('page 1 sur 10'))
  assert.ok(html.includes('placeholder="Chercher une pièce"') && html.includes('500 pièces'))
  assert.ok(html.includes('Page suivante'))
})

test('le retour à la vérification suit le contexte AO (returnTo)', () => {
  assert.ok(rendre([], '/vault?returnTo=%2Fprojects%2Fdfc6ceb2-e944-4249-af92-d146b1b20b2b%2Fverification').includes('Retour à la vérification'))
  assert.ok(!rendre([]).includes('Retour à la vérification'))
  // P0-1 : une adresse qui n'est pas celle d'une étape d'AO → pas de bouton
  for (const r of ['javascript:alert(1)', '%2F%2Ftiers.example', '%2F%5Ctiers.example', 'https%3A%2F%2Ftiers.example', '%2Fprojects%2Fp1%2Fverification']) {
    assert.ok(!rendre([], `/vault?returnTo=${r}`).includes('Retour à la vérification'), r)
  }
})

test('la fenêtre de classement est le Dialogue du système : listes et dates du système, aucun contrôle natif', () => {
  const code = sansCommentaires(lire('src/components/vault/ClassifyDocumentModal.tsx'))
  assert.match(code, /from '@\/components\/ui\/dialogue'/)
  assert.doesNotMatch(code, /createPortal|<select\b|type="date"/)
  assert.match(code, /<ListeDeroulante/)
  assert.match(code, /<ChampDate/)
  assert.doesNotMatch(code, /⚠/, 'pas d’émoji dans une phrase')
})

test('les lignes de pièce passent à la ligne et leurs boutons font 44 px sur écran tactile', () => {
  const code = sansCommentaires(lire('src/routes/Vault.tsx'))
  assert.match(code, /LISTE_PIECES = '[^']*\[@media\(pointer:coarse\)\]:\[&_button\]:min-h-11/)
  // jury, tour 1 : une surface à filets (plus une carte par pièce) ; au téléphone, deux lignes, jamais plus large que l'écran
  assert.match(code, /<Carte sansMarge className=\{LISTE_PIECES\}>/)
  const rangee = sansCommentaires(lire('src/components/common/FileCard.tsx'))
  assert.match(rangee, /data-piece=""[^>]*grid-cols-\[minmax\(0,1fr\)\][^>]*border-t border-bord[^>]*first:border-t-0/)
  assert.doesNotMatch(rangee, /rounded-lg border border-bord|StatusBadge/, 'ni cadre par pièce ni pastille « À ranger »')
})

test('/vault suit le thème clair / nuit', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /PAGES_THEMEES = \[[^\]]*'\/vault'/)
})

test('R30 : la limite affichée est celle du serveur, et le coffre-fort n’annonce que ce qu’il accepte (PDF, Word, Excel, JPEG, PNG)', async () => {
  const serveur = lire('../backend/services/upload_validation.py').match(/VAULT_MAX_UPLOAD_SIZE\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/)
  assert.ok(serveur, 'limite du serveur lisible')
  const formats = sansCommentaires(lire('src/lib/coffreFormats.ts'))
  assert.match(formats, new RegExp(`TAILLE_MAX_COFFRE_MO = ${serveur[1]}\\b`))
  const code = sansCommentaires(lire('src/routes/Vault.tsx'))
  assert.doesNotMatch(code, /\b20 Mo|20 \* 1024/)
  assert.match(code, /accept: FORMATS_COFFRE/)
  assert.match(code, /PRECISION_COFFRE/)
})
