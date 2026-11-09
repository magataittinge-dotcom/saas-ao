// Socle (bloc 10, phase B) — jetons clair et nuit : chaque jeton du système existe dans les deux thèmes,
// l'accent est l'échelle bleue de SYSTEME-DESIGN §3.3 (inchangée), la palette est celle de DESIGN.md « Aurore polaire »
// (9/11/2026), les contrastes tiennent (texte 4,5:1, interface 3:1),
// Tailwind ne recopie aucune couleur et ne renvoie qu'à des jetons définis.
// JETONS_TABLEAU=1 npm test -- jetons  → affiche le tableau des contrastes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { contrasteJetons, jetons, valeur, type Theme } from './outils/jetons'

const THEMES: Theme[] = ['light', 'dark']

// SYSTEME-DESIGN §9 : jetons que chaque thème doit définir.
const REQUIS = [
  'surface-page', 'surface-0', 'surface-1', 'surface-2', 'surface-dark', 'surface-pop',
  'surface-glass-1', 'surface-glass-2', 'surface-glass-3',
  'text-1', 'text-2', 'text-3', 'text-disabled', 'text-inverse',
  'border-1', 'border-2', 'border-field', 'ring-nav',
  ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `accent-${n}`),
  'accent-text', 'accent-ui', 'accent-ring', 'accent-fill', 'accent-fill-solid', 'accent-fill-hover', 'accent-tint', 'accent-tint-2', 'on-accent',
  ...['info', 'success', 'warning', 'danger'].flatMap((k) => [`${k}-bg`, `${k}-border`, `${k}-fg`]),
  'danger-solid', 'glass-fill', 'glass-border', 'scrim',
  'font-display', 'font-memoire', 'font-ui', 'font-text', 'font-mono',
  'aurore-ink', 'aurore-mark', 'aurore-glow', 'aurore-a', 'aurore-b', 'aurore-c', 'aurore-opacite',
  'dur-survol', 'ease-survol',
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

test('les surfaces et textes sont ceux de DESIGN.md (palette A), l\'échelle d\'accent reste celle de SYSTEME-DESIGN', () => {
  const attendu: Record<Theme, Record<string, string>> = {
    light: {
      'surface-page': '#f3f7fb', 'surface-0': '#ffffff', 'surface-1': '#e8eff7', 'surface-2': '#dde6f0',
      'text-1': '#0b1728', 'text-2': '#3b4c62', 'text-3': '#56677d', 'border-1': '#d6e0ea', 'border-field': '#748296', 'gris-mark': '#7f8da0',
      'aurore-ink': '#0f7a62', 'aurore-mark': '#0f9a78',
    },
    dark: {
      'surface-page': '#060d1a', 'surface-0': '#0d1828', 'surface-1': '#13223a', 'surface-2': '#1a2c47',
      'text-1': '#eaf1fa', 'text-2': '#b4c3d6', 'text-3': '#8ea0b6', 'border-1': '#1c2a40', 'border-field': '#667a95', 'gris-mark': '#627590',
      'aurore-ink': '#5fe6bb', 'aurore-mark': '#3fd9ad',
    },
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
  assert.match(valeur('dark', '--accent-fill'), /^linear-gradient\(110deg, #0078d6, #0078d6\)$/)
})

// ── Contrastes ───────────────────────────────────────────────────
const SURFACES = ['--surface-page', '--surface-0', '--surface-1', '--surface-2']
const ETATS = ['bleu', 'vert', 'ambre', 'rouge', 'turquoise', 'gris']
const TEXTE: [string, string[]][] = [
  ['--text-1', SURFACES], ['--text-2', SURFACES], ['--text-3', SURFACES],
  ['--accent-text', SURFACES],
  // pastilles et messages : sur leur propre fond, sur la page et sur une carte (pas sur surface-2, réservée aux survols)
  // états (COULEURS.md) : ink sur la page et sur une carte (sur son soft : test dédié plus bas, le soft de nuit est translucide)
  ...ETATS.map((k): [string, string[]] => [`--${k}-ink`, ['--surface-page', '--surface-0']]),
  ['--aurore-ink', ['--surface-page', '--surface-0']],
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
  // marques d'état (barres, points, bordures) : 3:1 sur le papier des cartes, où elles se posent (COULEURS.md : « marks sur blanc ≥ 3 »)
  ...ETATS.map((k): [string, string[]] => [`--${k}-mark`, ['--surface-0']]),
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

test('contraste : le texte posé sur du verre (infobulle, en-tête, toast) se lit quelle que soit la surface dessous', () => {
  const echecs: string[] = []
  for (const theme of THEMES) for (const sur of SURFACES) for (const texte of ['--text-1', '--text-2']) {
    const { minimum } = contrasteJetons(theme, texte, '--glass-fill', sur)
    if (minimum < 4.5) echecs.push(`${theme} ${texte} sur verre/${sur} : ${minimum.toFixed(2)}:1`)
  }
  assert.deepEqual(echecs, [])
})

test('contraste : chaque pastille d\'état (ink sur son soft, posé sur la page ou une carte) se lit, dans les deux thèmes', () => {
  const echecs: string[] = []
  for (const theme of THEMES) for (const k of ETATS) for (const sur of ['--surface-page', '--surface-0']) {
    const { minimum } = contrasteJetons(theme, `--${k}-ink`, `--${k}-soft`, sur)
    if (minimum < 4.5) echecs.push(`${theme} ${k} ink sur soft/${sur} : ${minimum.toFixed(2)}:1`)
  }
  assert.deepEqual(echecs, [])
})

test('l\'accent d\'aurore n\'est pas un état : aucune pastille ni aucun jeton d\'état ne renvoie à --aurore-*', () => {
  for (const theme of THEMES) for (const k of ETATS) for (const r of ['ink', 'soft', 'mark']) {
    assert.doesNotMatch(jetons(theme)[`--${k}-${r}`] ?? '', /aurore/, `--${k}-${r}`)
  }
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
  assert.match(config, /sans:\s*\['"Manrope Variable"'/)
  assert.match(config, /display:\s*\['"Newsreader Variable"'/)
  assert.doesNotMatch(config, /Bricolage|Inter Variable/)
})

test('theme.css : les valeurs de couleur n\'existent qu\'ici (le reste du CSS passe par des jetons)', () => {
  for (const f of ['src/styles/tokens.css']) {
    const css = sansCommentaires(lire(f))
    assert.doesNotMatch(css, /#[0-9A-Fa-f]{6}\b/, `${f} : couleur hexadécimale en dur`)
  }
})
