// Polices (DESIGN.md § Typography, 9/11/2026) : Manrope (interface) et Newsreader (h1 + mémoire), auto-hébergées,
// seulement les sous-ensembles latin et latin-ext, aucune police inutilisée, aucune requête vers un service tiers,
// et les caractères du français couverts par les plages Unicode déclarées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { RACINE, lire, sansCommentaires } from './outils/sources'

const main = sansCommentaires(lire('src/main.tsx'))
const importsPolices = [...main.matchAll(/^import\s+'([^']*(?:fontsource|polices)[^']*)'/gm)].map((m) => m[1])
const css = lire('src/styles/polices.css')
const blocs = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])

test('main.tsx : uniquement des sous-ensembles latin / latin-ext, aucune police inutilisée', () => {
  assert.ok(importsPolices.length > 0)
  for (const i of importsPolices) {
    assert.ok(/(\/latin(-ext)?-\d{3}\.css|\/polices\.css|\/styles\/polices\.css)$/.test(i), `import complet (tous les alphabets) : ${i}`)
  }
  assert.ok(!importsPolices.some((i) => /space-grotesk|bricolage|inter|instrument-serif/.test(i)), 'police retirée ou non retenue importée')
  assert.ok(importsPolices.includes('./styles/polices.css'), 'Manrope et Newsreader passent par styles/polices.css (latin + latin-ext)')
})

test('Geist Sans reste chargée : la landing, la connexion, l\'inscription, les tarifs et les mentions la nomment', () => {
  assert.ok(importsPolices.some((i) => /geist-sans\/latin-400\.css/.test(i)))
  for (const f of ['Landing', 'Login', 'Register', 'Pricing', 'Legal']) assert.ok(/Geist Sans/.test(lire(`src/routes/${f}.tsx`)), f)
})

/** Plages « U+0000-00FF,U+0131 » → fonction d'appartenance. */
function plages(valeur: string): (cp: number) => boolean {
  const lots = valeur.split(',').map((s) => s.trim().replace(/^U\+/i, '')).map((s) => {
    const [a, b] = s.split('-')
    return [parseInt(a, 16), parseInt(b ?? a, 16)] as const
  })
  return (cp) => lots.some(([a, b]) => cp >= a && cp <= b)
}

test('polices.css : Manrope (latin + latin-ext) et Newsreader à taille optique (latin + latin-ext, droit et italique), rien d\'autre', () => {
  assert.equal(blocs.length, 6)
  const fichiers = blocs.map((b) => b.match(/files\/([\w-]+\.woff2)/)![1]).sort()
  assert.deepEqual(fichiers, [
    'manrope-latin-ext-wght-normal.woff2', 'manrope-latin-wght-normal.woff2',
    'newsreader-latin-ext-opsz-italic.woff2', 'newsreader-latin-ext-opsz-normal.woff2',
    'newsreader-latin-opsz-italic.woff2', 'newsreader-latin-opsz-normal.woff2',
  ])
  for (const b of blocs) assert.match(b, /font-display:\s*swap/)
  assert.doesNotMatch(css, /Bricolage|Inter|Instrument|cyrillic|greek|vietnamese/)
})

test('le français s\'affiche : accents, œ, €, guillemets « », apostrophe et points de suspension typographiques', () => {
  for (const famille of ['manrope-latin-wght-normal', 'newsreader-latin-opsz-normal']) {
    const bloc = blocs.find((b) => b.includes(famille))!
    const couvre = plages(bloc.match(/unicode-range:\s*([^;]+);/)![1])
    for (const c of 'éèêëàâäçîïôöùûüÿÉÈÀÇœŒ€«»’…°²×·–—') assert.ok(couvre(c.codePointAt(0)!), `${famille} : ${c} (U+${c.codePointAt(0)!.toString(16)})`)
  }
})

test('les jetons nomment les polices déclarées : --font-ui Manrope, --font-display et --font-memoire Newsreader', () => {
  const theme = lire('src/styles/theme.css')
  assert.match(theme, /--font-ui:\s*'Manrope Variable'/)
  assert.match(theme, /--font-display:\s*'Newsreader Variable'/)
  assert.match(theme, /--font-memoire:\s*'Newsreader Variable'/)
  assert.doesNotMatch(sansCommentaires(theme), /Bricolage|Inter Variable/)
})

test('Manrope et Newsreader : auto-hébergées (OFL-1.1), déclarées dans package.json, 2 fichiers du premier écran préchargés sans réseau tiers', () => {
  const pkg = JSON.parse(lire('package.json'))
  assert.match(pkg.dependencies['@fontsource-variable/manrope'], /5\.3\.0/)
  assert.match(pkg.dependencies['@fontsource-variable/newsreader'], /5\.3\.0/)
  const html = lire('index.html')
  const preloads = [...html.matchAll(/<link rel="preload" as="font"[^>]*>/g)].map((m) => m[0])
  assert.equal(preloads.length, 2)
  for (const p of preloads) assert.match(p, /type="font\/woff2"[^>]*crossorigin|crossorigin[^>]*type="font\/woff2"/)
  assert.ok(preloads.some((p) => /manrope-latin-wght-normal/.test(p)) && preloads.some((p) => /newsreader-latin-opsz-normal/.test(p)))
})

/** Tous les fichiers sources de src/ (récursif). */
function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = path.join(dossier, n)
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css|html)$/.test(n) ? [p] : []
  })
}

test('aucune requête vers Google Fonts : ni dans index.html, ni dans src/', () => {
  assert.doesNotMatch(lire('index.html'), /fonts\.(googleapis|gstatic)/)
  const fautifs = sources(path.join(RACINE, 'src')).filter((f) => /fonts\.(googleapis|gstatic)/.test(lire(path.relative(RACINE, f))))
  assert.deepEqual(fautifs, [])
})
