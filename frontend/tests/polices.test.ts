// Polices (bloc 6, G1 §3.3) : seulement les sous-ensembles latin et latin-ext, aucune police
// inutilisée, et les caractères du français couverts par les plages Unicode déclarées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const main = sansCommentaires(lire('src/main.tsx'))
const importsPolices = [...main.matchAll(/^import\s+'([^']*(?:fontsource|polices)[^']*)'/gm)].map((m) => m[1])

test('main.tsx : uniquement des sous-ensembles latin / latin-ext, aucune police inutilisée', () => {
  assert.ok(importsPolices.length > 0)
  for (const i of importsPolices) {
    assert.ok(/(\/latin(-ext)?-\d{3}\.css|\/polices\.css|\/styles\/polices\.css)$/.test(i), `import complet (tous les alphabets) : ${i}`)
  }
  assert.ok(!importsPolices.some((i) => /space-grotesk/.test(i)), 'Space Grotesk n\'est utilisée nulle part (font-brand jamais employée)')
  assert.ok(!importsPolices.some((i) => /@fontsource-variable\/inter/.test(i)), 'Inter passe par styles/polices.css (latin + latin-ext)')
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

test('le français s\'affiche : accents, œ, €, guillemets « », apostrophe et points de suspension typographiques', () => {
  const css = lire('src/styles/polices.css')
  const blocs = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
  assert.equal(blocs.length, 2, 'Inter : latin et latin-ext')
  const latin = blocs.find((b) => /inter-latin-wght-normal/.test(b))!
  const couvre = plages(latin.match(/unicode-range:\s*([^;]+);/)![1])
  for (const c of 'éèêëàâäçîïôöùûüÿÉÈÀÇœŒ€«»’…°²×·–—') assert.ok(couvre(c.codePointAt(0)!), `${c} (U+${c.codePointAt(0)!.toString(16)})`)
  assert.ok(/inter-latin-ext-wght-normal/.test(css))
})
