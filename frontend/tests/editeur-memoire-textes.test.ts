// G5 version courte (recette du 4/11) — « Modifier » devient « Modifier le texte », plus aucun mot « Markdown » à
// l'écran, et une ligne d'aide dit ce que font # et **.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textesAffiches } from './outils/textes'
import { lire } from './outils/sources'

// L'éditeur vit dans son fichier depuis la vague 1 (components/memoire/EditeurMemoire.tsx) ; sa barre d'outils pose les signes.
const FICHIERS = ['src/routes/project/StepMemoire.tsx', 'src/components/memoire/EditeurMemoire.tsx', 'src/lib/memoireEdition.ts']
const textes = () => FICHIERS.flatMap((f) => textesAffiches(f)).map((t) => t.texte.replace(/\s+/g, ' ').trim())

test('plus aucun mot « Markdown » affiché dans Rédiger ni dans son éditeur', () => {
  assert.deepEqual(textes().filter((t) => /markdown/i.test(t)), [])
})

test('le bouton s\'appelle « Modifier le texte » et l\'éditeur ne porte plus de ligne d\'aide des signes (jury, tour 1 : le texte se corrige mis en forme)', () => {
  const t = textes()
  assert.ok(t.includes('Modifier le texte'), 'bouton « Modifier le texte »')
  assert.ok(!t.includes('Modifier'), 'ancien libellé « Modifier » retiré')
  assert.ok(!lire('src/components/memoire/EditeurMemoire.tsx').includes("= gras"), 'plus de ligne d\'aide « # = titre, **texte** = gras »')
})
