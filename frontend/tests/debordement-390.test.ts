// R32 — à 390 px, rien ne dépasse de l'écran sans pouvoir défiler : les lignes se replient au lieu de déborder.
// (Mesure faite au navigateur : bord droit des éléments ≤ 390 ; ici, les classes qui l'assurent.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const code = (f: string) => sansCommentaires(lire(f))

test('lots : les noms de fichiers des documents illisibles passent à la ligne', () => {
  assert.match(code('src/routes/project/StepLotSelection.tsx'), /<li key=\{w\.file_name\} className="break-words text-xs"/)
})

test('analyse : les onglets de catégories se replient au lieu de défiler hors de l’écran', () => {
  const c = code('src/routes/project/StepAnalysis.tsx')
  assert.match(c, /flex flex-wrap items-center gap-x-5 gap-y-1 pb-px/)
  assert.doesNotMatch(c, /gap-6 pb-px overflow-x-auto/)
})

test('pièces : la rangée d’actions passe sous le texte au téléphone, et le nom de la pièce jointe se replie', () => {
  const t = code('src/components/project/CandidatureSectionTemplates.tsx')
  // cartes sur une colonne au téléphone (deux dès 768 px, SectionEtape), actions qui passent à la ligne, noms qui se replient
  assert.match(t, /<div data-piece=\{item\.id\} className="grid min-w-0 content-start gap-2 rounded-carte/)
  assert.match(t, /flex flex-wrap items-center gap-2/)
  assert.match(t, /break-words pl-\[1\.875rem\] text-sm text-fg-2">\s*\{item\.jointe && item\.piece_nom/)
  const v = code('src/components/project/CandidatureSectionVault.tsx')
  assert.match(v, /flex flex-wrap items-center justify-between gap-x-4 gap-y-2/)
  assert.match(v, /break-words">\{item\.piece_nom\}/)
})

test('bandeau de l’AO : le titre et la ligne de l’acheteur ne sont plus coupés par « … »', () => {
  const c = code('src/routes/Project.tsx')
  assert.match(c, /line-clamp-2 break-words">\{project\.name\}/)
  assert.match(c, /<span className="min-w-0 break-words">\{project\.maitre_ouvrage\}<\/span>/)
  assert.doesNotMatch(c, /text-fg-2 truncate/)
})
