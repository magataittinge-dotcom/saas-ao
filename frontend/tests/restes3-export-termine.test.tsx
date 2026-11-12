// RESTES-3 (PARCOURS-2, vus en route) : l'Export d'un AO gagné ou perdu gardait « Réunir les pièces » en bouton plein. Sur un
// AO terminé (déposé, gagné, perdu, sans suite), aucune action de préparation n'est le bouton principal : la correction du
// résultat est dans le bandeau de la page (Project.tsx). Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boutonsExport } from '@/lib/etatAO'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const MAINTENANT = new Date(2026, 10, 10, 9, 0, 0)
const ao = (p: Partial<Project>): Project => ({
  id: 'a', organization_id: 'o', name: 'Salle des fêtes', status: 'en_cours', current_step: 7, created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
  echeance: { date: '2026-11-20', heure: '12h00' }, ...p,
} as Project)

test('AO terminé : ni « Réunir les pièces », ni téléchargement en bouton principal', () => {
  for (const status of ['gagné', 'perdu', 'soumis', 'sans_suite'] as const) {
    assert.deepEqual(boutonsExport(ao({ status }), true, MAINTENANT), { telecharger: 'secondaire', reunirPieces: false }, status)
    assert.deepEqual(boutonsExport(ao({ status }), false, MAINTENANT), { telecharger: 'secondaire', reunirPieces: false }, status)
  }
})

test('AO en cours : inchangé (« Réunir les pièces » en principal tant qu’aucune pièce n’est jointe, sinon le téléchargement)', () => {
  assert.deepEqual(boutonsExport(ao({}), true, MAINTENANT), { telecharger: 'secondaire', reunirPieces: true })
  assert.deepEqual(boutonsExport(ao({}), false, MAINTENANT), { telecharger: 'principal', reunirPieces: false })
})

test('l’Export lit ses boutons dans boutonsExport', () => {
  const exp = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.match(exp, /const boutons = boutonsExport\(project, aucunePieceJointe\)/)
  assert.match(exp, /<Bouton variante=\{boutons\.telecharger\} onClick=\{telechargerDossier\}/)
  assert.match(exp, /const boutonPieces = boutons\.reunirPieces\s*\?/)
})
