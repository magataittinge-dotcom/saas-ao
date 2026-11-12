// Restes 2, point 7 — Clerk 5 a remplacé afterSignInUrl / afterSignUpUrl (dépréciés : un avertissement dans la console à
// chaque page) par les redirections « de repli » : même rôle (là où l'on arrive sans redirect_url), même destination.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('ClerkProvider : redirections de repli vers /dashboard, plus de props dépréciées', () => {
  const code = sansCommentaires(lire('src/main.tsx'))
  assert.doesNotMatch(code, /afterSignInUrl|afterSignUpUrl/)
  assert.match(code, /signInFallbackRedirectUrl="\/dashboard"/)
  assert.match(code, /signUpFallbackRedirectUrl="\/dashboard"/)
})
