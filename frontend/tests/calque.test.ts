// Nuit du 23/10 — thème clair « Calque » sur la coquille (barre latérale,
// en-tête, palette ⌘K) et le tableau de bord : contrastes vérifiés, chaque
// couleur définie à un seul endroit (styles/tokens.css), photo du compte en
// haut à droite, palette qui mène partout où mène la barre latérale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

// Les couleurs Calque sont désormais des alias des jetons du système (styles/theme.css) :
// on les résout dans les deux thèmes et on mesure le contraste réel.
import { contrasteJetons, type Theme } from './outils/jetons'

test('Calque : chaque couleur de texte atteint 4,5:1 sur les fonds où elle se pose, en clair comme en nuit', () => {
  const paires: [string, string[]][] = [
    ['encre', ['papier', 'surface', 'surface-2', 'prusse-50', 'attention-fond']],
    ['encre-2', ['papier', 'surface', 'surface-2']],
    ['encre-3', ['papier', 'surface', 'surface-2']],
    ['prusse-700', ['papier', 'surface', 'surface-2', 'prusse-50']],
    ['ok', ['ok-fond', 'surface']],
    ['attention', ['attention-fond', 'surface', 'papier']],
    ['bloquant', ['bloquant-fond', 'surface', 'papier']],
    ['sur-encre', ['encre']],
  ]
  const faibles: string[] = []
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const [texte, fonds] of paires) for (const f of fonds) {
      const { minimum } = contrasteJetons(theme, `--calque-${texte}`, `--calque-${f}`)
      if (minimum < 4.5) faibles.push(`${theme} ${texte} sur ${f} : ${minimum.toFixed(2)}:1`)
    }
    // le bord des champs reste visible (seuil 3:1 des composants)
    for (const f of ['surface', 'papier']) {
      assert.ok(contrasteJetons(theme, '--calque-ligne-champ', `--calque-${f}`).minimum >= 3, `${theme} bord des champs sur ${f}`)
    }
  }
  assert.deepEqual(faibles, [])
})

const FICHIERS_CALQUE = [
  'src/components/layout/Layout.tsx',
  'src/components/layout/Sidebar.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/CommandPalette.tsx',
  'src/components/layout/QuotaGauge.tsx',
  'src/components/layout/NotificationBell.tsx',
  'src/components/layout/LegalFooter.tsx',
  'src/routes/Dashboard.tsx',
  'src/components/onboarding/FirstAOWelcome.tsx',
]

test('coquille et tableau de bord : aucune couleur écrite en dur, tout passe par les jetons', () => {
  const enDur = FICHIERS_CALQUE.flatMap((f) => {
    const code = sansCommentaires(lire(f))
    return [...code.matchAll(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])|rgba?\(|hsla?\(/g)].map((m) => `${f} : ${m[0]}`)
  })
  assert.deepEqual(enDur, [])
})

test('les couleurs Calque de Tailwind renvoient toutes à un jeton défini dans theme.css, sans valeur recopiée', () => {
  const config = lire('tailwind.config.js')
  const utilises = [...config.matchAll(/jeton\('--calque-([\w-]+)'\)/g)].map((m) => m[1])
  assert.ok(utilises.length >= 20)
  const THEME = lire('src/styles/theme.css')
  const absents = utilises.filter((nom) => !new RegExp(`--calque-${nom}:`).test(THEME))
  assert.deepEqual(absents, [])
  for (const hex of ['#F6F5F1', '#16191E', '#1F4E79', '#FFE066']) {
    assert.ok(!config.includes(hex), `${hex} recopié dans tailwind.config.js`)
  }
})

test("l'avatar en haut à droite montre la photo du compte, et les initiales sans photo", () => {
  const code = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(code, /const \{ user: compte \} = useUser\(\)/)
  assert.match(code, /const photo = compte\?\.hasImage && compte\.imageUrl !== photoEnEchec \? compte\.imageUrl : null/)
  assert.match(code, /\{photo\s*\?\s*<img src=\{photo\} alt="" [^>]*onError=\{\(\) => setPhotoEnEchec\(photo\)\} \/>\s*:\s*initials\}/)
})

test('la palette ⌘K s\'ouvre au clavier et mène partout où mène la barre latérale', () => {
  const palette = sansCommentaires(lire('src/components/layout/CommandPalette.tsx'))
  assert.match(palette, /e\.key\.toLowerCase\(\) === 'k' && \(e\.metaKey \|\| e\.ctrlKey\)/)
  assert.match(palette, /aller\(`\/projects\/\$\{p\.id\}`\)/)
  const barre = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  const routes = [...barre.matchAll(/to: '(\/[\w/-]+)'/g)].map((m) => m[1])
  assert.ok(routes.length >= 8)
  const sansAcces = routes.filter((r) => !palette.includes(`'${r}'`))
  assert.deepEqual(sansAcces, [])
  // le bouton de l'en-tête ouvre la palette (et n'est pas l'ancienne « recherche » sans action)
  const entete = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(entete, /onClick=\{onSearch\}/)
})

test('barre latérale shadcn : préférence en localStorage, aucun cookie posé', () => {
  assert.ok(!sansCommentaires(lire('src/components/ui/sidebar.tsx')).includes('document.cookie'))
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /localStorage\.setItem\(CLE_OUVERTURE/)
  assert.match(layout, /const PAGES_CALQUE = \['\/dashboard'\]/)
})
