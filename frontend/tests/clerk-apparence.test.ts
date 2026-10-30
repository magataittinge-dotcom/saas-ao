// Socle — Clerk habillé avec les jetons : variables = valeurs résolues des jetons (clair et nuit),
// éléments = var(--jeton) ; le texte reste lisible sur la carte et sur le bouton.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construireApparence } from '../src/lib/clerkApparence'
import { contraste, valeur, type Theme } from './outils/jetons'
import { lire, sansCommentaires } from './outils/sources'

const pour = (theme: Theme) => construireApparence((j) => valeur(theme, j))

test('Clerk : les variables sont les jetons résolus, dans chaque thème', () => {
  const clair = pour('light').variables!
  const nuit = pour('dark').variables!
  assert.equal(clair.colorPrimary, '#0078d6')
  assert.equal(nuit.colorPrimary, '#0078d6')
  assert.equal(clair.colorBackground, '#ffffff')
  assert.equal(nuit.colorBackground, '#1d1d1d')
  assert.equal(clair.colorText, '#1d1d1d')
  assert.equal(nuit.colorText, '#ffffff')
  assert.equal(clair.colorInputBackground, '#ffffff')
  assert.equal(nuit.colorInputBackground, '#111111')
  assert.match(String(clair.fontFamily), /Inter/)
})

test('Clerk : textes lisibles (4,5:1) sur la carte, le champ et le bouton, dans les deux thèmes', () => {
  for (const theme of ['light', 'dark'] as Theme[]) {
    const v = pour(theme).variables!
    const mesures: [string, string, string][] = [
      ['texte / carte', String(v.colorText), String(v.colorBackground)],
      ['secondaire / carte', String(v.colorTextSecondary), String(v.colorBackground)],
      ['saisie / champ', String(v.colorInputText), String(v.colorInputBackground)],
      ['bouton', String(v.colorTextOnPrimaryBackground), String(v.colorPrimary)],
      ['erreur / carte', String(v.colorDanger), String(v.colorBackground)],
    ]
    for (const [nom, a, b] of mesures) assert.ok(contraste(a, b) >= 4.5, `${theme} ${nom} : ${contraste(a, b).toFixed(2)}`)
  }
})

test('Clerk : les éléments passent par var(--jeton), le ClerkProvider reçoit l\'apparence et la recalcule à chaque bascule', () => {
  const e = pour('light').elements as Record<string, Record<string, unknown>>
  assert.equal(e.formButtonPrimary.backgroundImage, 'var(--accent-fill)')
  assert.equal(e.card.borderRadius, 'var(--radius-xl)')
  const src = sansCommentaires(lire('src/lib/clerkApparence.ts'))
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{3,8}\b/, 'aucune couleur en dur')
  const main = sansCommentaires(lire('src/main.tsx'))
  assert.match(main, /appearance=\{appearance\}/)
  assert.match(main, /\[theme\]/)
})
