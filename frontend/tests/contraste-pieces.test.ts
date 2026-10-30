// T5 a, b, c — contrastes calculés depuis les jetons (clair et nuit), pas mesurés sur capture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrasteJetons, valeur, type Theme } from './outils/jetons'
import { lire, sansCommentaires } from './outils/sources'

const THEMES: Theme[] = ['light', 'dark']

test('ExpiryAlert : texte >= 4,5:1 sur son fond opaque, quel que soit l\'écran dessous (a)', () => {
  const code = sansCommentaires(lire('src/components/common/ExpiryAlert.tsx'))
  assert.doesNotMatch(code, /color-mix|#[0-9a-f]{3,8}\b|rgba?\(/i)       // jetons seulement, fonds opaques
  const paires: [string, string][] = [['--danger-fg', '--danger-bg'], ['--text-2', '--surface-1']]
  for (const [texte, fond] of paires) {
    assert.ok(code.includes(`color: 'var(${texte})'`) && code.includes(`background: 'var(${fond})'`), `${texte} sur ${fond}`)
    for (const theme of THEMES) {
      const { minimum } = contrasteJetons(theme, texte, fond)
      assert.ok(minimum >= 4.5, `${theme} ${texte} sur ${fond} : ${minimum.toFixed(2)}:1`)
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

test('infobulles de la coquille : texte visible >= 4,5:1 sur le verre, sur toute surface (c)', () => {
  const code = sansCommentaires(lire('src/components/ui/tooltip.tsx'))
  assert.match(code, /bg-\[var\(--glass-fill\)\]/)
  assert.match(code, /text-fg\b/)
  for (const theme of THEMES) {
    for (const sur of ['--surface-0', '--surface-1', '--surface-2', '--surface-dark']) {
      const { minimum } = contrasteJetons(theme, '--text-1', '--glass-fill', sur)
      assert.ok(minimum >= 4.5, `${theme} texte sur verre posé sur ${sur} : ${minimum.toFixed(2)}:1`)
    }
  }
})
