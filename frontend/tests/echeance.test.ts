// 1.14 — Une seule fonction d'échéance, à la minute près, heure limite comprise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avancementAO, echeanceAO, estEnCours, etatEcheance, momentLimite } from '@/lib/echeance'

// Dates construites en heure locale : le test ne dépend pas du fuseau de la machine.
const le = (j: number, mois: number, h = 0, min = 0) => new Date(2026, mois - 1, j, h, min, 0)
const REMISE = { date: '2026-04-10', heure: '14h00' }

test('le jour même : « Aujourd\'hui » jusqu\'à l\'heure limite comprise, puis « Date de remise passée »', () => {
  assert.equal(etatEcheance(REMISE, le(10, 4, 9, 0)).etat, 'aujourdhui')
  assert.equal(etatEcheance(REMISE, le(10, 4, 9, 0)).libelle, "Aujourd'hui, 14h00")
  assert.equal(etatEcheance(REMISE, le(10, 4, 13, 59)).etat, 'aujourdhui')
  assert.equal(etatEcheance(REMISE, le(10, 4, 14, 0)).etat, 'aujourdhui') // heure limite comprise
  assert.equal(etatEcheance(REMISE, le(10, 4, 14, 1)).etat, 'passee')
  assert.equal(etatEcheance(REMISE, le(10, 4, 14, 1)).libelle, 'Date de remise passée')
})

test('passage de minuit : J−1 à 23h59 la veille, « Aujourd\'hui » à 0h00', () => {
  assert.deepEqual(
    [etatEcheance(REMISE, le(9, 4, 23, 59)).etat, etatEcheance(REMISE, le(9, 4, 23, 59)).libelle],
    ['proche', 'J−1'],
  )
  assert.equal(etatEcheance(REMISE, le(10, 4, 0, 0)).etat, 'aujourdhui')
})

test('le lendemain et au-delà : toujours « Date de remise passée », jamais « À déposer » ni « Aujourd\'hui »', () => {
  assert.equal(etatEcheance(REMISE, le(11, 4, 9, 0)).etat, 'passee')
  assert.equal(etatEcheance(REMISE, le(11, 4, 23, 0)).etat, 'passee')
  assert.equal(etatEcheance(REMISE, le(20, 6, 9, 0)).etat, 'passee')
})

test('J−7 encore « proche », J−8 « à venir »', () => {
  assert.deepEqual([etatEcheance(REMISE, le(3, 4, 10)).etat, etatEcheance(REMISE, le(3, 4, 10)).libelle], ['proche', 'J−7'])
  assert.deepEqual([etatEcheance(REMISE, le(2, 4, 10)).etat, etatEcheance(REMISE, le(2, 4, 10)).libelle], ['a_venir', 'J−8'])
})

test('sans heure connue : la limite est la fin du jour dit', () => {
  const jour = { date: '2026-04-10' }
  assert.equal(etatEcheance(jour, le(10, 4, 23, 58)).etat, 'aujourdhui')
  assert.equal(etatEcheance(jour, le(11, 4, 0, 0)).etat, 'passee')
  assert.equal(momentLimite({ date: '2026-04-10', heure: '9h' })?.getHours(), 9)
  assert.equal(momentLimite({ date: '2026-04-10', heure: '17:30' })?.getMinutes(), 30)
})

test('sans date : état « sans date », pas de chiffre', () => {
  assert.deepEqual(etatEcheance(null), { etat: 'sans_date', jours: null, libelle: '—', limite: null })
  assert.equal(etatEcheance({ date: 'vendredi' }).etat, 'sans_date')
})

test("l'échéance d'un AO : celle du serveur, sinon la date saisie, sinon celle du RC", () => {
  assert.deepEqual(echeanceAO({ echeance: REMISE, deadline: '2026-05-01' }), REMISE)
  assert.deepEqual(echeanceAO({ deadline: '2026-05-01' }), { date: '2026-05-01' })
  assert.deepEqual(echeanceAO({ infos_marche: { date_limite_reponse: '2026-04-10' } }), { date: '2026-04-10' })
  assert.equal(echeanceAO({}), null)
})

test('« en cours » et avancement : une seule définition', () => {
  assert.deepEqual(['brouillon', 'en_cours', 'analyzed', 'sans_suite', 'soumis', 'gagné', 'perdu'].map(estEnCours),
    [true, true, true, false, false, false, false])
  assert.deepEqual(avancementAO(5), { etape: 5, total: 6, nom: 'Mémoire', ratio: 5 / 6, libelle: 'Étape 5 sur 6 · Mémoire' })
  assert.equal(avancementAO(9).etape, 6)
  assert.equal(avancementAO(0).etape, 1)
})

test('tableau de bord : jamais « dans les temps » ni « de la marge » quand ce n\'est pas vrai', async () => {
  const { lire, sansCommentaires } = await import('./outils/sources')
  const code = sansCommentaires(lire('src/routes/Dashboard.tsx'))
  assert.doesNotMatch(code, /vous êtes dans les temps/)
  assert.match(code, /next\.current_step >= 6/)              // « dossier prêt » seulement à l'étape Export
  assert.match(code, /La date de remise de « \$\{datePassee\.name\} » est passée\./)
})
