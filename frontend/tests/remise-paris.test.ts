// Q-08 (restes 2) — une date de remise est lue et comparée à l'heure de Paris, quel que soit le fuseau de la machine.
// Tous les instants sont écrits en UTC (Date.UTC / « Z ») : le test ne dépend pas du fuseau où il tourne (vérifié aussi
// avec TZ=America/New_York et TZ=Pacific/Auckland, rapport RESTES-2).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etatEcheance as etatEcheanceParis } from '@/lib/echeance'
import {
  decalageParis, heureCourteParis, heureLimiteParis, instantParis, joursParis, jourSemaineParis,
  momentLimiteParis, momentParis,
} from '@/lib/remiseParis'

const utc = (iso: string) => new Date(iso)
const REMISE = { date: '2026-04-10', heure: '14h00' }          // heure d'été : Paris = UTC + 2

test('décalage de Paris : 60 minutes l’hiver, 120 l’été', () => {
  assert.equal(decalageParis(utc('2026-01-15T12:00:00Z')), 60)
  assert.equal(decalageParis(utc('2026-07-15T12:00:00Z')), 120)
})

test('le moment limite est l’heure murale de Paris (été, hiver, sans heure = 23:59:59 à Paris)', () => {
  assert.equal(momentLimiteParis(REMISE)?.toISOString(), '2026-04-10T12:00:00.000Z')
  assert.equal(momentLimiteParis({ date: '2026-11-20', heure: '14h30' })?.toISOString(), '2026-11-20T13:30:00.000Z')
  assert.equal(momentLimiteParis({ date: '2026-11-20', heure: '9:05' })?.toISOString(), '2026-11-20T08:05:00.000Z')
  assert.equal(momentLimiteParis({ date: '2026-04-10' })?.toISOString(), '2026-04-10T21:59:59.000Z')
  assert.equal(momentLimiteParis({ date: '2026-04-10T00:00:00' })?.toISOString(), '2026-04-10T21:59:59.000Z')
  assert.equal(momentLimiteParis({ date: 'le 10 avril' }), null)
  assert.equal(momentLimiteParis(null), null)
})

test('autour de minuit à Paris (UTC est encore la veille) : J−1 à 23:59, « Aujourd’hui » à 0:00', () => {
  const veille = etatEcheanceParis(REMISE, utc('2026-04-09T21:59:00Z'))   // 23:59 le 9 à Paris
  assert.deepEqual([veille.etat, veille.jours, veille.libelle], ['proche', 1, 'J−1 · 1 jour ouvré'])
  const minuit = etatEcheanceParis(REMISE, utc('2026-04-09T22:00:00Z'))   // 0:00 le 10 à Paris, 22:00 le 9 en UTC
  assert.deepEqual([minuit.etat, minuit.jours, minuit.libelle], ['aujourdhui', 0, 'Aujourd’hui, 14h00'])
})

test('heure limite comprise, puis « Date de remise passée » ; le lendemain à Paris, -1 jour', () => {
  assert.equal(etatEcheanceParis(REMISE, utc('2026-04-10T12:00:00Z')).etat, 'aujourdhui')
  const passee = etatEcheanceParis(REMISE, utc('2026-04-10T12:01:00Z'))
  assert.deepEqual([passee.etat, passee.libelle], ['passee', 'Date de remise passée'])
  assert.equal(etatEcheanceParis(REMISE, utc('2026-04-10T22:30:00Z')).jours, -1)  // 0:30 le 11 à Paris
  assert.deepEqual(etatEcheanceParis(null), { etat: 'sans_date', jours: null, ouvres: null, libelle: '—', limite: null })
  assert.equal(etatEcheanceParis(REMISE, utc('2026-03-25T09:00:00Z')).etat, 'a_venir')
})

test('passage à l’heure d’été (29 mars 2026, 2 h → 3 h) : 2 h 30 n’existe pas, on prend 3 h 30 ; les jours restent entiers', () => {
  assert.equal(instantParis(2026, 3, 29, 2, 30).toISOString(), '2026-03-29T01:30:00.000Z')
  assert.equal(heureCourteParis(instantParis(2026, 3, 29, 2, 30)), '3 h 30')
  assert.equal(instantParis(2026, 3, 29, 3, 0).toISOString(), '2026-03-29T01:00:00.000Z')
  assert.equal(instantParis(2026, 3, 29, 1, 59).toISOString(), '2026-03-29T00:59:00.000Z')
  // la nuit du changement ne compte que 23 heures : toujours un jour de calendrier
  assert.equal(joursParis(instantParis(2026, 3, 30, 14), instantParis(2026, 3, 28, 12)), 2)
  assert.equal(etatEcheanceParis({ date: '2026-03-29' }, utc('2026-03-28T23:00:00Z')).jours, 0)  // 0:00 le 29 à Paris
})

test('passage à l’heure d’hiver (25 oct. 2026, 3 h → 2 h) : 2 h 30 existe deux fois, on prend la première (été)', () => {
  assert.equal(instantParis(2026, 10, 25, 2, 30).toISOString(), '2026-10-25T00:30:00.000Z')
  assert.equal(instantParis(2026, 10, 25, 14).toISOString(), '2026-10-25T13:00:00.000Z')
  assert.equal(momentLimiteParis({ date: '2026-10-25' })?.toISOString(), '2026-10-25T22:59:59.000Z')
  // la nuit du changement compte 25 heures : toujours un jour de calendrier
  assert.equal(joursParis(instantParis(2026, 10, 26, 9), instantParis(2026, 10, 25, 23, 30)), 1)
})

test('affichage à Paris : « vendredi 10 avril », « 14 h », « 14h00 »', () => {
  const limite = momentLimiteParis(REMISE)!
  assert.equal(jourSemaineParis(limite), 'vendredi 10 avril')
  assert.equal(heureCourteParis(limite), '14 h')
  assert.equal(heureLimiteParis(limite), '14h00')
  assert.deepEqual(momentParis(utc('2026-12-31T23:30:00Z')), { an: 2027, mois: 1, jour: 1, heure: 0, minute: 30, seconde: 0 })
})

test('les écrans disent la remise et les dates du serveur à l’heure de Paris (Mes AO, veille, rétro-planning)', async () => {
  const { quandCourt, jourCourt } = await import('@/lib/mesAO')
  const { dateTerminee } = await import('@/components/mesao/Termines')
  const { libelleActualisation } = await import('@/components/veille/VeilleAccueil')
  const projet = (extra: object) => ({ id: 'p', name: 'AO', status: 'en_cours', updated_at: '2026-11-03T23:30:00', ...extra }) as never
  assert.equal(quandCourt(projet({ echeance: { date: '2026-11-06', heure: '12h00' } })), 'ven. 6 nov., 12 h')
  assert.equal(jourCourt(utc('2026-11-05T23:30:00Z')), '6 nov.')                         // 0:30 le 6 à Paris
  assert.equal(dateTerminee(projet({ status: 'soumis', depose_at: '2026-11-03T23:30:00' })), 'déposé le 4 nov.')
  assert.equal(dateTerminee(projet({ status: 'perdu' })), 'mis à jour le 4 nov.')
  assert.equal(libelleActualisation('2026-10-31T07:12:00Z'), 'Données BOAMP du 31/10 à 08:12')
  assert.equal(libelleActualisation(null), null)
})
