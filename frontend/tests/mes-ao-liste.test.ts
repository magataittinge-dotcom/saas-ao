// Mes AO — le fil réel à 7 étapes, le tri par remise (les AO en cours d'abord), les comptes de l'écran. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIL_ETAPES, avancementAffiche, comparerParRemise, filDeLAO } from '@/lib/mesAO'
import type { Project } from '@/types'

const projet = (over: Partial<Project> = {}): Project => ({
  id: 'p', organization_id: 'o', name: 'AO inventé', status: 'en_cours', current_step: 1, completed_steps: {},
  created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', ...over,
} as Project)

const le = (jour: number, mois: number, h = 12) => new Date(2026, mois - 1, jour, h, 0, 0)

test('le fil compte 7 étapes, comme le fil de l’AO : Plan et Rédiger sont séparés', () => {
  assert.deepEqual([...FIL_ETAPES], ['Dépôt', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'])
})

test('étape affichée : l’étape 5 du serveur est « Plan » tant que le mémoire n’existe pas, puis « Rédiger » ; la 6 est « Export »', () => {
  const cas: [Partial<Project>, number, string][] = [
    [{ current_step: 1 }, 1, 'Dépôt'],
    [{ current_step: 3, status: 'analyzed' }, 3, 'Décider'],
    [{ current_step: 4, status: 'analyzed' }, 4, 'Pièces'],
    [{ current_step: 5 }, 5, 'Plan'],
    [{ current_step: 5, processing_status: 'generating' }, 6, 'Rédiger'],
    [{ current_step: 5, completed_steps: { 5: true } }, 6, 'Rédiger'],
    [{ current_step: 6, completed_steps: { 5: true } }, 7, 'Export'],
  ]
  for (const [over, etape, nom] of cas) {
    const a = avancementAffiche(projet(over))
    assert.deepEqual([a.etape, a.total, a.nom], [etape, 7, nom], JSON.stringify(over))
    assert.equal(a.libelle, `Étape ${etape} sur 7 · ${nom}`)
  }
})

test('le fil : étapes faites avant, une seule en cours, à venir après', () => {
  assert.deepEqual(filDeLAO(projet({ current_step: 5 })).map((e) => e.etat), ['fait', 'fait', 'fait', 'fait', 'cours', 'avenir', 'avenir'])
  assert.deepEqual(filDeLAO(projet({ current_step: 1 })).map((e) => e.etat), ['cours', 'avenir', 'avenir', 'avenir', 'avenir', 'avenir', 'avenir'])
})

test('tri par remise : les AO en cours d’abord (remise la plus proche), les terminés ensuite — jamais en tête', () => {
  const maintenant = le(3, 11)
  const termine = projet({ id: 't', name: 'Terminé', status: 'perdu', deadline: '2026-10-02' })
  const lointain = projet({ id: 'l', name: 'Lointain', deadline: '2026-12-08' })
  const proche = projet({ id: 'c', name: 'Proche', deadline: '2026-11-06' })
  const sansDate = projet({ id: 's', name: 'Sans date' })
  const passee = projet({ id: 'x', name: 'Passée', deadline: '2026-10-20' })
  const tri = [termine, lointain, sansDate, passee, proche].sort((a, b) => comparerParRemise(a, b, maintenant)).map((p) => p.id)
  assert.deepEqual(tri, ['c', 'l', 's', 'x', 't'])
})
