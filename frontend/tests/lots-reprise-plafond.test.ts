// 3/11 (A1) : le filet IA des lots est retenté à l'ouverture de l'écran des lots une fois le plafond remis à zéro. Le serveur répond
// alors « detecting_lots » (comme un cache manquant) : l'écran attend puis rappelle la route. Il ne doit pas, pendant l'attente,
// repartir de l'ancienne liste gardée dans le projet (elle ne serait plus remplacée). Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lotsAAfficher } from '@/lib/lotsSource'

const ANCIENS = [{ id: 'lot1' }, { id: 'lot2' }]
const NOUVEAUX = [{ id: 'lot1' }, { id: 'lot2' }, { id: 'lot3' }]

test('détection en cours (réponse null) : aucune liste, surtout pas l’ancienne liste du projet', () => {
  assert.deepEqual(lotsAAfficher(null, ANCIENS), [])
})

test('réponse reçue : ses lots ; route en chargement ou en erreur : la liste du projet, comme avant', () => {
  assert.deepEqual(lotsAAfficher({ lots: NOUVEAUX }, ANCIENS), NOUVEAUX)
  assert.deepEqual(lotsAAfficher(undefined, ANCIENS), ANCIENS)
  assert.deepEqual(lotsAAfficher(undefined, null), [])
  assert.deepEqual(lotsAAfficher({ lots: [] }, ANCIENS), [])
})
