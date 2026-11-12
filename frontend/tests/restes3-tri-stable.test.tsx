// RESTES-3 (PERF § 6) : deux AO de même date de remise changeaient d'ordre d'un passage à l'autre. L'ordre départageait les
// ex aequo par l'ordre du serveur (mise à jour la plus récente) : une écriture (avant D-05, la lecture des champs critiques)
// suffisait à les intervertir. Les ex aequo se départagent par le nom, puis l'identifiant, quel que soit l'ordre reçu.
// Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aoAMettreAJour } from '@/components/dashboard/BandeAO'
import { aLaUne } from '@/lib/etatAO'
import type { Project } from '@/types'

const MAINTENANT = new Date(2026, 10, 10, 9, 0, 0)
const ao = (id: string, name: string, date: string): Project => ({
  id, organization_id: 'o', name, status: 'en_cours', current_step: 4, created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
  echeance: { date, heure: '12h00' },
} as Project)

test('à mettre à jour : même remise, même ordre quel que soit l’ordre du serveur', () => {
  const a = ao('id-2', 'gueux inventé', '2026-04-10')
  const b = ao('id-1', 'DCE inventé', '2026-04-10')
  const c = ao('id-3', 'DCE inventé', '2026-04-10')
  const d = ao('id-4', 'Plus récent', '2026-11-03')
  const attendu = ['id-4', 'id-1', 'id-3', 'id-2']
  assert.deepEqual(aoAMettreAJour([a, b, c, d], MAINTENANT).map((p) => p.id), attendu)
  assert.deepEqual(aoAMettreAJour([d, c, b, a], MAINTENANT).map((p) => p.id), attendu)
})

test('À la une : même remise, le même AO quel que soit l’ordre du serveur', () => {
  const x = ao('id-9', 'Zèbre inventé', '2026-11-20')
  const y = ao('id-8', 'Alpha inventé', '2026-11-20')
  assert.equal(aLaUne([x, y], MAINTENANT)?.id, 'id-8')
  assert.equal(aLaUne([y, x], MAINTENANT)?.id, 'id-8')
})
