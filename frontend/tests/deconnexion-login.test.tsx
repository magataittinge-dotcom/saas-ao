// C12 — la déconnexion mène à /login : Clerk recharge la page vers son adresse de sortie (par défaut « / », la page publique)
// avant le navigate('/login') ; l'adresse de retour est donc donnée à Clerk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('useLogout : signOut reçoit redirectUrl /login', () => {
  const src = sansCommentaires(lire('src/hooks/useAuth.ts'))
  assert.match(src, /signOut\(\{\s*redirectUrl:\s*'\/login'\s*\}\)/)
})
