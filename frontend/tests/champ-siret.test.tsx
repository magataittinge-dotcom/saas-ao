// G7 — le SIRET se saisit dans « Mon entreprise » (profil non vide) ; le contrôle est celui de l'inscription.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChampSiret from '@/components/entreprise/ChampSiret'
import { lire } from './outils/sources'

const rendre = (p: { siret?: string | null; verifie?: boolean }) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><ChampSiret {...p} /></QueryClientProvider>)

test('le champ SIRET est saisissable sur un profil rempli (plus de lecture seule)', () => {
  const html = rendre({ siret: '73282932000074', verifie: true })
  assert.match(html, /<input[^>]*value="73282932000074"/)
  assert.ok(!/readonly/i.test(html))
  const pour = /<label for="([^"]+)"[^>]*>SIRET<\/label>/.exec(html)?.[1]
  assert.ok(pour && html.includes(`<input`) && new RegExp(`<input[^>]*id="${pour}"`).test(html), 'l’étiquette est reliée au champ')
  assert.match(html, /Vérifié au répertoire Sirene/)
  const form = lire('src/components/entreprise/FormIdentite.tsx')
  assert.match(form, /<ChampSiret /)
  assert.ok(!/readOnly/.test(form))
})

test('profil sans SIRET : « À renseigner » ; pas de bouton tant que rien n’est saisi', () => {
  const html = rendre({ siret: null })
  assert.match(html, /À renseigner/)
  assert.ok(!/Vérifier/.test(html))
})

test('le contrôle est celui de l’inscription (/auth/sync) avec depuis_profil', () => {
  assert.match(lire('src/components/entreprise/ChampSiret.tsx'), /authService\.sync\(\{ siret: valeur\.trim\(\), depuis_profil: true \}\)/)
})
