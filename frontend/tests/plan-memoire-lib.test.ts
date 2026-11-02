// Plan du mémoire : gestes du patron et résumé (fonctions pures de lib/planMemoire).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ajouter, basculerRetrait, casesCochees, changerFiche, corpsPlan, deplacer, ficheRemplie, numeroDansLaPartie,
  parGroupe, peutDeplacer, renommer, resumeDuPlan, supprimerAjout, type PartiePlan,
} from '@/lib/planMemoire'

const p = (cle: string, titre = cle, extra: Partial<PartiePlan> = {}): PartiePlan => ({
  cle, partie: cle.split('.')[0] as PartiePlan['partie'], titre, titre_modele: titre, retiree: false, attendue: null,
  fiche: { references: null, personnes: null, materiel: null, voulu: '' },
  sous_criteres: [], attendues: [], source: null, exigences: [],
  propose: { references: [], personnes: [], materiel: [] }, ...extra,
})
const PLAN = [p('partie_a.x'), p('partie_a.y'), p('partie_a.z'), p('partie_b.u'), p('partie_c.v')]

test('déplacer reste dans la même partie A/B/C et saute les parties retirées', () => {
  assert.deepEqual(deplacer(PLAN, 'partie_a.x', 1).map((q) => q.cle), ['partie_a.y', 'partie_a.x', 'partie_a.z', 'partie_b.u', 'partie_c.v'])
  assert.deepEqual(deplacer(PLAN, 'partie_a.z', 1).map((q) => q.cle), PLAN.map((q) => q.cle))      // bas de la partie A
  assert.deepEqual(deplacer(PLAN, 'partie_b.u', -1).map((q) => q.cle), PLAN.map((q) => q.cle))     // jamais vers la partie A
  const retiree = [p('partie_a.x'), p('partie_a.y', 'y', { retiree: true }), p('partie_a.z')]
  assert.deepEqual(deplacer(retiree, 'partie_a.x', 1).map((q) => q.cle), ['partie_a.z', 'partie_a.y', 'partie_a.x'])   // saute la partie retirée
  assert.equal(peutDeplacer(PLAN, 'partie_a.x', -1), false)
  assert.equal(peutDeplacer(PLAN, 'partie_a.x', 1), true)
})

test('retirer, remettre, et garder au moins une partie', () => {
  const retire = basculerRetrait(PLAN, 'partie_a.y')
  assert.equal(retire.find((q) => q.cle === 'partie_a.y')?.retiree, true)
  assert.equal(basculerRetrait(retire, 'partie_a.y').find((q) => q.cle === 'partie_a.y')?.retiree, false)
  const seule = [p('partie_a.x')]
  assert.equal(basculerRetrait(seule, 'partie_a.x')[0].retiree, false)
})

test('renommer borne le titre ; la numérotation suit les parties gardées', () => {
  assert.equal(renommer(PLAN, 'partie_a.x', 'x'.repeat(200))[0].titre.length, 120)
  const retire = basculerRetrait(PLAN, 'partie_a.x')
  assert.equal(numeroDansLaPartie(retire, 'partie_a.y'), 1)
  assert.equal(numeroDansLaPartie(retire, 'partie_a.x'), null)
})

test('ajouter pose la partie à la fin de A, B ou C, avec le numéro suivant', () => {
  const a = ajouter(PLAN, 'partie_b', 'Suivi connecté')
  assert.deepEqual(a.map((q) => q.cle), ['partie_a.x', 'partie_a.y', 'partie_a.z', 'partie_b.u', 'partie_b.ajout_1', 'partie_c.v'])
  assert.equal(ajouter(a, 'partie_b', ' ')[5].titre, 'Nouvelle partie')
  assert.equal(ajouter(a, 'partie_b', 'Autre')[5].cle, 'partie_b.ajout_2')
  assert.deepEqual(supprimerAjout(a, 'partie_b.ajout_1').map((q) => q.cle), PLAN.map((q) => q.cle))
  assert.equal(supprimerAjout(a, 'partie_a.x').length, a.length)             // une partie du modèle ne se supprime pas
})

test('fiche : cases cochées = choix du patron, sinon proposition ; une fiche touchée est « remplie »', () => {
  const prop = [{ id: 'r1', libelle: 'R1', detail: null, coche: true }, { id: 'r2', libelle: 'R2', detail: null, coche: false }]
  assert.deepEqual([...casesCochees(null, prop)], ['r1'])
  assert.deepEqual([...casesCochees(['r2'], prop)], ['r2'])
  assert.deepEqual([...casesCochees([], prop)], [])
  const f = changerFiche(PLAN, 'partie_a.x', { voulu: 'Insister sur le SAV' })
  assert.equal(ficheRemplie(f[0].fiche), true)
  assert.equal(ficheRemplie(PLAN[0].fiche), false)
  assert.equal(ficheRemplie(changerFiche(PLAN, 'partie_a.x', { references: [] })[0].fiche), true)
})

test('le corps envoyé ne contient que ce que le serveur accepte', () => {
  const corps = corpsPlan([p('partie_a.x', 'T', { sous_criteres: [{ critere: 'c', nom: 'n', poids: 1 }] })])
  assert.deepEqual(Object.keys(corps.parties[0]).sort(), ['attendue', 'cle', 'fiche', 'retiree', 'titre'])
})

test('résumé : chaque morceau seulement s’il existe', () => {
  const resume = (r: Partial<Parameters<typeof resumeDuPlan>[0]['resume']>) => resumeDuPlan({ resume: {
    parties: 22, retirees: 3, sous_criteres_total: 5, sous_criteres_servis: 5, limite_pages: 20, fiches_remplies: 3, ...r } })
  assert.equal(resume({}), '22 parties · 5 sur 5 sous-critères servis · limite 20 pages · 3 fiches remplies')
  assert.equal(resume({ parties: 1, sous_criteres_total: 0, limite_pages: null, fiches_remplies: 1 }), '1 partie · 1 fiche remplie')
  assert.equal(parGroupe(PLAN).map((g) => g.parties.length).join(), '3,1,1')
})
