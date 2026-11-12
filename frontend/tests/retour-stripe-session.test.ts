// P2-7 (REVUE-FRONT) : au retour de Stripe, session_id (lu dans l'adresse) était collé sans encodage dans l'adresse de
// /stripe/verify-session : « cs_x&autre=1 » ou « ../ » ajoutaient des paramètres ou changeaient le chemin. Il passe
// désormais par `params` (axios l'encode).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('Billing : session_id passe par params, jamais collé dans l’adresse', () => {
  const src = sansCommentaires(lire('src/routes/Billing.tsx'))
  assert.doesNotMatch(src, /verify-session\?session_id=\$\{/, 'session_id collé sans encodage')
  assert.match(src, /'\/stripe\/verify-session',\s*\{\s*params:\s*\{\s*session_id:\s*sessionId\s*\}\s*\}/)
})
