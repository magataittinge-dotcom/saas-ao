// B3/B4 — le plan suivi à la rédaction : sections, sommaire et éditeur (aller-retour exact) suivent le plan du patron.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sectionsDuContenu, sommaireMemoire, SECTIONS_MEMOIRE } from '@/lib/memoireSections'
import { depuisMarkdown, versMarkdown } from '@/lib/memoireMarkdown'
import type { MemoireContent } from '@/types'

const AVEC_PLAN = {
  preambule: 'Préambule.',
  partie_a: { historique: 'Fondée en 1999.', implantation: 'Caen.' },
  partie_b: { dechets: 'Tri sur site.' },
  partie_c: { ajout_1: 'Tablettes et relevés.' },
  _plan: { parties: [
    { partie: 'partie_a', sous_cle: 'historique', titre: 'Notre histoire' },
    { partie: 'partie_a', sous_cle: 'implantation', titre: 'Où nous sommes' },
    { partie: 'partie_b', sous_cle: 'dechets', titre: 'Gestion des déchets' },
    { partie: 'partie_c', sous_cle: 'ajout_1', titre: 'Suivi connecté' },
  ] },
} as unknown as MemoireContent

test('sans plan, les 25 sections du modèle, telles quelles', () => {
  assert.equal(sectionsDuContenu({ }), SECTIONS_MEMOIRE)
  assert.equal(sectionsDuContenu(undefined), SECTIONS_MEMOIRE)
})

test('avec plan : titres du patron, renumérotés dans chaque partie, partie ajoutée comprise', () => {
  const s = sectionsDuContenu(AVEC_PLAN)
  assert.deepEqual(s.map((x) => `${x.part}.${x.cle}|${x.titre}`), [
    'partie_a.historique|1. Notre histoire', 'partie_a.implantation|2. Où nous sommes',
    'partie_b.dechets|1. Gestion des déchets', 'partie_c.ajout_1|1. Suivi connecté',
  ])
})

test('le sommaire suit le plan', () => {
  const entrees = sommaireMemoire(AVEC_PLAN)
  const c = entrees.find((e) => e.id === 'partie-c')
  assert.deepEqual(c?.enfants.map((e) => [e.id, e.titre]), [['sec-ajout_1', '1. Suivi connecté']])
})

test('l’éditeur : aller-retour exact avec un plan, partie ajoutée comprise', () => {
  const md = versMarkdown(AVEC_PLAN)
  assert.match(md, /## 1\. Suivi connecté/)
  assert.deepEqual(depuisMarkdown(md, AVEC_PLAN), AVEC_PLAN)
  const retouche = md.replace('Tablettes et relevés.', 'Tablettes, relevés et photos.')
  assert.equal((depuisMarkdown(retouche, AVEC_PLAN).partie_c as unknown as Record<string, string>).ajout_1, 'Tablettes, relevés et photos.')
  assert.deepEqual(depuisMarkdown(retouche, AVEC_PLAN)._plan, AVEC_PLAN._plan)
})
