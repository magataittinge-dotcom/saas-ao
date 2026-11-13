// B8 — avant la rédaction, le plan dit « N parties » et, SEULEMENT si l'analyse l'a relevée, la limite de pages du
// règlement avec sa source (la règle que la relecture emploie déjà : services/relecture_memoire, limite_pages).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carteLongueur } from '@/lib/planMemoire'
import { lire, sansCommentaires } from './outils/sources'

test('une limite relevée : « Limite du règlement : 20 pages au plus », sa source et « Voir dans le dossier »', () => {
  const vus: unknown[] = []
  const carte = carteLongueur({ pages: 20, source: { type: 'exigence', id: 'e1', document: 'RC', page: 7 } }, (s) => vus.push(s))
  assert.equal(carte.libelle, 'Limite du règlement')
  assert.equal(carte.valeur, '20 pages au plus')
  assert.equal(carte.detail, undefined)
  assert.equal(carte.source?.libelle, 'RC · page 7')
  carte.source?.onVoir?.()
  assert.deepEqual(vus, [{ type: 'exigence', id: 'e1', document: 'RC', page: 7 }])
})

test('une limite sans source lisible : la limite, sans lien', () => {
  const carte = carteLongueur({ pages: 1, source: null }, () => {})
  assert.equal(carte.valeur, '1 page au plus')
  assert.equal(carte.source, undefined)
  assert.equal(carteLongueur({ pages: 12, source: { document: null, page: null } }, () => {}).source, undefined)
})

test('aucune limite relevée : l’écran dit ce que Synorix a lu, jamais ce que le règlement « ne fixe pas »', () => {
  const carte = carteLongueur(null)
  assert.equal(carte.libelle, 'Longueur')
  assert.equal(carte.valeur, 'Libre')
  assert.equal(carte.detail, 'Aucune limite de pages relevée dans le dossier.')
  assert.equal(carte.source, undefined)
})

test('l’écran du plan passe par cette fonction, avec l’ouverture de la source', () => {
  assert.match(sansCommentaires(lire('src/routes/project/StepPlan.tsx')), /carteLongueur\(vue\.limite_pages, voir\)/)
})
