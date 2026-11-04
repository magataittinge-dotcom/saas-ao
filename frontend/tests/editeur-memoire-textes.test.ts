// G5 version courte (recette du 4/11) — « Modifier » devient « Modifier le texte », plus aucun mot « Markdown » à
// l'écran, et une ligne d'aide dit ce que font # et **.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textesAffiches } from './outils/textes'

const textes = () => textesAffiches('src/routes/project/StepMemoire.tsx').map((t) => t.texte.replace(/\s+/g, ' ').trim())

test('plus aucun mot « Markdown » affiché dans Rédiger ni dans son éditeur', () => {
  assert.deepEqual(textes().filter((t) => /markdown/i.test(t)), [])
})

test('le bouton s\'appelle « Modifier le texte » et l\'éditeur porte la ligne d\'aide des signes', () => {
  const t = textes()
  assert.ok(t.includes('Modifier le texte'), 'bouton « Modifier le texte »')
  assert.ok(!t.includes('Modifier'), 'ancien libellé « Modifier » retiré')
  assert.ok(t.some((x) => x === '# = titre, **texte** = gras'), 'ligne d\'aide « # = titre, **texte** = gras »')
})
