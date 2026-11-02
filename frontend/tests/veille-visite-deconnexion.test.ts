// R1 — la visite de la veille ne part plus d'un démontage après la déconnexion (401 sans jeton) :
// elle part avant la déconnexion, une seule fois, et jamais sans jeton.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enregistrerVisite, poserVisiteAvantSortie } from '@/lib/visiteVeille'
import { lire, sansCommentaires } from './outils/sources'

test('la visite enregistrée part avant la sortie, une seule fois', async () => {
  let appels = 0
  const retirer = enregistrerVisite(async () => { appels += 1 })
  await poserVisiteAvantSortie()
  await poserVisiteAvantSortie()
  assert.equal(appels, 1)
  retirer()
})

test('sans visite enregistrée, la sortie ne fait rien', async () => {
  await poserVisiteAvantSortie()
})

test('une visite en échec ou trop lente ne bloque jamais la déconnexion', async () => {
  const retirer = enregistrerVisite(async () => { throw new Error('réseau') })
  await poserVisiteAvantSortie()
  retirer()
  const retirer2 = enregistrerVisite(() => new Promise(() => {}))
  const t0 = Date.now()
  await poserVisiteAvantSortie(50)
  assert.ok(Date.now() - t0 < 1000)
  retirer2()
})

test('la déconnexion pose la visite avant de fermer la session ; le hook ne la pose pas sans jeton', () => {
  const auth = sansCommentaires(lire('src/hooks/useAuth.ts'))
  assert.ok(auth.indexOf('poserVisiteAvantSortie') > -1 && auth.indexOf('poserVisiteAvantSortie') < auth.indexOf('signOut({'))
  const hook = sansCommentaires(lire('src/hooks/useVeille.ts'))
  assert.match(hook, /enregistrerVisite\(/)
  assert.match(hook, /sessionOuverte/)
})
