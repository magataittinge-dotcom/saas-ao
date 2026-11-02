// R31 — le mémoire absent répond 204 : l'écran le lit comme « pas encore de mémoire », sans erreur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoireDepuisReponse } from '@/lib/memoireLecture'
import { lire, sansCommentaires } from './outils/sources'

test('204 et corps vide : pas encore de mémoire ; 200 : le mémoire', () => {
  assert.equal(memoireDepuisReponse(204, ''), null)
  assert.equal(memoireDepuisReponse(200, ''), null)
  assert.equal(memoireDepuisReponse(200, null), null)
  const m = { id: 'm1', content_json: {} }
  assert.deepEqual(memoireDepuisReponse(200, m), m)
})

test('l’écran du mémoire n’attend plus un 404 pour dire « pas de mémoire »', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(code, /memoireDepuisReponse<MemoireTechnique>\(res\.status, res\.data\)/)
  assert.doesNotMatch(code, /status === 404\) return null/)
})
