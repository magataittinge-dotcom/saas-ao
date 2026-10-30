// Socle — aucun éclair au chargement : data-theme est posé par un script synchrone du <head>,
// avant tout CSS et avant le premier affichage. Le script est exécuté ici avec un faux document.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { lire } from './outils/sources'
import { valeur } from './outils/jetons'

const SCRIPT = lire('public/theme-init.js')

function executer(opts: { memorise?: string | null; stockageCasse?: boolean; systemeNuit?: boolean; matchMediaCasse?: boolean }): string | null {
  let pose: string | null = null
  const contexte = {
    document: { documentElement: { setAttribute: (nom: string, v: string) => { if (nom === 'data-theme') pose = v } } },
    localStorage: {
      getItem: (cle: string) => {
        if (opts.stockageCasse) throw new Error('stockage bloqué')
        assert.equal(cle, 'synorix.theme')
        return opts.memorise ?? null
      },
    },
    window: {
      matchMedia: (q: string) => {
        if (opts.matchMediaCasse) throw new Error('indisponible')
        assert.equal(q, '(prefers-color-scheme: dark)')
        return { matches: !!opts.systemeNuit }
      },
    },
  }
  vm.runInNewContext(SCRIPT, contexte)
  return pose
}

test('le choix mémorisé gagne sur la préférence du système', () => {
  assert.equal(executer({ memorise: 'dark', systemeNuit: false }), 'dark')
  assert.equal(executer({ memorise: 'light', systemeNuit: true }), 'light')
})

test('sans choix mémorisé (ou valeur inconnue), le thème suit prefers-color-scheme', () => {
  assert.equal(executer({ memorise: null, systemeNuit: true }), 'dark')
  assert.equal(executer({ memorise: null, systemeNuit: false }), 'light')
  assert.equal(executer({ memorise: 'violet', systemeNuit: true }), 'dark')
})

test('stockage bloqué ou matchMedia absent : jamais d\'erreur, un thème est toujours posé', () => {
  assert.equal(executer({ stockageCasse: true, systemeNuit: true }), 'dark')
  assert.equal(executer({ stockageCasse: true, systemeNuit: false }), 'light')
  assert.equal(executer({ memorise: null, matchMediaCasse: true }), 'light')
  assert.equal(executer({ stockageCasse: true, matchMediaCasse: true }), 'light')
})

test('index.html : script synchrone dans le <head>, avant la feuille de style et le module, fond du premier rendu = fond du thème', () => {
  const html = lire('index.html')
  const tete = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
  const balise = tete.match(/<script src="\/theme-init\.js"[^>]*><\/script>/)
  assert.ok(balise, 'script du thème dans le head')
  assert.doesNotMatch(balise![0], /defer|async|type="module"/)
  assert.ok(tete.indexOf(balise![0]) < tete.indexOf('<style>'), 'le script passe avant le style')
  // le module de l'appli est hors du head (après le body) : il ne peut pas précéder le script
  assert.ok(html.indexOf('/src/main.tsx') > html.indexOf('</head>'))
  // fond avant l'arrivée de la feuille de style = surface-0 de chaque thème
  const clair = html.match(/html \{ background: (#[0-9a-f]{6});/i)![1]
  const nuit = html.match(/html\[data-theme="dark"\] \{ background: (#[0-9a-f]{6});/i)![1]
  assert.equal(clair.toLowerCase(), valeur('light', '--surface-0'))
  assert.equal(nuit.toLowerCase(), valeur('dark', '--surface-0'))
})

test('la clé et les valeurs sont les mêmes dans le script et dans src/lib/theme.ts ; la CSP (script-src \'self\') n\'a pas besoin d\'un script en ligne', () => {
  const lib = lire('src/lib/theme.ts')
  assert.match(lib, /CLE_THEME = 'synorix\.theme'/)
  assert.match(SCRIPT, /getItem\('synorix\.theme'\)/)
  assert.match(SCRIPT, /theme !== 'light' && theme !== 'dark'/)
  assert.doesNotMatch(lire('index.html'), /<script(?![^>]*\ssrc=)[^>]*>/, 'aucun script en ligne dans index.html')
})
