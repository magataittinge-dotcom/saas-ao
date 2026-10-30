// Socle — page /design : route interne, absente du menu, et chaque jeton qu'elle montre existe en clair et en nuit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { valeur } from './outils/jetons'

const page = sansCommentaires(lire('src/routes/Design.tsx'))

test('/design : route privée déclarée, jamais liée au menu, aux onglets ni à la palette', () => {
  assert.match(lire('src/App.tsx'), /<Route path="\/design" element=\{<Design \/>\} \/>/)
  for (const f of ['navigation.ts', 'Sidebar.tsx', 'BarreOnglets.tsx', 'CommandPalette.tsx']) {
    assert.doesNotMatch(lire(`src/components/layout/${f}`), /\/design/, f)
  }
})

test('/design : tous les jetons affichés existent dans les deux thèmes ; les exemples sont rendus en clair ET en nuit', () => {
  const jetons = [...new Set([...page.matchAll(/'(--[\w-]+)'/g)].map((m) => m[1]))]
  assert.ok(jetons.length > 40)
  const manquants: string[] = []
  for (const theme of ['light', 'dark'] as const) for (const j of jetons) {
    try { valeur(theme, j) } catch { manquants.push(`${theme} ${j}`) }
  }
  assert.deepEqual(manquants, [])
  assert.match(page, /\(\['light', 'dark'\] as const\)\.map/)
  assert.match(page, /data-theme=\{theme\}/)
})

test('/design : toutes les familles de composants du socle sont montrées', () => {
  for (const id of ['couleurs', 'contrastes', 'typographie', 'formes', 'boutons', 'champs', 'cartes', 'pastilles', 'onglets', 'surcouches', 'mouvement', 'icones']) {
    assert.match(page, new RegExp(`<Section id="${id}"`), id)
  }
  assert.doesNotMatch(page.replace(/#111111/g, ''), /#[0-9A-Fa-f]{6}\b|rgba?\(/, 'couleur en dur')
})
