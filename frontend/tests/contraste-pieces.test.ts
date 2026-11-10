// T5 a, b, c — contrastes calculés depuis les jetons (clair et nuit), pas mesurés sur capture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrasteJetons, valeur, type Theme } from './outils/jetons'
import { lire, sansCommentaires } from './outils/sources'

const THEMES: Theme[] = ['light', 'dark']

test('ExpiryAlert : texte >= 4,5:1 sur son fond opaque, quel que soit l\'écran dessous (a)', () => {
  const code = sansCommentaires(lire('src/components/common/ExpiryAlert.tsx'))
  assert.doesNotMatch(code, /color-mix|#[0-9a-f]{3,8}\b|rgba?\(/i)       // jetons seulement
  // COULEURS.md : rouge si la validité est dépassée, ambre à renouveler bientôt. Le fond « soft » est translucide en nuit : il est posé
  // sur la surface de la page et sur celle d'une carte.
  const message = sansCommentaires(lire('src/components/ui/message.tsx'))
  const paires: [string, string][] = [['--rouge-ink', '--rouge-soft'], ['--ambre-ink', '--ambre-soft']]
  for (const [texte, fond] of paires) {
    // l'alerte est le Message du système : icône à l'encre de l'état, fond « soft » du même état (components/ui/message.tsx)
    assert.ok(code.includes('<Message ton={isExpired ? \'erreur\' : \'attention\'}>'), 'ExpiryAlert passe par Message')
    assert.ok(message.includes(`bg-${fond.slice(2)}`) && message.includes(`text-${texte.slice(2)}`), `${texte} sur ${fond}`)
    for (const theme of THEMES) for (const sur of ['--surface-0', '--surface-1']) {
      const { minimum } = contrasteJetons(theme, texte, fond, sur)
      assert.ok(minimum >= 4.5, `${theme} ${texte} sur ${fond} (posé sur ${sur}) : ${minimum.toFixed(2)}:1`)
    }
  }
})

test('.signature-btn et boutons d\'accent : plus de rgba écrit en dur dans index.css (b)', () => {
  const css = sansCommentaires(lire('src/index.css'))
  const debut = css.indexOf('.btn-primary,')
  const bloc = css.slice(debut, css.indexOf('.btn-glass', debut))
  assert.doesNotMatch(bloc, /rgba?\(/)
  assert.doesNotMatch(css.slice(css.indexOf('.logo-synorix {')), /^[^}]*rgba?\(/)
  for (const theme of THEMES) assert.match(valeur(theme, '--reflet-accent'), /^rgba\(255, 255, 255, \.22\)$/)
})

test('infobulles de la coquille : une surface flottante pleine (plus de verre ni de flou), texte >= 4,5:1 dans les deux thèmes', () => {
  const code = sansCommentaires(lire('src/components/ui/tooltip.tsx'))
  assert.match(code, /bg-surface-pop/)
  assert.doesNotMatch(code, /backdrop-blur|glass-fill/)
  assert.match(code, /text-fg\b/)
  for (const theme of THEMES) {
    const { minimum } = contrasteJetons(theme, '--text-1', '--surface-pop')
    assert.ok(minimum >= 4.5, `${theme} texte de l'infobulle : ${minimum.toFixed(2)}:1`)
  }
})
