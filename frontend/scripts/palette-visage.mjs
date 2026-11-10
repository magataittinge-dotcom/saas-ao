// Palette de marque reconstruite à partir des teintes mesurées sur le visage (scripts/visage-mesure.json).
//
//   node scripts/palette-visage.mjs            → calcule, écrit scripts/palette-visage.json, affiche le résumé
//   node scripts/palette-visage.mjs --ecrire   → reporte aussi les valeurs dans src/styles/theme.css (noms de jetons inchangés)
//   node scripts/palette-visage.mjs --md <dossier> → écrit aussi PALETTE.md et palette.svg dans ce dossier
//
// Règles (DESIGN.md § Colors) :
//   - quatre teintes, toutes mesurées : OMBRES (neutres, nuit, ombres portées, lumière d'aurore), LUMIERES (filet de lumière,
//     ruban clair de l'aurore), FAMILLE (la seule teinte colorée du verre : couleur d'action), FLAMME (la braise, rare) ;
//   - chaque échelle est à TEINTE CONSTANTE : seules la clarté et la chroma varient (OKLCH) ; une chroma hors gamut est
//     réduite sans toucher à la teinte ni à la clarté ;
//   - les six couleurs d'état partagent la clarté de leurs `ink`, de leurs `soft`, de leurs `mark` : la teinte seule change ;
//   - les clartés sensibles sont RÉSOLUES sur le contraste (WCAG 2) au lieu d'être choisies à l'œil.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromaMax, contraste, daltonien, deltaE, lineaireVersOklab, lire, oklchVersHex, oklchVersP3, ramener, versGamma, versOklch } from './couleur.mjs'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const THEME = path.resolve(ICI, '..', 'src', 'styles', 'theme.css')
const mesure = JSON.parse(readFileSync(path.join(ICI, 'visage-mesure.json'), 'utf8')).ensemble

// ── Les teintes mesurées ─────────────────────────────────────────
export const TEINTES = {
  ombres: mesure.ombres.h,          // 10 % les plus sombres du sujet
  lumieres: mesure.lumieres.h,      // 10 % les plus clairs
  famille: mesure.familles[0].h,    // la famille colorée dominante du verre
  flamme: mesure.familles[1].h,     // la braise (rare) : famille chaude des pixels colorés
  or: mesure.teintes.find((t) => t.C > 0.06).h,   // l'or : la teinte dominante chaude (k-moyennes), partie claire de la flamme
}
// Teintes fonctionnelles des états qui ne sont pas dans le visage : elles ne sont PAS la marque (jamais sur l'aurore, le logo, l'accent).
// L'ambre (« à surveiller ») est un sens, pas la marque : il est tenu à l'écart de l'or (teinte plus orangée, clartés d'état).
export const TEINTES_ETATS = { bleu: TEINTES.famille, vert: 152, ambre: 62, rouge: 27, turquoise: 196, gris: TEINTES.ombres }
export const TOLERANCE_TEINTE = 8   // degrés OKLCH : plus grand écart mesuré entre la teinte des ombres d'un clip et celle de l'ensemble (7,6°)

const arr = (v, n = 3) => Number(v.toFixed(n))
const rvb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const rgba = (hex, a) => `rgba(${rvb(hex).join(', ')}, ${String(a).replace(/^0\./, '.')})`
const H = TEINTES

/** Une couleur du système : spécification OKLCH (avant réduction au gamut) + valeur sRGB (#hex ou rgba). */
function couleur(L, C, h, source, alpha) {
  const lch = ramener([L, C, h], 'srgb')
  const hex = oklchVersHex(lch)
  return { oklch: [arr(L), arr(lch[1]), arr(h, 1)], hex, css: alpha === undefined ? hex : rgba(hex, alpha), source }
}
const plafond = (L, h, cible, part = 0.95) => Math.min(cible, chromaMax(L, h, 'srgb') * part)

/** Cherche la clarté la plus proche du départ qui satisfait `ok`, en avançant de `pas` (négatif : vers le sombre). */
function resoudre(depart, pas, ok) {
  let L = depart
  for (let i = 0; i < 200 && !ok(L); i++) L += pas
  return arr(L)
}
const poseSur = (c, fond) => {   // couleur translucide posée sur un fond opaque → #hex
  const { lin, a } = lire(c)
  if (a >= 1) return c
  const f = lire(fond).lin
  return '#' + [0, 1, 2].map((i) => Math.round((versGamma(lin[i]) * a + versGamma(f[i]) * (1 - a)) * 255).toString(16).padStart(2, '0')).join('')
}

// ── Accent (couleur d'action) : teinte de la famille, constante ──
const blanc = '#ffffff'
function palier(L, C, Cp3) {
  const c = couleur(L, C, H.famille, 'famille')
  const p3 = ramener([L, Cp3, H.famille], 'p3')
  return { ...c, p3: oklchVersP3(p3), oklchP3: [arr(L), arr(p3[1]), arr(H.famille, 1)] }
}
const accent = {}
const ECHELLE = { 50: [0.972, 0.014], 100: [0.945, 0.03], 200: [0.875, 0.07], 300: [0.77, 0.125], 400: [0.71, 0.155], 500: [0.65, 0.19], 800: [0.4, 0.14], 900: [0.3, 0.1] }
for (const [n, [L, C]] of Object.entries(ECHELLE)) accent[n] = palier(L, C, C + (L < 0.85 && L > 0.45 ? 0.04 : 0))

// ── Neutres : teinte des ombres ──────────────────────────────────
const n = (L, C) => couleur(L, C, H.ombres, 'ombres')
const clair = {
  'surface-page': n(0.975, 0.008), 'surface-0': { oklch: [1, 0, 0], hex: blanc, css: blanc, source: 'papier (blanc : la lumière elle-même)' },
  'surface-1': n(0.945, 0.012), 'surface-2': n(0.915, 0.016), 'surface-dark': n(0.19, 0.03),
  'surface-pop': { oklch: [1, 0, 0], hex: blanc, css: blanc, source: 'papier' },
  'text-1': n(0.19, 0.03), 'text-2': n(0.4, 0.035), 'text-3': n(0.49, 0.035), 'text-disabled': n(0.76, 0.02),
  'text-inverse': { oklch: [1, 0, 0], hex: blanc, css: blanc, source: 'papier' },
  'border-1': n(0.895, 0.016), 'border-2': n(0.84, 0.022), 'border-field': n(0.59, 0.03),
}
const nuit = {
  'surface-page': n(mesure.fond.L, 0.016),   // le vide derrière le visage : la page de nuit EST le fond des clips
  // surfaces : chroma au-dessus de celle des ombres mesurées (0,021), pour que la nuit lise bleu pétrole et non gris ardoise
  'surface-0': n(0.205, 0.027), 'surface-1': n(0.25, 0.033), 'surface-2': n(0.295, 0.038), 'surface-dark': n(0.12, 0.014),
  'surface-pop': n(0.25, 0.033),
  'text-1': n(0.96, 0.01), 'text-2': n(0.825, 0.025), 'text-3': n(0.715, 0.03), 'text-disabled': n(0.46, 0.03),
  'text-inverse': n(0.19, 0.03),
  'border-1': n(0.285, 0.034), 'border-2': n(0.37, 0.04), 'border-field': n(0.6, 0.035),
}
const SURFACES = ['surface-page', 'surface-0', 'surface-1', 'surface-2']
const fonds = (t) => SURFACES.map((s) => t[s].hex)

// Paliers résolus : 600 porte le texte blanc (4,5:1) ; 700 est le texte d'accent du thème clair (4,5:1 jusque sur la glace profonde)
const MARGE = 0.08
{
  const L600 = resoudre(0.6, -0.002, (L) => { const p = palier(L, 0.19, 0.225); return contraste(blanc, p.hex) >= 4.5 + MARGE && contraste(blanc, p.p3) >= 4.5 + MARGE })
  accent[600] = palier(L600, 0.19, 0.225)
  const L700 = resoudre(Math.min(0.53, L600 - 0.04), -0.002, (L) => { const p = palier(L, 0.175, 0.2); return fonds(clair).every((f) => contraste(p.hex, f) >= 4.5 + MARGE) })
  accent[700] = palier(L700, 0.175, 0.2)
  // 300 : texte d'accent de nuit ; 500 : interface de nuit (3:1 sur la glace profonde)
  const L500 = resoudre(0.64, 0.002, (L) => { const p = palier(L, 0.19, 0.23); return fonds(nuit).every((f) => contraste(p.hex, f) >= 3 + MARGE) })
  accent[500] = palier(L500, 0.19, 0.23)
}

// ── Lumière d'aurore (teinte des ombres et du halo), flamme (rare) ─
Object.assign(clair, {
  'aurore-ink': couleur(resoudre(0.5, -0.002, (L) => fonds(clair).every((f) => contraste(couleur(L, 0.1, H.ombres).hex, f) >= 4.5 + MARGE)), 0.1, H.ombres, 'ombres'),
  'aurore-mark': couleur(resoudre(0.64, -0.002, (L) => fonds(clair).every((f) => contraste(couleur(L, 0.125, H.ombres).hex, f) >= 3 + MARGE)), 0.125, H.ombres, 'ombres'),
  'aurore-glow': couleur(0.72, 0.12, H.ombres, 'ombres', 0.22),
  'aurore-a': couleur(0.78, 0.12, H.ombres, 'ombres', 0.55),
  'aurore-b': couleur(0.86, 0.07, H.lumieres, 'lumieres', 0.45),
  'aurore-c': couleur(0.68, 0.16, H.famille, 'famille', 0.4),
  'aurore-aube': couleur(0.84, 0.12, H.or, 'or (flamme)', 0.2),
  'accent-tint': null, 'accent-tint-2': null,
})
Object.assign(nuit, {
  'aurore-ink': couleur(0.87, 0.09, H.ombres, 'ombres'),
  'aurore-mark': couleur(0.81, 0.115, H.ombres, 'ombres'),
  'aurore-glow': couleur(0.81, 0.115, H.ombres, 'ombres', 0.22),
  'aurore-a': couleur(0.76, 0.13, H.ombres, 'ombres', 0.5),
  'aurore-b': couleur(0.84, 0.08, H.lumieres, 'lumieres', 0.38),
  'aurore-c': couleur(0.62, 0.19, H.famille, 'famille', 0.5),
  'aurore-aube': couleur(0.8, 0.15, H.or, 'or (flamme)', 0.28),
  'accent-tint': couleur(0.27, 0.045, H.famille, 'famille'),
  'accent-tint-2': couleur(0.33, 0.07, H.famille, 'famille'),
})

// ── États : même famille de clarté et de chroma pour tous les ink, tous les soft, tous les mark ; la teinte change ──
// Une clarté strictement égale rend deux états indiscernables pour un daltonien (turquoise et gris se confondent, rouge, vert
// et ambre aussi : il ne lui reste que l'axe bleu-jaune et la clarté). Chaque état reçoit donc un petit décalage de clarté,
// dans une bande de ± 0,04 autour de la clarté commune : le rouge un peu plus sombre, l'ambre un peu plus clair, etc.
const ETATS = Object.keys(TEINTES_ETATS)
export const DECALAGE = { bleu: 0, vert: 0.025, ambre: 0.04, rouge: -0.04, turquoise: -0.03, gris: 0.04 }
const DECALAGE_NUIT = { ...DECALAGE, gris: -0.06 }   // en nuit, le gris est l'état en retrait : il n'éclaire pas
const C_ETAT = (k, cible) => (k === 'gris' ? Math.min(cible, 0.02) : cible)
const source = (k) => (k === 'bleu' ? 'famille' : k === 'gris' ? 'ombres' : 'fonction (un sens, pas la marque)')
function etats(theme, estNuit) {
  const surf = fonds(theme)
  const dec = estNuit ? DECALAGE_NUIT : DECALAGE
  const h = (k) => TEINTES_ETATS[k]
  const soft = (k, L0) => (estNuit
    ? couleur(L0 + dec[k], plafond(L0 + dec[k], h(k), C_ETAT(k, 0.17)), h(k), source(k), 0.14)
    : couleur(0.955, plafond(0.955, h(k), k === 'gris' ? 0.008 : 0.03), h(k), source(k)))
  const ink = (k, L0) => couleur(L0 + dec[k], plafond(L0 + dec[k], h(k), C_ETAT(k, estNuit ? 0.12 : 0.15)), h(k), source(k))
  const mark = (k, L0) => couleur(L0 + dec[k], plafond(L0 + dec[k], h(k), C_ETAT(k, estNuit ? 0.17 : 0.19)), h(k), source(k))
  const Lmark = resoudre(estNuit ? 0.72 : 0.54, estNuit ? 0.002 : -0.002, (L) => ETATS.every((k) => surf.every((f) => contraste(mark(k, L).hex, f) >= 3 + MARGE && contraste(mark(k, L).hex, poseSur(soft(k, L).css, f)) >= 3 + MARGE)))
  const Link = resoudre(estNuit ? 0.835 : 0.43, estNuit ? 0.002 : -0.002, (L) => ETATS.every((k) => surf.every((f) => contraste(ink(k, L).hex, f) >= 4.5 + MARGE && contraste(ink(k, L).hex, poseSur(soft(k, Lmark).css, f)) >= 4.5 + MARGE)))
  const sortie = { clartes: { ink: Link, mark: Lmark } }
  for (const k of ETATS) { sortie[`${k}-ink`] = ink(k, Link); sortie[`${k}-soft`] = soft(k, Lmark); sortie[`${k}-mark`] = mark(k, Lmark) }
  return sortie
}
const clartesEtats = {}
{
  const c = etats(clair, false); clartesEtats.clair = c.clartes; delete c.clartes; Object.assign(clair, c)
  const d = etats(nuit, true); clartesEtats.nuit = d.clartes; delete d.clartes; Object.assign(nuit, d)
}

// Messages (info, succès, attention, danger) : descendants directs des états
const MESSAGES = { info: 'bleu', success: 'vert', warning: 'ambre', danger: 'rouge' }
for (const [m, k] of Object.entries(MESSAGES)) {
  const h = TEINTES_ETATS[k]
  clair[`${m}-bg`] = { ...clair[`${k}-soft`] }
  clair[`${m}-border`] = couleur(0.86, plafond(0.86, h, 0.07), h, source(k))
  clair[`${m}-fg`] = { ...clair[`${k}-ink`] }
  nuit[`${m}-bg`] = couleur(0.3, plafond(0.3, h, 0.055), h, source(k))
  nuit[`${m}-border`] = couleur(0.42, plafond(0.42, h, 0.09), h, source(k))
  nuit[`${m}-fg`] = { ...nuit[`${k}-ink`] }
}
{
  const h = TEINTES_ETATS.rouge
  const L = resoudre(0.56, -0.002, (x) => contraste(blanc, couleur(x, 0.19, h).hex) >= 4.5 + MARGE)
  clair['danger-solid'] = couleur(L, 0.19, h, 'fonction (hors visage)')
  nuit['danger-solid'] = couleur(L, 0.19, h, 'fonction (hors visage)')
}

// ── L'or (flamme) : de la LUMIÈRE seulement (logo, lumière du visage), jamais un texte, une pastille, un point ni une barre.
// Sa clarté est RÉSOLUE : celle qui l'écarte le plus des trois jetons ambre du thème, en vision normale, deutéranope et protanope.
const vu = (css, fond, type) => {
  const lin = lire(poseSur(css, fond)).lin.map((v) => Math.min(1, Math.max(0, v)))
  return lineaireVersOklab(type ? daltonien(lin, type).map((v) => Math.min(1, Math.max(0, v))) : lin)
}
function ecartOrAmbre(theme, or) {
  const fond = theme['surface-0'].hex
  let mini = { e: Infinity }
  for (const type of [null, 'deuteranope', 'protanope']) for (const role of ['ink', 'soft', 'mark']) {
    const e = deltaE(vu(or.hex, fond, type), vu(theme[`ambre-${role}`].css, fond, type))
    if (e < mini.e) mini = { e: arr(e), contre: `ambre-${role}`, vision: type ?? 'normale' }
  }
  return mini
}
const ecartFlamme = {}
for (const [nom, theme] of [['clair', clair], ['nuit', nuit]]) {
  let meilleur = null
  for (let L = 0.72; L <= 0.9001; L += 0.005) {
    const or = couleur(L, plafond(L, H.or, 0.15), H.or, 'or (flamme)')
    const e = ecartOrAmbre(theme, or)
    if (!meilleur || e.e > meilleur.e.e) meilleur = { or, e }
  }
  theme.flamme = meilleur.or
  theme['flamme-glow'] = { ...meilleur.or, css: rgba(meilleur.or.hex, 0.3) }
  ecartFlamme[nom] = meilleur.e
}

// ── Ombres teintées, filet de lumière, verre, voile ──────────────
const ombreClair = couleur(mesure.ombres.L, mesure.ombres.C, H.ombres, 'ombres')   // l'ombre mesurée, telle quelle
const ombreNuit = couleur(0.09, 0.02, H.ombres, 'ombres')
const lumiere = couleur(mesure.lumieres.L, mesure.lumieres.C, H.lumieres, 'lumieres')
const texte = (css, src, de) => ({ css, source: src, oklch: de?.oklch, hex: de?.hex })
Object.assign(clair, {
  'ombre-rvb': texte(rvb(ombreClair.hex).join(', '), 'ombres', ombreClair),
  'filet-lumiere': texte('rgba(255, 255, 255, .9)', 'lumieres'),
  'ring-nav': texte(`0 0 0 4px ${rgba(clair['surface-2'].hex, 0.7)}`, 'ombres'),
  'glass-border': { ...clair['border-1'] },
  scrim: texte(rgba(clair['text-1'].hex, 0.32), 'ombres', clair['text-1']),
})
Object.assign(nuit, {
  'ombre-rvb': texte(rvb(ombreNuit.hex).join(', '), 'ombres', ombreNuit),
  'filet-lumiere': texte(rgba(lumiere.hex, 0.1), 'lumieres', lumiere),
  'ring-nav': texte(`0 0 0 4px ${rgba(nuit['text-1'].hex, 0.12)}`, 'ombres'),
  'glass-fill': texte(rgba(nuit['surface-0'].hex, 0.86), 'ombres', nuit['surface-0']),
  'glass-border': { ...nuit['border-1'] },
  scrim: texte(rgba(nuit['surface-dark'].hex, 0.64), 'ombres', nuit['surface-dark']),
})
const commun = {
  ...Object.fromEntries(Object.entries(accent).map(([k, v]) => [`accent-${k}`, v])),
  'accent-rvb': texte(rvb(accent[600].hex).join(', '), 'famille', accent[600]),
  'accent-vif-rvb': texte(rvb(accent[500].hex).join(', '), 'famille', accent[500]),
}

// ── Daltonisme : écart minimal entre deux états, vus par un deutéranope et un protanope ──
function ecartDaltonien(theme, role, fond) {
  let mini = { e: Infinity }
  for (const type of ['deuteranope', 'protanope']) {
    const vus = ETATS.map((k) => lineaireVersOklab(daltonien(lire(poseSur(theme[`${k}-${role}`].css, fond)).lin.map((v) => Math.min(1, Math.max(0, v))), type).map((v) => Math.min(1, Math.max(0, v)))))
    for (let i = 0; i < ETATS.length; i++) for (let j = i + 1; j < ETATS.length; j++) {
      const e = deltaE(vus[i], vus[j])
      if (e < mini.e) mini = { e: arr(e), paire: `${ETATS[i]} / ${ETATS[j]}`, type }
      if (process.env.PAIRES && e < 0.06) console.log('  paire', role, type, ETATS[i], ETATS[j], arr(e))
    }
  }
  return mini
}
const daltonisme = {
  clair: { ink: ecartDaltonien(clair, 'ink', blanc), mark: ecartDaltonien(clair, 'mark', blanc) },
  nuit: { ink: ecartDaltonien(nuit, 'ink', nuit['surface-0'].hex), mark: ecartDaltonien(nuit, 'mark', nuit['surface-0'].hex) },
}

const propre = (t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v))
const palette = { teintes: TEINTES, teintesEtats: TEINTES_ETATS, tolerance: TOLERANCE_TEINTE, decalageClarte: DECALAGE, clartesEtats, ecartFlamme, commun, clair: propre(clair), nuit: propre(nuit), daltonisme }
writeFileSync(path.join(ICI, 'palette-visage.json'), JSON.stringify(palette, null, 1) + '\n')

// ── Report dans theme.css ────────────────────────────────────────
const P3_DEBUT = '/* ── Gamut large (généré par scripts/palette-visage.mjs : ne pas modifier à la main) ── */'
const P3_FIN = '/* ── fin du gamut large ── */'
function blocP3() {
  const g = (a, b) => `linear-gradient(110deg, ${accent[a].p3}, ${accent[b].p3})`
  return `${P3_DEBUT}
@media (color-gamut: p3) {
  @supports (color: color(display-p3 1 1 1)) {
    :root,
    [data-theme="light"] {
      --accent-fill: ${g(700, 600)};
      --accent-fill-hover: ${g(800, 700)};
      --accent-ring: ${accent[600].p3};
      --accent-vif: ${accent[500].p3};
    }
    [data-theme="dark"] {
      --accent-fill: ${g(600, 600)};
      --accent-fill-hover: ${g(700, 700)};
      --accent-ring: ${accent[300].p3};
      --accent-vif: ${accent[500].p3};
    }
  }
}
${P3_FIN}`
}
function reporter() {
  let css = readFileSync(THEME, 'utf8')
  const borne = (entete) => {
    const d = css.indexOf(entete)
    if (d < 0) throw new Error(`bloc introuvable : ${entete}`)
    return [d, css.indexOf('\n}', d)]
  }
  const poser = (entete, nom, valeur) => {
    const [d, f] = borne(entete)
    const bloc = css.slice(d, f)
    const re = new RegExp(`(--${nom}:\\s*)([^;]+)(;)`)
    if (!re.test(bloc)) throw new Error(`jeton --${nom} introuvable dans ${entete}`)
    css = css.slice(0, d) + bloc.replace(re, (_m, a, _b, c) => a + valeur + c) + css.slice(f)
  }
  for (const [nom, v] of Object.entries(commun)) poser(':root {', nom, v.css)
  for (const [nom, v] of Object.entries(propre(clair))) poser(':root,\n[data-theme="light"] {', nom, v.css)
  for (const [nom, v] of Object.entries(propre(nuit))) poser('[data-theme="dark"] {', nom, v.css)
  const d = css.indexOf(P3_DEBUT)
  const f = css.indexOf(P3_FIN)
  if (d < 0 || f < 0) throw new Error('repères du bloc P3 introuvables dans theme.css')
  css = css.slice(0, d) + blocP3() + css.slice(f + P3_FIN.length)
  writeFileSync(THEME, css)
}
if (process.argv.includes('--ecrire')) reporter()

// ── Livrables : PALETTE.md + planche SVG ─────────────────────────
const iMd = process.argv.indexOf('--md')
if (iMd > 0) {
  const dossier = process.argv[iMd + 1]
  mkdirSync(dossier, { recursive: true })
  const avant = JSON.parse(readFileSync(path.join(dossier, 'palette-avant.json'), 'utf8'))   // photographie des jetons d'avant (commit 6ddf131)
  const lch = (c) => { try { const [L, C, h] = versOklch(c); return `oklch(${arr(L)} ${arr(C)} ${arr(h, 1)})` } catch { return '—' } }
  const md = ['# Palette de marque tirée du visage (script `frontend/scripts/palette-visage.mjs`)', '',
    `Teintes mesurées : ombres ${H.ombres}°, lumières ${H.lumieres}°, famille colorée du verre ${H.famille}°, flamme ${H.flamme}° (or ${H.or}°). Tolérance : ± ${TOLERANCE_TEINTE}°.`, '']
  for (const [titre, cle, table] of [['Commun aux deux thèmes', 'commun', commun], ['Clair', 'clair', propre(clair)], ['Nuit', 'nuit', propre(nuit)]]) {
    md.push(`## ${titre}`, '', '| Jeton | Avant | Avant (OKLCH) | Après | Après (OKLCH) | Descend de |', '|---|---|---|---|---|---|')
    for (const [nom, v] of Object.entries(table)) {
      const a = avant[cle]?.[`--${nom}`]
      const premiere = a ? (a.match(/#[0-9a-f]{6}|rgba?\([^)]*\)/i) ?? [])[0] : undefined
      md.push(`| \`--${nom}\` | ${a ? `\`${a}\`` : 'nouveau'} | ${premiere ? lch(premiere) : '—'} | \`${v.css}\` | ${v.oklch ? `oklch(${v.oklch.join(' ')})` : '—'}${v.p3 ? ` · P3 \`${v.p3}\`` : ''} | ${v.source} |`)
    }
    md.push('')
  }
  md.push('## Daltonisme (écart ΔE OK minimal entre deux états, simulation Viénot 1999)', '', '| Thème | Rôle | Écart minimal | Paire | Vision |', '|---|---|---|---|---|')
  for (const [t, r] of Object.entries(daltonisme)) for (const [role, m] of Object.entries(r)) md.push(`| ${t} | ${role} | ${m.e} | ${m.paire} | ${m.type} |`)
  md.push('')
  writeFileSync(path.join(dossier, 'PALETTE-jetons.md'), md.join('\n'))

  // planche : échelles clair et nuit à côté du visage
  const PUBLIC = path.resolve(ICI, '..', 'public')
  const png = execFileSync('ffmpeg', ['-v', 'error', '-ss', '2.5', '-i', path.join(PUBLIC, 'visage', 'visage-3.webm'), '-frames:v', '1', '-vf', 'scale=240:-2', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1 << 26 }).toString('base64')
  const el = []
  const rangee = (x, y, titre, items, fondTexte) => {
    el.push(`<text x="${x}" y="${y - 8}" class="t" fill="${fondTexte}">${titre}</text>`)
    items.forEach(([nom, css], i) => el.push(`<rect x="${x + i * 62}" y="${y}" width="56" height="40" rx="6" fill="${css}" stroke="${fondTexte}" stroke-opacity=".18"/>`, `<text x="${x + i * 62 + 28}" y="${y + 54}" class="s" fill="${fondTexte}" text-anchor="middle">${nom}</text>`))
  }
  const theme = (x, t, nom, fond, encre) => {
    el.push(`<rect x="${x}" y="48" width="500" height="720" rx="14" fill="${fond}"/>`, `<text x="${x + 20}" y="78" class="h" fill="${encre}">${nom}</text>`)
    let y = 112
    rangee(x + 20, y, 'Accent (teinte de la famille, constante)', [50, 100, 200, 300, 400, 500, 600, 700].map((k) => [k, accent[k].hex]), encre); y += 92
    rangee(x + 20, y, 'Neutres (teinte des ombres)', ['surface-page', 'surface-0', 'surface-1', 'surface-2', 'border-2', 'border-field', 'text-3', 'text-1'].map((k) => [k.replace('surface-', 's-').replace('border-', 'b-').replace('text-', 't-'), t[k].hex]), encre); y += 92
    rangee(x + 20, y, 'Lumière d\'aurore, rubans, flamme', [['ink', t['aurore-ink'].hex], ['mark', t['aurore-mark'].hex], ['ruban a', poseSur(t['aurore-a'].css, fond)], ['ruban b', poseSur(t['aurore-b'].css, fond)], ['ruban c', poseSur(t['aurore-c'].css, fond)], ['flamme', t.flamme.hex]], encre); y += 92
    for (const role of ['ink', 'soft', 'mark']) { rangee(x + 20, y, `États : ${role} (même clarté, la teinte seule change)`, ETATS.map((k) => [k, poseSur(t[`${k}-${role}`].css, t['surface-0'].hex)]), encre); y += 92 }
    el.push(`<rect x="${x + 20}" y="${y + 6}" width="210" height="44" rx="22" fill="${accent[600].hex}"/>`, `<text x="${x + 125}" y="${y + 33}" class="b" fill="#fff" text-anchor="middle">Nouvel appel d'offres</text>`,
      `<rect x="${x + 250}" y="${y + 6}" width="110" height="44" rx="14" fill="${t['surface-0'].hex}" stroke="${t['border-field'].hex}"/>`, `<text x="${x + 305}" y="${y + 33}" class="b" fill="${t['text-1'].hex}" text-anchor="middle">Annuler</text>`)
  }
  theme(288, propre(clair), 'Clair', clair['surface-page'].hex, clair['text-1'].hex)
  theme(804, propre(nuit), 'Nuit', nuit['surface-page'].hex, nuit['text-1'].hex)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1328" height="792" viewBox="0 0 1328 792">
<style>.t{font:600 12px system-ui,sans-serif}.s{font:10.5px ui-monospace,Menlo,monospace}.h{font:600 18px system-ui,sans-serif}.b{font:600 14px system-ui,sans-serif}.w{font:600 16px system-ui,sans-serif;fill:#fff}.m{font:12px ui-monospace,Menlo,monospace;fill:#c3cedb}</style>
<rect width="1328" height="792" fill="#0b0f14"/>
<text x="24" y="30" class="w">La palette tirée du visage</text>
<image x="24" y="48" width="240" height="360" href="data:image/png;base64,${png}"/>
<text x="24" y="436" class="m">ombres ${H.ombres}°</text><rect x="170" y="424" width="94" height="16" rx="3" fill="${mesure.ombres.hex}" stroke="#3a4656"/>
<text x="24" y="462" class="m">lumières ${H.lumieres}°</text><rect x="170" y="450" width="94" height="16" rx="3" fill="${mesure.lumieres.hex}"/>
<text x="24" y="488" class="m">famille ${H.famille}°</text><rect x="170" y="476" width="94" height="16" rx="3" fill="${mesure.familles[0].hex}"/>
<text x="24" y="514" class="m">flamme ${H.flamme}° · or ${H.or}°</text><rect x="170" y="502" width="94" height="16" rx="3" fill="${mesure.familles[1].hex}"/>
<text x="24" y="540" class="m">fond ${mesure.fond.h}°</text><rect x="170" y="528" width="94" height="16" rx="3" fill="${mesure.fond.hex}" stroke="#3a4656"/>
${el.join('\n')}
</svg>
`
  writeFileSync(path.join(dossier, 'palette.svg'), svg)
}

// ── Résumé ───────────────────────────────────────────────────────
const l = (nom, v) => console.log(`  ${nom.padEnd(16)} ${String(v.css).padEnd(30)} ${v.oklch ? 'oklch(' + v.oklch.join(' ') + ')' : ''}${v.p3 ? '  P3 ' + v.p3 : ''}`)
console.log('teintes', TEINTES)
for (const [k, v] of Object.entries(commun)) l(k, v)
for (const [t, table] of [['clair', propre(clair)], ['nuit', propre(nuit)]]) { console.log(t); for (const [k, v] of Object.entries(table)) l(k, v) }
console.log('daltonisme', JSON.stringify(daltonisme))
console.log('or contre ambre', JSON.stringify(ecartFlamme))
