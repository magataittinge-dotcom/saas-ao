// D23 (décision du fondateur, 12/11/2026) — sous la grille des offres, la phrase dit la règle de résiliation : résiliable
// à tout moment, l'accès reste ouvert jusqu'à la fin de la période payée, le mois entamé n'est pas remboursé. Courte, sans
// point d'exclamation, la même au mur des offres et dans Paramètres > Abonnement (une seule constante).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHRASE_RESILIATION } from '@/components/offres/GrilleOffres'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('D23 : la phrase dit la règle de résiliation, sans point d’exclamation', () => {
  assert.match(PHRASE_RESILIATION, /^Résiliable à tout moment/)
  assert.match(PHRASE_RESILIATION, /jusqu’à la fin de la période payée/)
  assert.match(PHRASE_RESILIATION, /le mois entamé n’est pas remboursé/)
  assert.doesNotMatch(PHRASE_RESILIATION, /!/)
  assert.ok(PHRASE_RESILIATION.length <= 160, 'courte')
})

test('D23 : la même phrase au mur des offres et dans l’abonnement ; « Annulation possible » a disparu', () => {
  for (const f of ['src/components/common/SubscriptionWall.tsx', 'src/routes/Billing.tsx']) {
    assert.match(sansCommentaires(lire(f)), /\{PHRASE_RESILIATION\}/, f)
  }
  const restes = fichiersSource('src').filter((f) => /Annulation possible à tout moment/.test(lire(f)))
  assert.deepEqual(restes, [])
  // la ligne des tarifs reste vraie et ne change pas
  assert.match(lire('src/routes/Pricing.tsx'), /Sans engagement · Résiliable à tout moment · Support inclus/)
})
