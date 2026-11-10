// « Les couleurs viennent du visage » (DESIGN.md § Colors) : la marque ne porte que des teintes mesurées sur le visage
// (scripts/mesure-visage.mjs → scripts/visage-mesure.json), la palette est celle que calcule scripts/palette-visage.mjs,
// les échelles sont à teinte constante, l'or de marque ne se confond jamais avec l'état ambre, les états restent
// distincts pour un daltonien, les ombres sont teintées, le gamut large a un repli sRGB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'
import { jetons, valeur, type Theme } from './outils/jetons'
import { ETATS, SURFACES, THEMES, blocP3, couleursDe, jetonsP3, mesure, palette, val } from './outils/palette'
import { aplatir, dansGamut, deltaE, ecartTeinte, versOklch, vue } from '../scripts/couleur.mjs'

const T = palette.teintes
const TOLERANCE = 8          // degrés OKLCH : plus grand écart mesuré entre la teinte des ombres d'un clip et celle de l'ensemble
const ECART_DALTONIEN = 0.03 // ΔE OK minimal entre deux états vus par un deutéranope ou un protanope (1,5 fois le seuil de perception)
const ECART_OR_AMBRE = 0.07  // ΔE OK minimal entre l'or de marque et chacun des trois jetons ambre, toutes visions

/** Tolérance d'une teinte relue sur une valeur à 8 bits : l'arrondi pèse d'autant plus que la couleur est pâle. */
const marge = (C: number) => (Math.asin(Math.min(1, 0.003 / Math.max(C, 1e-6))) * 180) / Math.PI
const teinteDe = (theme: Theme, nom: string) => versOklch(couleursDe(valeur(theme, nom))[0])

test('mesure : au moins 12 images par clip, un visage presque monochrome, quatre teintes relevées', () => {
  const clips = mesure.clips.filter((c) => c.nom !== 'affiches')
  assert.ok(clips.length >= 10, `${clips.length} clips`)
  for (const c of clips) assert.ok(c.images >= 12, `${c.nom} : ${c.images} images`)
  assert.ok(mesure.ensemble.partColoree < 0.35, 'le visage est presque monochrome')
  assert.equal(T.ombres, mesure.ensemble.ombres.h)
  assert.equal(T.lumieres, mesure.ensemble.lumieres.h)
  assert.equal(T.famille, mesure.ensemble.familles[0].h)
  assert.equal(T.flamme, mesure.ensemble.familles[1].h)
  // la tolérance couvre la dispersion de la teinte des ombres d'un clip à l'autre
  const dispersion = Math.max(...mesure.clips.map((c) => ecartTeinte(c.ombres.h, T.ombres)))
  assert.ok(dispersion <= TOLERANCE, `dispersion des ombres ${dispersion.toFixed(1)}°`)
  assert.equal(palette.tolerance, TOLERANCE)
})

test('theme.css porte exactement la palette calculée par scripts/palette-visage.mjs', () => {
  const ecarts: string[] = []
  for (const [nom, f] of Object.entries(palette.commun)) for (const theme of THEMES) if (jetons(theme)[`--${nom}`] !== f.css) ecarts.push(`${theme} --${nom}`)
  for (const [nom, f] of Object.entries(palette.clair)) if (jetons('light')[`--${nom}`] !== f.css) ecarts.push(`clair --${nom}`)
  for (const [nom, f] of Object.entries(palette.nuit)) if (jetons('dark')[`--${nom}`] !== f.css) ecarts.push(`nuit --${nom}`)
  assert.deepEqual(ecarts, [], 'rejouer : node scripts/palette-visage.mjs --ecrire')
})

test('marque : chaque teinte de l\'accent, de l\'aurore, des neutres et de la flamme est une teinte mesurée (± 8°)', () => {
  const NEUTRES = ['surface-page', 'surface-1', 'surface-2', 'surface-dark', 'text-1', 'text-2', 'text-3', 'text-disabled', 'border-1', 'border-2', 'border-field']
  const attendu: [string, number][] = [
    ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n): [string, number] => [`accent-${n}`, T.famille]),
    ...NEUTRES.map((n): [string, number] => [n, T.ombres]),
    ['aurore-ink', T.ombres], ['aurore-mark', T.ombres], ['aurore-glow', T.ombres], ['aurore-a', T.ombres],
    ['aurore-b', T.lumieres], ['aurore-c', T.famille], ['flamme', T.or], ['flamme-glow', T.or],
  ]
  const hors: string[] = []
  for (const theme of THEMES) for (const [nom, teinte] of attendu) {
    const [, C, h] = teinteDe(theme, `--${nom}`)
    if (ecartTeinte(h, teinte) > TOLERANCE + marge(C)) hors.push(`${theme} --${nom} : ${h.toFixed(1)}° (attendu ${teinte}°)`)
  }
  assert.deepEqual(hors, [])
  // l'or reste dans la famille chaude mesurée
  assert.ok(ecartTeinte(T.or, T.flamme) <= TOLERANCE)
  for (const theme of THEMES) assert.ok(ecartTeinte(teinteDe(theme, '--accent-tint')[2], T.famille) <= TOLERANCE + marge(teinteDe(theme, '--accent-tint')[1]), `accent-tint ${theme}`)
})

test('marque : l\'aurore, le fil et le logo n\'empruntent aucune couleur d\'état (ni vert ni turquoise : ils ne sont pas dans le visage)', () => {
  const etat = /--(bleu|vert|ambre|rouge|turquoise|gris)-(ink|soft|mark)/
  const fil = sansCommentaires(lire('src/index.css')).match(/\.fil-aurore \{[^}]*\}/)![0]
  assert.doesNotMatch(fil, etat)
  assert.match(fil, /var\(--aurore-mark\), var\(--accent-ui\) 45%, var\(--accent-ui\) 76%, transparent 76%, transparent 81%, var\(--flamme\) 81%\)/, 'pointe d\'or sur le dernier cinquième')
  assert.doesNotMatch(sansCommentaires(lire('src/components/layout/Logo.tsx')), etat)
  assert.doesNotMatch(sansCommentaires(lire('src/components/layout/aurore.css')), etat)
  for (const theme of THEMES) for (const j of ['--aurore-a', '--aurore-b', '--aurore-c', '--aurore-mark', '--aurore-ink']) {
    const h = teinteDe(theme, j)[2]
    assert.ok(h > 225 && h < 262, `${theme} ${j} : ${h.toFixed(1)}° hors de la famille bleue du visage`)
  }
})

test('échelles à teinte constante : l\'accent et chaque couleur d\'état ne varient qu\'en clarté et en chroma', () => {
  const derive: string[] = []
  const hs = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => versOklch(valeur('light', `--accent-${n}`)))
  for (const [, C, h] of hs) if (ecartTeinte(h, T.famille) > 1 + marge(C)) derive.push(`accent : ${h.toFixed(1)}°`)
  for (const theme of THEMES) for (const k of ETATS) for (const r of ['ink', 'soft', 'mark']) {
    const [, C, h] = teinteDe(theme, `--${k}-${r}`)
    if (ecartTeinte(h, palette.teintesEtats[k]) > 1 + marge(C)) derive.push(`${theme} ${k}-${r} : ${h.toFixed(1)}° (attendu ${palette.teintesEtats[k]}°)`)
  }
  assert.deepEqual(derive, [])
  // les clartés de l'accent décroissent du palier 50 au palier 900
  for (let i = 1; i < hs.length; i++) assert.ok(hs[i][0] < hs[i - 1][0], `palier ${i}`)
})

test('neutres : jamais un gris pur (chroma > 0 sur la teinte des ombres) ; la page de nuit est le fond du visage', () => {
  for (const theme of THEMES) for (const n of ['surface-page', 'surface-1', 'surface-2', 'text-1', 'text-2', 'text-3', 'border-1', 'border-2', 'border-field', 'gris-ink', 'gris-mark']) {
    assert.ok(teinteDe(theme, `--${n}`)[1] >= 0.004, `${theme} --${n} : chroma ${teinteDe(theme, `--${n}`)[1].toFixed(4)}`)
  }
  for (const n of ['surface-0', 'surface-1', 'surface-2']) assert.ok(teinteDe('dark', `--${n}`)[1] >= 0.015, `nuit --${n}`)
  const page = teinteDe('dark', '--surface-page')
  assert.ok(Math.abs(page[0] - mesure.ensemble.fond.L) < 0.01, 'clarté de la page de nuit = clarté du fond des clips')
  assert.ok(ecartTeinte(page[2], mesure.ensemble.fond.h) <= TOLERANCE + marge(page[1]))
})

test('états : même famille de clarté par rôle (bande de ± 0,065), la teinte seule change', () => {
  for (const theme of THEMES) for (const r of ['ink', 'mark']) {
    const L = ETATS.map((k) => teinteDe(theme, `--${k}-${r}`)[0])
    const milieu = L[0] // le bleu porte la clarté commune
    ETATS.forEach((k, i) => assert.ok(Math.abs(L[i] - milieu) <= 0.065, `${theme} ${k}-${r} : ${L[i].toFixed(3)} contre ${milieu.toFixed(3)}`))
  }
  for (const k of ETATS) assert.ok(Math.abs(teinteDe('light', `--${k}-soft`)[0] - 0.955) < 0.01, `clair ${k}-soft`)
})

test('une seule palette d\'états : info / success / warning / danger sont de simples alias des six sens (bg = soft, fg = ink, border = mark)', () => {
  const SENS = { info: 'bleu', success: 'vert', warning: 'ambre', danger: 'rouge' }
  const ROLES = { bg: 'soft', fg: 'ink', border: 'mark' }
  for (const theme of THEMES) for (const [ancien, sens] of Object.entries(SENS)) for (const [role, r] of Object.entries(ROLES)) {
    const alias = `--${ancien}-${role}`
    const cible = `--${sens}-${r}`
    assert.equal(jetons(theme)[alias], `var(${cible})`, `${theme} ${alias} : écrit comme un alias`)
    assert.equal(valeur(theme, alias), valeur(theme, cible), `${theme} ${alias} vaut ${cible}`)
    // le script ne calcule la valeur qu'une fois : la fiche de l'alias est celle du sens
    const table = theme === 'light' ? palette.clair : palette.nuit
    assert.equal(table[`${ancien}-${role}`].css, `var(${cible})`)
    assert.equal(table[`${ancien}-${role}`].hex, table[`${sens}-${r}`].hex)
  }
  // les relais des anciens thèmes (Lumen, Edge, Calque) suivent : ils valent eux aussi le sens
  const RELAIS: [string, string][] = [
    ['--ok', '--vert-ink'], ['--ok-bg', '--vert-soft'], ['--ok-line', '--vert-mark'],
    ['--warn', '--ambre-ink'], ['--warn-bg', '--ambre-soft'], ['--warn-line', '--ambre-mark'],
    ['--bad', '--rouge-ink'], ['--bad-bg', '--rouge-soft'], ['--bad-line', '--rouge-mark'],
    ['--edge-success', '--vert-ink'], ['--edge-warning', '--ambre-ink'], ['--edge-danger', '--rouge-ink'],
    ['--calque-ok', '--vert-ink'], ['--calque-attention', '--ambre-ink'], ['--calque-bloquant', '--rouge-ink'],
  ]
  for (const theme of THEMES) for (const [relais, cible] of RELAIS) assert.equal(valeur(theme, relais), valeur(theme, cible), `${theme} ${relais}`)
  // les trois fonds de Calque se lisaient opaques : ils valent le soft du sens, posé sur le papier quand il est translucide (nuit)
  for (const theme of THEMES) for (const [relais, cible] of [['--calque-ok-fond', '--vert-soft'], ['--calque-attention-fond', '--ambre-soft'], ['--calque-bloquant-fond', '--rouge-soft']]) {
    assert.equal(valeur(theme, relais), aplatir(valeur(theme, cible), valeur(theme, '--surface-0')), `${theme} ${relais}`)
  }
  // plus aucune couleur de la seconde palette n'est écrite en dur : seul --danger-solid (l'aplat du rouge plein) garde sa valeur
  const css = sansCommentaires(lire('src/styles/theme.css'))
  assert.doesNotMatch(css, /--(info|success|warning|danger)-(bg|fg|border):\s*(#|rgb)/)
})

test('états : distincts pour un daltonien (deutéranope et protanope), ink et mark, clair et nuit', () => {
  const proches: string[] = []
  for (const theme of THEMES) for (const r of ['ink', 'mark']) for (const type of ['deuteranope', 'protanope'] as const) {
    const vus = ETATS.map((k) => vue(couleursDe(valeur(theme, `--${k}-${r}`))[0], type))
    for (let i = 0; i < ETATS.length; i++) for (let j = i + 1; j < ETATS.length; j++) {
      const e = deltaE(vus[i], vus[j])
      if (e < ECART_DALTONIEN) proches.push(`${theme} ${r} ${type} ${ETATS[i]} / ${ETATS[j]} : ${e.toFixed(3)}`)
    }
  }
  assert.deepEqual(proches, [])
})

test('or de marque : jamais confondu avec l\'ambre « à surveiller » (écart mesuré), et jamais un texte, une pastille ni une barre', () => {
  const proches: string[] = []
  for (const theme of THEMES) {
    const fond = valeur(theme, '--surface-0')
    for (const type of [null, 'deuteranope', 'protanope'] as const) for (const r of ['ink', 'soft', 'mark']) {
      const e = deltaE(vue(valeur(theme, '--flamme'), type), vue(aplatir(valeur(theme, `--ambre-${r}`), fond), type))
      if (e < ECART_OR_AMBRE) proches.push(`${theme} ${type ?? 'normale'} ambre-${r} : ${e.toFixed(3)}`)
    }
    // teinte : l'or est mesuré (flamme), l'ambre est un sens tenu à l'écart
    assert.ok(ecartTeinte(teinteDe(theme, '--flamme')[2], teinteDe(theme, '--ambre-mark')[2]) >= 12, `${theme} : teintes or / ambre`)
  }
  assert.deepEqual(proches, [])
  // l'or n'est que de la lumière : la braise du logo, la pointe du fil d'aurore, l'éclat du halo du visage (index.css),
  // et la page /design ; aucune classe Tailwind, aucun autre fichier (la lueur d'aube est retirée : l'aurore n'a que du bleu)
  const usages = [...fichiersSource('src'), 'src/index.css', 'src/styles/tokens.css', 'src/styles/pieces.css', 'src/components/layout/aurore.css', 'tailwind.config.js']
    .filter((f) => /flamme|aurore-aube/.test(sansCommentaires(lire(f))))
  assert.deepEqual(usages.sort(), ['src/components/layout/Logo.tsx', 'src/index.css', 'src/routes/Design.tsx'])
  const feuille = sansCommentaires(lire('src/index.css'))
  const regles = [...feuille.matchAll(/([^{}]+)\{([^{}]*var\(--flamme\)[^{}]*)\}/g)]
  assert.deepEqual(regles.map((m) => m[1].trim()).sort(), ['.eclat-or', '.fil-aurore'])
  // jamais un texte, un fond de bouton ni une bordure : l'or ne passe que par un dégradé de fond décoratif
  for (const m of regles) assert.doesNotMatch(m[2], /(^|[;\s])(color|border(-\w+)?|background-color)\s*:[^;]*flamme/)
  assert.equal(sansCommentaires(lire('src/components/mesao/VisagePetit.tsx')).match(/className="eclat-or"/g)?.length, 1)
  assert.doesNotMatch([...fichiersSource('src')].map((f) => lire(f)).join('\n'), /(text|bg|border|ring|fill|stroke)-flamme/)
  for (const theme of THEMES) for (const k of ETATS) for (const r of ['ink', 'soft', 'mark']) assert.doesNotMatch(jetons(theme)[`--${k}-${r}`], /flamme|aurore/)
})

test('gamut large : bloc display-p3 gardé par @media et @supports, même teinte que le repli, plus de chroma, jetons lus par le code intacts', () => {
  assert.match(blocP3, /@media \(color-gamut: p3\) \{\s*@supports \(color: color\(display-p3 1 1 1\)\) \{/)
  for (const theme of THEMES) {
    const p3 = jetonsP3(theme)
    assert.deepEqual(Object.keys(p3).sort(), ['--accent-fill', '--accent-fill-hover', '--accent-ring', '--accent-vif'])
    for (const nom of Object.keys(p3)) {
      const large = couleursDe(p3[nom]).map(versOklch)
      const repli = couleursDe(val(theme, nom, 'srgb')).map(versOklch)
      assert.equal(large.length, repli.length, `${theme} ${nom}`)
      large.forEach((c, i) => {
        assert.ok(ecartTeinte(c[2], repli[i][2]) <= 1.5, `${theme} ${nom} : teinte ${c[2].toFixed(1)}° contre ${repli[i][2].toFixed(1)}°`)
        assert.ok(Math.abs(c[0] - repli[i][0]) <= 0.005, `${theme} ${nom} : même clarté`)
        assert.ok(c[1] >= repli[i][1] - 0.002, `${theme} ${nom} : chroma au moins égale`)
        assert.ok(dansGamut(c, 'p3'), `${theme} ${nom} : dans le gamut display-p3`)
      })
    }
  }
  // Clerk et le dessin du visage lisent ces jetons en JavaScript et attendent du sRGB : ils ne passent pas en display-p3
  assert.doesNotMatch(blocP3, /--accent-(\d+|ui|text|fill-solid|tint)\s*:/)
  // le repli est écrit hors de tout @media : il s'applique seul
  for (const theme of THEMES) for (const n of ['--accent-fill', '--accent-ring', '--accent-vif']) assert.ok(couleursDe(valeur(theme, n)).every((c) => c.startsWith('#')), `${theme} ${n}`)
})

test('ombres teintées et filet de lumière : aucun noir neutre, un jeton pour le filet d\'un pixel, aucune ombre colorée en nuit hors aurore et visage', () => {
  const css = sansCommentaires(lire('src/styles/theme.css'))
  assert.doesNotMatch(css, /rgba\(0, 0, 0/, 'ombre en noir neutre')
  for (const theme of THEMES) {
    for (const o of ['--shadow-card', '--shadow-pop', '--shadow-toast']) assert.match(jetons(theme)[o], /rgba\(var\(--ombre-rvb\)/, `${theme} ${o}`)
    const [r, g, b] = valeur(theme, '--ombre-rvb').split(',').map(Number)
    assert.ok(b > r && g >= r && b > 0, `${theme} --ombre-rvb teintée (${r}, ${g}, ${b})`)
    assert.equal(jetons(theme)['--edge-light'], 'inset 0 1px 0 var(--filet-lumiere)')
    assert.match(valeur(theme, '--filet-lumiere'), /^rgba\(/)
    assert.match(valeur(theme, '--shadow-cta'), /^inset 0 1px 0 rgba\(255, 255, 255/)
  }
  // P25 : en nuit, le bouton principal n'a ni ombre ni lueur ; il se détache par son aplat et par le filet de lumière d'un pixel
  assert.equal(jetons('dark')['--shadow-cta'], 'inset 0 1px 0 rgba(255, 255, 255, .22)', 'en nuit, le bouton principal ne porte que son reflet')
  assert.equal(jetons('dark')['--shadow-halo'], 'none')
  // … et aucune ombre ni lueur de nuit n'est colorée : l'aurore et le halo du visage (--aurore-glow, --flamme-glow) sont les seules lumières
  const colorees: string[] = []
  for (const nom of Object.keys(jetons('dark')).filter((n) => /shadow|glow|halo|lueur/.test(n) && !/^--(aurore|flamme)-/.test(n))) {
    assert.doesNotMatch(jetons('dark')[nom], /accent/, `nuit ${nom} : teinté par l'accent`)
    for (const c of couleursDe(valeur('dark', nom))) if (versOklch(c)[1] > 0.04) colorees.push(`nuit ${nom} : ${c}`)
  }
  assert.deepEqual(colorees, [])
  // le clair garde son ombre bleue, décalée et douce, sous le seul bouton principal
  assert.match(jetons('light')['--shadow-cta'], /0 8px 18px -8px rgba\(var\(--accent-rvb\), \.55\)$/)
  assert.match(jetons('dark')['--shadow-pop'], /inset 0 1px 0 var\(--filet-lumiere\)/)
  // en nuit, les accents sont plus clairs qu'en clair
  for (const j of ['--accent-text', '--accent-ring', '--aurore-mark', '--aurore-ink', ...ETATS.flatMap((k) => [`--${k}-ink`, `--${k}-mark`])]) {
    assert.ok(teinteDe('dark', j)[0] > teinteDe('light', j)[0] + 0.03, `${j} plus clair en nuit`)
  }
  assert.ok(SURFACES.length === 4)
})
