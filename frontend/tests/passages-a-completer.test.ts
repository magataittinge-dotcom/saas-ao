// Phase F (sprint Ozcan) — l'avertissement « N passages à compléter » de l'écran d'export : libellé sobre et positif.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libellePassagesACompleter } from '@/lib/passagesACompleter'
import { lire } from './outils/sources'

test('aucun libellé quand il n\'y a rien à compléter', () => {
  assert.equal(libellePassagesACompleter(0), null)
  assert.equal(libellePassagesACompleter(undefined), null)
  assert.equal(libellePassagesACompleter(null), null)
})

test('singulier et pluriel', () => {
  assert.equal(libellePassagesACompleter(1), '1 passage à compléter avant le dépôt')
  assert.equal(libellePassagesACompleter(3), '3 passages à compléter avant le dépôt')
})

test('jamais de mot négatif', () => {
  for (const n of [1, 2, 12]) assert.doesNotMatch(libellePassagesACompleter(n)!, /manquant|incomplet|absent|erreur/i)
})

test('l\'écran d\'export affiche le libellé, sans couleur en dur', () => {
  const code = lire('src/routes/project/StepExport.tsx')
  assert.match(code, /libellePassagesACompleter\(detail\.memoire_info\.passages_a_completer\)/)
  assert.match(code, /passages_a_completer: number/)
})
