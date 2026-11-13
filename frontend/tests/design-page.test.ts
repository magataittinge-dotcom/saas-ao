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

test('/design : servie en développement seulement, jamais dans la version de production', () => {
  // En production, /design tombe sur l'écran « adresse inconnue » : la page de référence reste un outil interne.
  assert.match(lire('src/App.tsx'), /\{import\.meta\.env\.DEV && <Route path="\/design" element=\{<Design \/>\} \/>\}/)
})

test('/design : tous les jetons affichés existent dans les deux thèmes ; les exemples sont rendus en clair ET en nuit', () => {
  const jetons = [...new Set([...page.matchAll(/'(--[\w-]+)'/g)].map((m) => m[1]))].filter((j) => j !== '--echantillon') // variable locale de l'échantillon
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

// Jury, tour 3 (COR-A) : la page de référence écrit comme le produit.
test('/design : sommaire en mots, décimales à la virgule, aucun menu sans libellé, erreur par défaut « intactes »', () => {
  assert.match(page, /\['resume', 'Cases de résumé'\]/, 'le sommaire écrit le nom de la section')
  assert.match(page, /\['etats', 'États'\]/)
  assert.doesNotMatch(page, /\{id\}<\/a>/, 'jamais l’identifiant brut dans le sommaire')
  assert.match(page, /toFixed\(2\)\.replace\('\.', ','\)/, 'rapport de contraste à la virgule')
  assert.match(page, /String\(l\.seuil\)\.replace\('\.', ','\)/, 'seuil « 4,5:1 »')
  assert.doesNotMatch(page, /<MenuPoints/, 'le menu de la page de référence porte son mot')
  assert.match(lire('src/components/ui/etats.tsx'), /Vos données sont intactes\./)
  assert.doesNotMatch(lire('src/components/ui/etats.tsx'), /ne sont pas touchées/)
})
