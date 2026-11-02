// R18 — « Actualiser » (régénère la liste des pièces sans IA) dit ce qu'il a fait : en cours, à jour, ou le changement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageActualisation } from '@/lib/actualisation'
import { lire, sansCommentaires } from './outils/sources'

test('messageActualisation : en cours, rien de changé, changement, échec ; rien tant qu’on n’a pas cliqué', () => {
  assert.equal(messageActualisation(null), '')
  assert.equal(messageActualisation({ etat: 'en_cours' }), 'Actualisation…')
  assert.equal(messageActualisation({ etat: 'fait', avant: 19, apres: 19 }), 'Liste à jour : 19 pièces, rien n’a changé')
  assert.equal(messageActualisation({ etat: 'fait', avant: 1, apres: 1 }), 'Liste à jour : 1 pièce, rien n’a changé')
  assert.equal(messageActualisation({ etat: 'fait', avant: 34, apres: 19 }), 'Liste actualisée : 19 pièces au lieu de 34')
  assert.equal(messageActualisation({ etat: 'echec' }), 'L’actualisation n’a pas abouti. Réessayez dans un instant.')
  for (const e of [{ etat: 'fait', avant: 3, apres: 2 }, { etat: 'echec' }] as const) assert.doesNotMatch(messageActualisation(e), /manquant|incomplet|absent|!/i)
})

test('l’écran des pièces affiche ce retour sous « Actualiser »', () => {
  const src = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.match(src, /messageActualisation\(actualisation\)/)
  assert.match(src, /role="status"/)
})
