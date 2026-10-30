// Socle (bloc 10, phase B) — jetons clair et nuit : chaque jeton du système existe dans les deux thèmes,
// l'accent est l'échelle bleue de SYSTEME-DESIGN §3.3, les contrastes tiennent (texte 4,5:1, interface 3:1),
// Tailwind ne recopie aucune couleur et ne renvoie qu'à des jetons définis.
// JETONS_TABLEAU=1 npm test -- jetons  → affiche le tableau des contrastes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { contrasteJetons, jetons, valeur, type Theme } from './outils/jetons'

const THEMES: Theme[] = ['light', 'dark']

// SYSTEME-DESIGN §9 : jetons que chaque thème doit définir.
const REQUIS = [
  'surface-0', 'surface-1', 'surface-2', 'surface-dark', 'surface-pop',
  'surface-glass-1', 'surface-glass-2', 'surface-glass-3',
  'text-1', 'text-2', 'text-3', 'text-disabled', 'text-inverse',
  'border-1', 'border-2', 'border-field', 'ring-nav',
  ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `accent-${n}`),
  'accent-text', 'accent-ui', 'accent-ring', 'accent-fill', 'accent-fill-solid', 'accent-fill-hover', 'accent-tint', 'accent-tint-2', 'on-accent',
  ...['info', 'success', 'warning', 'danger'].flatMap((k) => [`${k}-bg`, `${k}-border`, `${k}-fg`]),
  'danger-solid', 'glass-fill', 'glass-border', 'scrim',
  'font-display', 'font-ui', 'font-text', 'font-mono',
  ...['h1', 'h2', 'h3', 'h5', 'h6'].flatMap((k) => [`text-${k}`, `text-${k}-line`]),
  'space-4', 'space-8', 'space-10', 'space-12', 'space-16', 'space-20', 'space-30', 'space-40', 'space-50', 'space-100', 'space-200',
  'container', 'gutter', 'bp-tab', 'bp-desk',
  'radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-2xl', 'radius-pill', 'radius-nav',
  'shadow-cta', 'shadow-halo', 'shadow-pop', 'shadow-toast', 'shadow-card',
  'blur-xs', 'blur-sm', 'blur-md', 'blur-lg', 'blur-xl',
  'dur-instant', 'dur-fast', 'dur-base', 'dur-pop', 'dur-link', 'dur-morph', 'dur-reveal-sm', 'dur-reveal-lg',
  'ease-reveal', 'ease-pop', 'ease-expo', 'ease-link',
]

test('chaque jeton du système existe en clair et en nuit, et se résout sans renvoi cassé', () => {
  const manques: string[] = []
  for (const theme of THEMES) {
    for (const nom of REQUIS) {
      try { valeur(theme, `--${nom}`) } catch (e) { manques.push(`${theme} : ${(e as Error).message}`) }
    }
  }
  assert.deepEqual(manques, [])
})

test('les anciens noms (Lumen, Edge, Calque, shadcn) renvoient tous à un jeton qui existe, dans les deux thèmes', () => {
  const casses: string[] = []
  for (const theme of THEMES) {
    for (const nom of Object.keys(jetons(theme))) {
      try { valeur(theme, nom) } catch (e) { casses.push(`${theme} : ${(e as Error).message}`) }
    }
  }
  assert.deepEqual(casses, [])
  for (const alias of ['--bg', '--surface', '--ink', '--line', '--calque-papier', '--calque-encre', '--edge-void', '--ok', '--background', '--primary', '--sidebar-background']) {
    for (const theme of THEMES) assert.ok(valeur(theme, alias).length > 0, `${alias} (${theme})`)
  }
})

test('les surfaces, textes et l\'échelle d\'accent sont ceux de SYSTEME-DESIGN (clair mesuré, nuit neutre #111111)', () => {
  const attendu: Record<Theme, Record<string, string>> = {
    light: { 'surface-0': '#ffffff', 'surface-1': '#edf1f4', 'surface-2': '#dde5ed', 'text-1': '#1d1d1d', 'text-2': '#4d585f', 'text-disabled': '#bababa' },
    dark: { 'surface-0': '#111111', 'surface-1': '#1d1d1d', 'surface-2': '#292929', 'surface-dark': '#000000', 'text-1': '#ffffff', 'text-2': '#bababa', 'text-disabled': '#555761' },
  }
  for (const theme of THEMES) for (const [nom, v] of Object.entries(attendu[theme])) assert.equal(valeur(theme, `--${nom}`), v, `${nom} (${theme})`)
  const echelle = ['#eff7ff', '#e2effe', '#aed3fd', '#69b1ff', '#4ba3ff', '#008cf8', '#0078d6', '#0067ba', '#004e8e', '#003361']
  for (const theme of THEMES) {
    assert.deepEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => valeur(theme, `--accent-${n}`)), echelle)
  }
  // rôles : clair 700 / 600 / dégradé 700→600 ; nuit 300 / 500 / 600 plein
  assert.equal(valeur('light', '--accent-text'), '#0067ba')
  assert.equal(valeur('light', '--accent-ui'), '#0078d6')
  assert.match(valeur('light', '--accent-fill'), /^linear-gradient\(110deg, #0067ba, #0078d6\)$/)
  assert.equal(valeur('dark', '--accent-text'), '#69b1ff')
  assert.equal(valeur('dark', '--accent-ui'), '#008cf8')
  assert.equal(valeur('dark', '--accent-fill'), '#0078d6')
})

// ── Contrastes ───────────────────────────────────────────────────
const SURFACES = ['--surface-0', '--surface-1', '--surface-2']
const TEXTE: [string, string[]][] = [
  ['--text-1', SURFACES], ['--text-2', SURFACES], ['--text-3', SURFACES],
  ['--accent-text', SURFACES],
  // pastilles et messages : sur leur propre fond, sur la page et sur une carte (pas sur surface-2, réservée aux survols)
  ['--info-fg', ['--surface-0', '--surface-1', '--info-bg']], ['--success-fg', ['--surface-0', '--surface-1', '--success-bg']],
  ['--warning-fg', ['--surface-0', '--surface-1', '--warning-bg']], ['--danger-fg', ['--surface-0', '--surface-1', '--danger-bg']],
  ['--on-accent', ['--accent-fill', '--accent-fill-hover', '--primary']],
  ['--destructive-foreground', ['--destructive']],
  ['--text-inverse', ['--text-1']],
  ['--highlight-text', ['--highlight']],
  ['--text-1', ['--accent-tint', '--accent-tint-2', '--highlight-soft']],
  ['--accent-text', ['--accent-tint']],
  ['--sidebar-foreground', ['--sidebar-background']],
]
const INTERFACE: [string, string[]][] = [
  ['--border-field', SURFACES],
  ['--accent-ui', SURFACES],
  ['--accent-ring', SURFACES],
  ['--accent-fill', ['--surface-0']],
]

test('contraste : texte 4,5:1 et interface 3:1 sur chaque surface, dans les deux thèmes', () => {
  const echecs: string[] = []
  const lignes: string[] = []
  for (const theme of THEMES) {
    for (const [seuil, groupe] of [[4.5, TEXTE], [3, INTERFACE]] as const) {
      for (const [avant, fonds] of groupe) {
        for (const fond of fonds) {
          const { minimum, detail } = contrasteJetons(theme, avant, fond)
          lignes.push(`${theme.padEnd(5)} ${seuil}  ${avant} sur ${fond} : ${detail}`)
          if (minimum < seuil) echecs.push(`${theme} ${avant} sur ${fond} : ${minimum.toFixed(2)}:1 (seuil ${seuil})`)
        }
      }
    }
  }
  if (process.env.JETONS_TABLEAU) console.log(lignes.join('\n'))
  assert.deepEqual(echecs, [])
})

test('contraste : en nuit, le bouton plein (accent-600) se détache de la surface où il pose (3:1 au moins sur surface-0)', () => {
  assert.ok(contrasteJetons('dark', '--accent-fill', '--surface-0').minimum >= 3)
  assert.ok(contrasteJetons('light', '--accent-fill', '--surface-0').minimum >= 3)
})

// ── Tailwind ─────────────────────────────────────────────────────
test('tailwind.config.js : aucune couleur recopiée, seulement des jetons définis dans theme.css', () => {
  const config = sansCommentaires(lire('tailwind.config.js'))
  assert.doesNotMatch(config, /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/, 'valeur de couleur écrite dans la configuration')
  const utilises = new Set([...config.matchAll(/(?:jeton\(|var\()'?(--[\w-]+)/g)].map((m) => m[1]).filter((n) => !n.startsWith('--radix-')))
  assert.ok(utilises.size > 60, `peu de jetons référencés (${utilises.size})`)
  const absents: string[] = []
  for (const theme of THEMES) for (const nom of utilises) {
    try { valeur(theme, nom) } catch { absents.push(`${theme} ${nom}`) }
  }
  assert.deepEqual(absents, [])
  assert.match(config, /darkMode: \['selector', '\[data-theme="dark"\]'\]/)
  assert.match(config, /"Bricolage Grotesque"/)
})

test('theme.css : les valeurs de couleur n\'existent qu\'ici (le reste du CSS passe par des jetons)', () => {
  for (const f of ['src/styles/tokens.css']) {
    const css = sansCommentaires(lire(f))
    assert.doesNotMatch(css, /#[0-9A-Fa-f]{6}\b/, `${f} : couleur hexadécimale en dur`)
  }
})
