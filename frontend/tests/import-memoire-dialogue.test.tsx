// « Importer un mémoire » (Mon entreprise › Certifications et références) : le dialogue était cassé. Il était posé à la main
// (`fixed inset-0`, sans portail) à l'intérieur d'une section animée : un ancêtre transformé devient le repère d'un élément
// `fixed`, si bien que le voile et la fenêtre se plaçaient dans la section et non sur l'écran, sans piège de focus.
// Correctif : le Dialogue du système (Radix : portail, Échap, voile, piège et retour du focus).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const code = sansCommentaires(lire('src/components/entreprise/ImportMemoire.tsx'))

test('« Importer un mémoire » est le Dialogue du système : plus de fenêtre `fixed` posée à la main, sans portail', () => {
  assert.match(code, /from '@\/components\/ui\/dialogue'/)
  assert.match(code, /<Dialogue\b/)
  assert.doesNotMatch(code, /\bfixed\b/, 'aucun élément `fixed` : le portail est celui du Dialogue')
  assert.doesNotMatch(code, /role="dialog"|aria-modal/, 'pas de dialogue fait main')
  assert.doesNotMatch(code, /createPortal|backdrop-blur/)
})

test('l’import en cours se lit dans le bouton (libellé qui change) : ni roue, ni second voile par-dessus le dialogue', () => {
  assert.match(code, /libelleEnCours=/)
  assert.doesNotMatch(code, /animate-spin|ImportProgress/)
})

test('l’erreur d’import est une phrase : jamais un objet sérialisé ni le message brut', () => {
  assert.doesNotMatch(code, /JSON\.stringify/)
  assert.match(code, /messageErreur\(/)
})

test('le dialogue est monté par le formulaire avec `ouvert` (Radix gère l’ouverture et la fermeture)', () => {
  const formulaire = sansCommentaires(lire('src/components/entreprise/FormCertifications.tsx'))
  assert.match(formulaire, /<ImportDialog ouvert=\{dialogue\}/)
})
