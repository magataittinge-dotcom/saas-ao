// Socle (bloc 10, phase B) — jetons clair et nuit : chaque jeton du système existe dans les deux thèmes,
// la palette est celle que scripts/palette-visage.mjs tire des teintes mesurées sur le visage (10/11/2026 : voir
// palette-visage.test.ts), les contrastes tiennent (texte 4,5:1, interface 3:1 ; matrice complète : contraste-palette.test.ts),
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

test('rôles de l\'accent : clair 700 / 600 / dégradé 700→600 ; nuit 300 / 500 / 600 plein ; papier blanc, page de nuit jamais noire', () => {
  const p = (n: number) => valeur('light', `--accent-${n}`)
  for (const theme of THEMES) for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) assert.match(valeur(theme, `--accent-${n}`), /^#[0-9a-f]{6}$/)
  assert.equal(valeur('light', '--accent-text'), p(700))
  assert.equal(valeur('light', '--accent-ui'), p(600))
  assert.equal(valeur('light', '--accent-fill'), `linear-gradient(110deg, ${p(700)}, ${p(600)})`)
  assert.equal(valeur('dark', '--accent-text'), p(300))
  assert.equal(valeur('dark', '--accent-ui'), p(500))
  assert.equal(valeur('dark', '--accent-fill'), `linear-gradient(110deg, ${p(600)}, ${p(600)})`)
  assert.equal(valeur('light', '--surface-0'), '#ffffff')
  assert.notEqual(valeur('dark', '--surface-page'), '#000000')
  // les canaux des lueurs suivent l'échelle
  const canaux = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')
  assert.equal(valeur('light', '--accent-rvb'), canaux(p(600)))
  assert.equal(valeur('light', '--accent-vif-rvb'), canaux(p(500)))
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
