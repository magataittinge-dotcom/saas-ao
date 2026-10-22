// 1.4 — Aucun conseil de prix, aucun chiffre sans source : seules les
// pondérations lues dans le règlement de consultation s'affichent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import PoidsMemoire from '@/components/project/PoidsMemoire'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('avec une pondération du RC : le chiffre lu et sa source, rien d\'autre', () => {
  const html = renderToStaticMarkup(<PoidsMemoire techPct={50} />)
  assert.match(html, /50(&nbsp;| )%/)
  assert.ok(html.includes('relevée dans le règlement de consultation'))
})

test('sans pondération dans le RC : aucun chiffre affiché', () => {
  const texte = renderToStaticMarkup(<PoidsMemoire techPct={0} />).replace(/<[^>]+>/g, '')
  assert.doesNotMatch(texte, /\d/)
  assert.equal(texte, 'Aucune pondération relevée dans le règlement de consultation.')
})

test('aucun conseil sur le prix ni moyenne inventée dans le code', () => {
  const interdits = [
    'ajustez votre offre', 'offre financière en priorité', 'Le prix domine', 'fera la différence',
    'moyenne constatée', "'60 %'", "'60 %'",
  ]
  for (const f of fichiersSource()) {
    const code = sansCommentaires(lire(f))
    for (const t of interdits) assert.ok(!code.includes(t), `${f} contient « ${t} »`)
  }
})
