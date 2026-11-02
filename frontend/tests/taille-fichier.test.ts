// R4 — une seule unité pour les tailles (le Mo des fichiers, 1 048 576 octets), virgule décimale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tailleFichier, progressionEnvoi } from '@/lib/tailleFichier'
import { lire, sansCommentaires } from './outils/sources'

test('tailles : virgule décimale, Ko / Mo, rien d\'anglais', () => {
  assert.equal(tailleFichier(0), '')
  assert.equal(tailleFichier(900), '900 o')
  assert.equal(tailleFichier(2048), '2 Ko')
  assert.equal(tailleFichier(1.2 * 1024 * 1024), '1,2 Mo')
  assert.equal(tailleFichier(383_250_000), '365,5 Mo')
})

test('progression d\'envoi : mêmes Mo que la liste, virgule, espace avant le pourcentage', () => {
  assert.equal(progressionEnvoi(285 * 1024 * 1024, 383_250_000, 74), '285,0 / 365,5 Mo (74 %)')
  assert.equal(progressionEnvoi(1024 * 1024, 0, 3), '1,0 / ? Mo (3 %)')
})

test('l\'écran de dépôt n\'a plus de formatage local', () => {
  const code = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  assert.ok(!code.includes('function formatSize'))
  assert.ok(!/\.toFixed\(1\)/.test(code))
  assert.ok(code.includes('tailleFichier(') && code.includes('progressionEnvoi('))
})
