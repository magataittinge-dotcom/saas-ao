// Détails de la recette du 4/11 — « Plan validé le 3 novembre » alors qu'il était 0 h 05 à Paris le 4 : les dates du serveur
// (UTC, sans fuseau) s'affichaient dans le fuseau de l'ordinateur, avec trois mises en forme différentes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jourCourtParis, jourLongParis, heureParis, lireDate } from '@/lib/dateParis'
import { libelleValidation } from '@/components/plan/ActionsPlan'
import { lire, sansCommentaires } from './outils/sources'

test('23:30 UTC le 3 novembre = 0:30 le 4 novembre à Paris (heure d\'hiver), avec ou sans « Z »', () => {
  for (const iso of ['2026-11-03T23:30:00Z', '2026-11-03T23:30:00', '2026-11-03T23:30:00.123456']) {
    assert.equal(jourLongParis(iso), '4 novembre', iso)
    assert.equal(jourCourtParis(iso), '4 nov.', iso)
    assert.equal(heureParis(iso), '00:30', iso)
  }
})

test('heure d\'été : 22:30 UTC le 3 juillet = 0:30 le 4 juillet à Paris', () => {
  assert.equal(jourLongParis('2026-07-03T22:30:00'), '4 juillet')
  assert.equal(jourCourtParis('2026-07-03T22:30:00'), '4 juil.')
})

test('une date illisible ne donne rien d\'inventé', () => {
  assert.equal(lireDate('pas une date'), null)
  assert.equal(jourCourtParis(null), '')
  assert.equal(jourLongParis('n\'importe quoi'), '')
})

test('« Plan validé le … » suit l\'heure de Paris', () => {
  assert.equal(libelleValidation('2026-11-03T23:30:00'), 'Plan validé le 4 novembre')
  assert.equal(libelleValidation(null), 'Plan validé')
})

test('les écrans de Mes AO, du Plan et de l\'Export n\'ont plus leur propre mise en forme des dates du serveur', () => {
  for (const f of ['src/components/plan/ActionsPlan.tsx', 'src/routes/project/StepExport.tsx']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /toLocaleDateString/, f)
  }
  assert.doesNotMatch(sansCommentaires(lire('src/routes/project/StepMemoire.tsx')), /toLocaleTimeString/)
  assert.match(sansCommentaires(lire('src/lib/mesAO.ts')), /jourCourtParis\(/)
})

// Export : « 15 pièces à joindre » en haut, « 14 pièces demandées · 1 facultative » dessous.
import { pieceDemandee } from '@/lib/exportDossier'
import { comptesDetailles } from '@/lib/resumePieces'

test('Export : la ligne « N pièces à joindre » ne compte pas la pièce facultative (même nombre que les cartes de l\'écran Pièces)', () => {
  const lignes = [
    { id: 'a', status: 'missing', obligation: 'obligatoire' },
    { id: 'b', status: 'missing', obligation: 'obligatoire' },
    { id: 'c', status: 'missing', obligation: 'facultatif' },
  ] as unknown as Parameters<typeof pieceDemandee>[0][]
  const c = comptesDetailles(lignes as never, null)
  const aJoindre = lignes.filter((l) => l.status !== 'present' && pieceDemandee(l, null)).length
  assert.equal(aJoindre, c.aJoindre + c.aRenouveler)
  assert.equal(c.autres, 1)
  assert.equal(pieceDemandee(lignes[2], null), false)
  assert.equal(pieceDemandee(lignes[0], null), true)
  assert.doesNotMatch(sansCommentaires(lire('src/routes/project/StepExport.tsx')), /totalPieces - conformes/)
})
