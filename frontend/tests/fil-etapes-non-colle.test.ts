// G3 (recette du 4/11) — le fil des 7 étapes restait collé au milieu de l'écran, recouvrait le contenu au défilement
// et masquait les messages d'erreur. Il défile désormais avec la page (aucun `sticky`, aucun état « collé »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('le fil des étapes de l\'AO n\'est pas collant et ne dépend plus d\'un observateur de défilement', () => {
  const code = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.doesNotMatch(code, /\bsticky\b/)
  assert.doesNotMatch(code, /stepperStuck|IntersectionObserver|sentinelRef/)
  assert.match(code, /<StepProgress/)
})
