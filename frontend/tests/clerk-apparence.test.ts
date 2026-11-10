// Socle — Clerk habillé avec les jetons : variables = valeurs résolues des jetons (clair et nuit),
// éléments = var(--jeton) ; le texte reste lisible sur la carte et sur le bouton.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construireApparence, localisationFr } from '../src/lib/clerkApparence'
import { contraste, valeur, type Theme } from './outils/jetons'
import { lire, sansCommentaires } from './outils/sources'

const pour = (theme: Theme) => construireApparence((j) => valeur(theme, j))

test('Clerk : les variables sont les jetons résolus, dans chaque thème', () => {
  const clair = pour('light').variables!
  const nuit = pour('dark').variables!
  for (const [theme, v] of [['light', clair], ['dark', nuit]] as const) {
    assert.equal(v.colorPrimary, valeur(theme, '--accent-600'))
    assert.match(String(v.colorPrimary), /^#[0-9a-f]{6}$/, 'Clerk calcule ses nuances : une vraie couleur sRGB, jamais du display-p3')
    assert.equal(v.colorBackground, valeur(theme, '--surface-pop'))
    assert.equal(v.colorText, valeur(theme, '--text-1'))
    assert.equal(v.colorInputBackground, valeur(theme, '--surface-0'))
  }
  assert.equal(clair.colorBackground, '#ffffff')
  assert.match(String(clair.fontFamily), /Manrope/)
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
  const e = pour('light').elements as Record<string, string>
  assert.match(e.formButtonPrimary, /!\[background-image:var\(--accent-fill\)\]/)
  assert.match(e.formButtonPrimary, /!min-h-11/, 'bouton à 44 px')
  assert.match(e.formFieldInput, /!min-h-11/, 'champ à 44 px')
  assert.match(e.card, /!rounded-carte/)
  assert.match(e.headerTitle, /!font-display/, 'le titre de la carte est en serif')
  for (const [nom, classes] of Object.entries(e)) assert.equal(typeof classes, 'string', `${nom} : des classes aux jetons, pas de style écrit`)
  const src = sansCommentaires(lire('src/lib/clerkApparence.ts'))
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{3,8}\b/, 'aucune couleur en dur')
  const main = sansCommentaires(lire('src/main.tsx'))
  assert.match(main, /appearance=\{appearance\}/)
  assert.match(main, /\[theme\]/)
})

// S4 — L'écran de connexion en français : objet de traduction maison (aucune dépendance de plus).
test('Clerk en français : l\'écran de connexion et d\'inscription ne montre plus un mot d\'anglais', () => {
  const l = localisationFr as Record<string, any>
  assert.equal(l.locale, 'fr-FR')
  assert.equal(l.signIn.start.title, 'Se connecter à Synorix')
  assert.equal(l.signIn.start.actionLink, 'Créer un compte')
  assert.equal(l.signUp.start.actionLink, 'Se connecter')
  assert.equal(l.socialButtonsBlockButton, 'Continuer avec {{provider|titleize}}')
  assert.equal(l.formFieldLabel__emailAddress, 'Adresse e-mail')
  assert.equal(l.formFieldLabel__password, 'Mot de passe')
  assert.equal(l.formFieldAction__forgotPassword, 'Mot de passe oublié ?')
  // une saisie refusée ne répond plus en anglais (« Identifier is invalid. », vu sur la capture connexion-erreur)
  for (const code of ['form_param_format_invalid', 'form_param_format_invalid__email_address', 'form_password_or_identifier_incorrect', 'form_password_length_too_short']) {
    assert.ok(typeof l.unstable__errors[code] === 'string' && /[éèàç’]| /.test(l.unstable__errors[code]), code)
    assert.doesNotMatch(l.unstable__errors[code], /\binvalid\b|\bis\b|!/i, code)
  }
  assert.equal(l.formButtonPrimary, 'Continuer')
  assert.equal(l.dividerText, 'ou')
  assert.equal(l.userButton.action__signOut, 'Se déconnecter')
  // Aucune valeur anglaise courante, quelle que soit la profondeur.
  const valeurs: string[] = []
  const parcourir = (o: unknown) => {
    if (typeof o === 'string') valeurs.push(o)
    else if (o && typeof o === 'object') Object.values(o).forEach(parcourir)
  }
  parcourir(l)
  const anglais = /\b(Sign in|Sign up|Continue|Password|Email|Forgot|Don't|Already|Back|Create|Welcome)\b/
  assert.deepEqual(valeurs.filter((v) => anglais.test(v)), [])
  assert.match(sansCommentaires(lire('src/main.tsx')), /localization=\{localisationFr\}/)
})
