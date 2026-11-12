// R32 — à 390 px, rien ne dépasse de l'écran sans pouvoir défiler : les lignes se replient au lieu de déborder.
// (Mesure faite au navigateur : bord droit des éléments ≤ 390 ; ici, les classes qui l'assurent.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const code = (f: string) => sansCommentaires(lire(f))

test('lots : les noms de fichiers des documents illisibles passent à la ligne', () => {
  assert.match(code('src/routes/project/StepLotSelection.tsx'), /<li key=\{w\.file_name\} className="break-words text-xs"/)
})

test('analyse : les puces de catégories se replient au lieu de défiler hors de l’écran', () => {
  const c = code('src/routes/project/StepAnalysis.tsx')
  // FIN-B1 : les puces doublaient les catégories repliables (deux fois la même navigation) : il n'en reste aucune
  assert.doesNotMatch(c, /<PuceFiltre|gap-6 pb-px overflow-x-auto/)
})

test('pièces : la rangée d’actions passe sous le texte au téléphone, et le nom de la pièce jointe se replie', () => {
  // FIN-B1 — les pièces sont des lignes d'une liste (LignePiece) : au téléphone, l'état et le geste passent sous le texte
  // (toute la largeur), le nom et le fichier joint se replient
  const l = code('src/components/project/LignePiece.tsx')
  assert.match(l, /<div data-piece=\{id\} className="px-5 py-3 max-sm:px-4">/)
  assert.match(l, /flex flex-wrap items-center gap-x-4 gap-y-1\.5/)
  assert.match(l, /flex min-w-0 items-center justify-between gap-x-3 max-sm:basis-full/)
  assert.match(l, /<p className="break-words font-semibold text-fg">\{nom\}<\/p>/)
  const t = code('src/components/project/CandidatureSectionTemplates.tsx')
  assert.match(t, /flex flex-wrap items-center gap-x-3 gap-y-0\.5 break-words text-sm text-fg-2/)
  const v = code('src/components/project/CandidatureSectionVault.tsx')
  assert.match(v, /mt-0\.5 break-words text-sm text-fg-2">\{faits\.join\(' · '\)\}/)
})

test('bandeau de l’AO : le titre et la ligne de l’acheteur ne sont plus coupés par « … »', () => {
  const c = code('src/routes/Project.tsx')
  assert.match(c, /<p className="min-w-0 break-words text-sm text-fg-2">/)
  assert.match(c, /\{contexte \|\| project\.name\}/)
  assert.doesNotMatch(c, /text-fg-2 truncate/)
})
