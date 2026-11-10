// B1 — l'écran Décider d'un AO dont la lecture n'a pas démarré dit la vérité au lieu d'un « 0 % » sans fin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lectureNonDemarree } from '@/lib/lectureNonDemarree'
import { lire } from './outils/sources'

const base = { nbExigences: 0, statutTraitement: 'ready', phaseFlux: 'pending' as const, donneesAJour: true }

test('aucune exigence, aucun traitement, aucun échec : la lecture n’a pas démarré', () => {
  assert.equal(lectureNonDemarree(base), true)
  assert.equal(lectureNonDemarree({ ...base, statutTraitement: undefined }), true)
})

test('une lecture en cours, un flux actif, un échec ou des exigences : l’écran habituel', () => {
  assert.equal(lectureNonDemarree({ ...base, statutTraitement: 'analyzing' }), false)
  assert.equal(lectureNonDemarree({ ...base, phaseFlux: 'in_progress' }), false)
  assert.equal(lectureNonDemarree({ ...base, phaseFlux: 'error' }), false)
  assert.equal(lectureNonDemarree({ ...base, statutTraitement: 'error' }), false)
  assert.equal(lectureNonDemarree({ ...base, nbExigences: 3 }), false)
})

test('tant que le projet n’est pas relu (lancement en train de se confirmer), pas de fausse alerte', () => {
  assert.equal(lectureNonDemarree({ ...base, donneesAJour: false }), false)
})

test('l’écran Décider l’utilise : titre, bouton « Relancer » vers Lots, plus de « 0 % » sans fin', () => {
  const src = lire('src/routes/project/StepAnalysis.tsx')
  assert.match(src, /lectureNonDemarree\(/)
  assert.match(src, /L’analyse n’a pas démarré/)
  assert.match(src, /Relancer/)
  assert.match(src, /\/lots`/)
})
