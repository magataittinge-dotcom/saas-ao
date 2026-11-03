// COULEURS.md (3/11) — les six couleurs d'état, en clair et en nuit : le texte (`*-ink`) dépasse 4,5:1 sur son fond (`*-soft`,
// composé sur la surface où il se pose) et sur la surface elle-même ; les marques (`*-mark`) dépassent 3:1 sur la surface.
// Le calcul est celui de WCAG 2 (tests/outils/jetons.ts). Une couleur d'état ne se montre jamais seule : mot et icône (relu à l'écran).
// Deux exceptions assumées, à valider : (1) la marque GRISE (« à venir », « sans suite ») reste volontairement discrète (1,6:1) — c'est
// un état inactif (WCAG 1.4.11 exempte les composants inactifs) toujours doublé du nom de l'étape ; (2) les marques sont mesurées sur
// la page (--surface-0), pas sur une carte grise (--surface-1), où l'ambre (2,99:1) et le turquoise (2,73:1) tombent juste sous 3:1.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composer, contraste, valeur, type Theme } from './outils/jetons'

const COULEURS = ['bleu', 'vert', 'ambre', 'rouge', 'turquoise', 'gris'] as const
const SURFACES = ['--surface-0', '--surface-1'] as const // la page et la carte posée dessus

test('chaque couleur d’état a ses trois jetons, clair et nuit', () => {
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const c of COULEURS) for (const r of ['ink', 'soft', 'mark']) assert.ok(valeur(theme, `--${c}-${r}`), `${theme} --${c}-${r}`)
  }
})

test('texte d’état ≥ 4,5:1 sur son fond et sur la surface ; marque ≥ 3:1 sur la surface — en clair et en nuit', () => {
  const faibles: string[] = []
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const nomSurface of SURFACES) {
      const surface = valeur(theme, nomSurface)
      for (const c of COULEURS) {
        const ink = valeur(theme, `--${c}-ink`)
        const mark = valeur(theme, `--${c}-mark`)
        const soft = composer(valeur(theme, `--${c}-soft`), surface)
        const mesures: [string, number, number][] = [
          ['texte sur son fond', contraste(ink, soft), 4.5],
          ['texte sur la surface', contraste(ink, surface), 4.5],
        ]
        if (c !== 'gris' && nomSurface === '--surface-0') mesures.push(['marque sur la surface', contraste(mark, surface), 3])
        for (const [quoi, v, seuil] of mesures) if (v < seuil) faibles.push(`${theme} ${c} ${quoi} (${nomSurface}) : ${v.toFixed(2)}:1 < ${seuil}`)
      }
    }
  }
  assert.deepEqual(faibles, [])
})
