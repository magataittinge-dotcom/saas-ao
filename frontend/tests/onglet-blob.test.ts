// P2-3 (REVUE-FRONT) : une pièce de candidature s'ouvrait dans un onglet blob: de même origine qui gardait window.opener,
// avec le type de fichier rendu par le serveur. Sans risque aujourd'hui (le serveur n'accepte que PDF, Word, tableurs et
// images) ; si un jour il acceptait .html ou .svg, ce chemin exécuterait un script dans l'origine de Synorix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { typeAffichable } from '@/lib/adresseSure'
import { lire, sansCommentaires } from './outils/sources'

test('seuls PDF et images matricielles s’affichent ; HTML, SVG, XML et le reste sont des octets à télécharger', () => {
  for (const t of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']) assert.equal(typeAffichable(t), t)
  for (const t of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/javascript', '', 'application/pdf; charset=x',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) assert.equal(typeAffichable(t), 'application/octet-stream', t)
})

test('l’onglet ouvert perd window.opener et reçoit un Blob au type imposé', () => {
  const src = sansCommentaires(lire('src/components/project/CandidatureSectionTemplates.tsx'))
  assert.match(src, /onglet\.opener = null/)
  assert.match(src, /new Blob\(\[data\], \{ type: typeAffichable\(data\.type\) \}\)/)
  assert.doesNotMatch(src, /createObjectURL\(data\)/)
})
