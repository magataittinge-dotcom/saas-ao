// Détails de la recette du 4/11 — titres de page = noms des étapes (« Projet », « Mémoire », « Sélection lots » au lieu de
// « Plan », « Rédiger », « Lots ») ; au dépôt, « Envoi en cours » ne reste pas affiché quand « 93 fichiers déposés » l'est déjà.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEP_LABELS } from '@/components/layout/Header'
import { STEPS } from '@/components/project/StepProgress'
import { lire, sansCommentaires } from './outils/sources'

test('le titre de page de chaque écran de l\'AO est le nom de son étape au fil', () => {
  for (const e of STEPS) assert.equal(STEP_LABELS[e.segment], e.label, e.segment)
  assert.deepEqual(
    ['upload', 'lots', 'analysis', 'verification', 'plan', 'memoire', 'export'].map((s) => STEP_LABELS[s]),
    ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'])
  assert.equal(STEP_LABELS.candidature, 'Pièces')
  assert.doesNotMatch(JSON.stringify(STEP_LABELS), /Projet|Sélection lots|Mémoire/)
})

test('au dépôt, l\'annonce « Envoi en cours » ne s\'affiche que pendant l\'envoi, pas pendant la lecture des fichiers déposés', () => {
  const code = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  assert.match(code, /\{largeFileNotice && phase === 'uploading' && </)
  assert.doesNotMatch(code, /largeFileNotice && \(phase === 'uploading' \|\| phase === 'processing'\)/)
})
