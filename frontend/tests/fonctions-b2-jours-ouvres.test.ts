// B2 — « J−6 » devient « J−6 · 4 jours ouvrés » : lundi à vendredi, hors les onze jours fériés de l'article L3133-1 du
// Code du travail (lundi de Pâques, Ascension et lundi de Pentecôte calculés depuis Pâques), au calendrier de Paris.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estFerie, joursOuvresRestants, libelleJoursOuvres, paques } from '@/lib/joursOuvres'
import { etatEcheance } from '@/lib/echeance'
import { instantParis } from '@/lib/remiseParis'

const fin = (an: number, mois: number, jour: number) => instantParis(an, mois, jour, 23, 59, 59)
const matin = (an: number, mois: number, jour: number) => instantParis(an, mois, jour, 9, 0, 0)

test('Pâques : 5 avril 2026, 28 mars 2027, 16 avril 2028', () => {
  assert.deepEqual(paques(2026), { mois: 4, jour: 5 })
  assert.deepEqual(paques(2027), { mois: 3, jour: 28 })
  assert.deepEqual(paques(2028), { mois: 4, jour: 16 })
})

test('les onze jours fériés de L3133-1, et rien d’autre', () => {
  const feries2027 = [[1, 1], [3, 29], [5, 1], [5, 6], [5, 8], [5, 17], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]]
  for (const [mois, jour] of feries2027) assert.equal(estFerie(2027, mois, jour), true, `${jour}/${mois}/2027`)
  let total = 0
  for (let mois = 1; mois <= 12; mois += 1) for (let jour = 1; jour <= 31; jour += 1) if (estFerie(2027, mois, jour)) total += 1
  assert.equal(total, 11)
  // ni le Vendredi saint ni le 26 décembre (Alsace-Moselle seulement), ni le dimanche de Pâques lui-même
  assert.equal(estFerie(2027, 3, 26), false)
  assert.equal(estFerie(2027, 12, 26), false)
  assert.equal(estFerie(2027, 3, 28), false)
})

test('le 11 novembre 2026 (mercredi) ne compte pas : du lundi 9 au vendredi 13, trois jours ouvrés', () => {
  assert.equal(joursOuvresRestants(fin(2026, 11, 13), matin(2026, 11, 9)), 3)
})

test('le lundi de Pâques 2027 (29 mars) ne compte pas : du vendredi 26 au mardi 30, un jour ouvré', () => {
  assert.equal(joursOuvresRestants(fin(2027, 3, 30), matin(2027, 3, 26)), 1)
})

test('l’Ascension 2027 (jeudi 6 mai) ne compte pas : du lundi 3 au vendredi 7, trois jours ouvrés', () => {
  assert.equal(joursOuvresRestants(fin(2027, 5, 7), matin(2027, 5, 3)), 3)
})

test('le jour de la remise compte s’il est ouvré, aujourd’hui ne compte pas ; une remise passée : zéro', () => {
  assert.equal(joursOuvresRestants(fin(2026, 11, 17), matin(2026, 11, 16)), 1)   // lundi → mardi
  assert.equal(joursOuvresRestants(fin(2026, 11, 15), matin(2026, 11, 13)), 0)   // vendredi → dimanche
  assert.equal(joursOuvresRestants(fin(2026, 11, 13), matin(2026, 11, 13)), 0)
  assert.equal(joursOuvresRestants(fin(2026, 11, 10), matin(2026, 11, 13)), 0)
  // au calendrier de Paris : 23 h 30 à Paris le jeudi (22 h 30 UTC), remise le vendredi
  assert.equal(joursOuvresRestants(fin(2026, 11, 13), instantParis(2026, 11, 12, 23, 30, 0)), 1)
})

test('les mots : « 4 jours ouvrés », « 1 jour ouvré », « aucun jour ouvré »', () => {
  assert.equal(libelleJoursOuvres(4), '4 jours ouvrés')
  assert.equal(libelleJoursOuvres(1), '1 jour ouvré')
  assert.equal(libelleJoursOuvres(0), 'aucun jour ouvré')
})

test('une seule mise en forme : l’échéance écrit « J−6 · 4 jours ouvrés » et garde le compte', () => {
  // jeudi 12 novembre 2026 → mercredi 18 : vendredi, lundi, mardi, mercredi
  const e = etatEcheance({ date: '2026-11-18', heure: '12h00' }, matin(2026, 11, 12))
  assert.equal(e.libelle, 'J−6 · 4 jours ouvrés')
  assert.equal(e.ouvres, 4)
  assert.equal(e.jours, 6)
  // le jour même et une remise passée ne changent pas
  assert.equal(etatEcheance({ date: '2026-11-12', heure: '12h00' }, matin(2026, 11, 12)).libelle, 'Aujourd’hui, 12h00')
  assert.equal(etatEcheance({ date: '2026-11-10' }, matin(2026, 11, 12)).libelle, 'Date de remise passée')
  assert.equal(etatEcheance({ date: '2026-11-10' }, matin(2026, 11, 12)).ouvres, null)
})
