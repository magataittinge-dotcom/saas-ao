// S6 — la ligne d'avertissement des pièces à joindre, au-dessus du bouton « Télécharger le dossier ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import PiecesAJoindre from '@/components/project/PiecesAJoindre'

const PIECES = [
  { id: 'a', document_type_required: 'urssaf', status: 'manquant', details: 'Attestation de vigilance URSSAF' },
  { id: 'b', document_type_required: 'kbis', status: 'expire', linked_document_name: 'kbis-2025.pdf' },
  { id: 'c', document_type_required: 'dc1', status: 'warning', details: 'Lettre de candidature (DC1)' },
] as never

test('l\'avertissement garde la liste des pièces à joindre, sans fenêtre, sans orange, sans second bouton', () => {
  const html = renderToStaticMarkup(<PiecesAJoindre pieces={PIECES} />)
  assert.ok(html.includes('3 pièces sont à joindre. Elles ne seront pas dans le dossier.'))
  // la liste complète reste là, chacune avec son état en mots positifs
  for (const t of ['Attestation de vigilance URSSAF', 'à joindre', 'kbis-2025.pdf', 'à renouveler',
    'Lettre de candidature (DC1)', 'date de validité à confirmer']) assert.ok(html.includes(t), t)
  assert.ok(html.includes('<details'), 'la liste se déplie')
  assert.ok(!/<button/.test(html), 'aucun bouton : le geste est celui de « Télécharger le dossier »')
  assert.ok(!/warning|warn|orange|ambre|role="dialog"|fixed/.test(html), 'ni orange ni fenêtre')
  assert.equal(renderToStaticMarkup(<PiecesAJoindre pieces={[]} />), '', 'rien à dire : rien d\'affiché')
})

