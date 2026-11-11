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

import {
  enTraitement, faitsALaUne, niveauRemise, quandCourt, repartitionTermines, resumeMesAO, texteUnites, uniteMois, versAvisOrigine,
} from '@/lib/mesAO'

test('niveau de la remise : rouge à 3 jours ou moins ou date dépassée, ambre de 4 à 7 jours, sinon neutre', () => {
  const m = le(3, 11)
  const niveau = (deadline?: string) => niveauRemise(projet({ deadline }), m)
  assert.equal(niveau('2026-11-03'), 'rouge') // aujourd'hui
  assert.equal(niveau('2026-11-06'), 'rouge') // J-3
  assert.equal(niveau('2026-11-07'), 'ambre') // J-4
  assert.equal(niveau('2026-11-10'), 'ambre') // J-7
  assert.equal(niveau('2026-11-11'), 'neutre') // J-8
  assert.equal(niveau('2026-10-20'), 'rouge') // dépassée
  assert.equal(niveau(undefined), 'neutre')
})

test('le résumé : en cours, remise sous 7 jours (la couleur la plus urgente gagne), à décider', () => {
  const m = le(3, 11)
  const liste = [
    projet({ id: 'a', deadline: '2026-11-06', current_step: 6 }),
    projet({ id: 'b', deadline: '2026-11-09', current_step: 5 }),
    projet({ id: 'c', deadline: '2026-11-17', status: 'analyzed', current_step: 3 }),
    projet({ id: 'd', deadline: '2026-12-08', processing_status: 'analyzing' }),
    projet({ id: 'e', status: 'soumis', deadline: '2026-10-28' }),
  ]
  const r = resumeMesAO(liste, m)
  assert.equal(r.enCours, 4)
  assert.equal(r.enLecture, 1)
  assert.deepEqual([r.remise7.n, r.remise7.niveau], [2, 'rouge'])
  assert.deepEqual(r.remise7.ids, ['a', 'b'])
  assert.deepEqual([r.aDecider.n, r.aDecider.premier?.id], [1, 'c'])
  assert.equal(resumeMesAO([projet({ deadline: '2026-11-09' })], m).remise7.niveau, 'ambre')
  assert.equal(resumeMesAO([projet({ deadline: '2026-12-09' })], m).remise7.niveau, 'neutre')
})

test('terminés : le décompte par statut, dans l’ordre Déposé, Gagné, Perdu, Sans suite', () => {
  const liste = [projet({ status: 'perdu' }), projet({ status: 'soumis' }), projet({ status: 'gagné' }), projet({ status: 'sans_suite' }), projet({ status: 'soumis' }), projet({ status: 'en_cours' })]
  assert.deepEqual(repartitionTermines(liste), [['soumis', 2], ['gagné', 1], ['perdu', 1], ['sans_suite', 1]])
  assert.deepEqual(repartitionTermines([projet()]), [])
})

test('unités : « 1 analyse · 0 mémoire » ; rien quand le serveur n’a pas de donnée', () => {
  assert.equal(texteUnites({ unites: { analyses: 1, memoires: 0 }, pieces: null, plan_valide_le: null, memoire_ecrit_le: null }), '1 analyse · 0 mémoire')
  assert.equal(texteUnites({ unites: { analyses: 2, memoires: 3 }, pieces: null, plan_valide_le: null, memoire_ecrit_le: null }), '2 analyses · 3 mémoires')
  assert.equal(texteUnites({ unites: { analyses: 0, memoires: 0 }, pieces: null, plan_valide_le: null, memoire_ecrit_le: null }), null)
  assert.equal(texteUnites(null), null)
  assert.equal(texteUnites(undefined), null)
})

test('l’unité du mois : le cumul des deux compteurs de l’offre, Business compris (aucune offre illimitée)', () => {
  assert.deepEqual(uniteMois({ plan: 'pro', analyses: { used: 9, limit: 30 }, memoires: { used: 5, limit: 30 } }),
    { utilisees: 14, total: 60, restantes: 46, part: 14 / 60 })
  assert.deepEqual(uniteMois({ plan: 'business', analyses: { used: 9, limit: 70 }, memoires: { used: 5, limit: 70 } }),
    { utilisees: 14, total: 140, restantes: 126, part: 14 / 140 })
  // au-delà du nouveau quota (Pro 40 → 30) : jamais de reste négatif, jamais plus de 100 %
  assert.deepEqual(uniteMois({ plan: 'pro', analyses: { used: 35, limit: 30 }, memoires: { used: 30, limit: 30 } }),
    { utilisees: 65, total: 60, restantes: 0, part: 1 })
  assert.equal(uniteMois(undefined), null)
})

test('les faits de « À la une » : seulement ceux que le serveur connaît, rien d’inventé', () => {
  const sans = faitsALaUne(projet({ id: 'x' }), le(3, 11))
  assert.deepEqual(sans, [])
  const p = projet({
    infos_marche: { points_a_eclaircir: [] },
    avancement: { unites: { analyses: 1, memoires: 1 }, pieces: { total: 9, pretes: 9 }, plan_valide_le: '2026-11-02T09:00:00', memoire_ecrit_le: '2026-11-02T15:00:00' },
  })
  const f = faitsALaUne(p, le(3, 11))
  assert.deepEqual(f.map((x) => [x.libelle, x.valeur, x.ton]), [
    ['Pièces du coffre-fort', '9 sur 9 prêtes', 'vert'],
    ['Mémoire technique', 'écrit le 2 nov.', 'vert'],
    ['Questions à l’acheteur', 'Aucune à poser', 'vert'],
    ['Unités utilisées', '1 analyse · 1 mémoire', 'neutre'],
  ])
  const partiel = faitsALaUne(projet({ infos_marche: { points_a_eclaircir: [{ question: 'q', pourquoi: null, source_document: null }, { question: 'r', pourquoi: null, source_document: null }] }, avancement: { unites: { analyses: 1, memoires: 0 }, pieces: { total: 9, pretes: 7 }, plan_valide_le: '2026-11-02T09:00:00', memoire_ecrit_le: null } }), le(3, 11))
  assert.deepEqual(partiel.map((x) => [x.valeur, x.ton]), [['7 sur 9 prêtes', 'ambre'], ['plan validé le 2 nov.', 'vert'], ['2 à poser', 'ambre'], ['1 analyse · 0 mémoire', 'neutre']])
})

test('le traitement en cours : lecture ou rédaction, sans bouton', () => {
  assert.equal(enTraitement(projet({ processing_status: 'analyzing' })), true)
  assert.equal(enTraitement(projet({ processing_status: 'generating' })), true)
  assert.equal(enTraitement(projet({ processing_status: 'ready' })), false)
  assert.equal(enTraitement(projet()), false)
})

test('l’avis d’origine : le lien de la veille, seulement s’il est sûr', () => {
  assert.deepEqual(versAvisOrigine(projet({ infos_marche: { source_avis: { id_boamp: '26-118204', url_avis: 'https://www.boamp.fr/avis/detail/26-118204' } } })),
    { id: '26-118204', url: 'https://www.boamp.fr/avis/detail/26-118204' })
  assert.equal(versAvisOrigine(projet({ infos_marche: { source_avis: { id_boamp: '1', url_avis: 'javascript:alert(1)' } } })), null)
  assert.equal(versAvisOrigine(projet()), null)
})

test('« vendredi 6 nov., 12 h » : le jour et l’heure de la remise', () => {
  assert.equal(quandCourt(projet({ echeance: { date: '2026-11-06', heure: '12h00' } })), 'ven. 6 nov., 12 h')
  assert.equal(quandCourt(projet({ echeance: { date: '2026-11-06', heure: '17h30' } })), 'ven. 6 nov., 17 h 30')
  assert.equal(quandCourt(projet({ deadline: '2026-11-06' })), 'ven. 6 nov.')
  assert.equal(quandCourt(projet()), null)
})

import { niveauUrgence } from '@/lib/mesAO'

test('la pastille de Mes AO dans la barre latérale prend la couleur la plus urgente', () => {
  const m = le(3, 11)
  assert.equal(niveauUrgence([projet({ deadline: '2026-11-09' })], m), 'ambre')
  assert.equal(niveauUrgence([projet({ deadline: '2026-11-09' }), projet({ id: 'q', deadline: '2026-11-05' })], m), 'rouge')
  assert.equal(niveauUrgence([projet({ deadline: '2026-12-09' })], m), 'neutre')
  assert.equal(niveauUrgence([projet({ status: 'soumis', deadline: '2026-11-04' })], m), 'neutre', 'un AO terminé ne compte pas')
})

import { urgenceQuestions } from '@/components/project/PointsAEclaircir'

test('date limite des questions : ambre à 7 jours, rouge à 3 jours ou moins ou dépassée, rien au-delà ; le texte dit le délai', () => {
  const m = le(3, 11)
  const date = (d: string, regle: 'absolue' | 'reponse_acheteur' = 'absolue') => ({ statut: 'trouvee' as const, regle, date: d, heure: null, jours: null, document: null, extrait: null, motif: null })
  assert.deepEqual(urgenceQuestions(date('2026-11-10'), m), { ton: 'ambre', texte: 'Dans 7 jours' })
  assert.deepEqual(urgenceQuestions(date('2026-11-06'), m), { ton: 'rouge', texte: 'Dans 3 jours' })
  assert.deepEqual(urgenceQuestions(date('2026-11-03'), m), { ton: 'rouge', texte: 'Aujourd’hui' })
  assert.deepEqual(urgenceQuestions(date('2026-11-01'), m), { ton: 'rouge', texte: 'Date dépassée' })
  assert.equal(urgenceQuestions(date('2026-11-11'), m), null)
  assert.equal(urgenceQuestions(date('2026-11-04', 'reponse_acheteur'), m), null, 'ce n’est pas la date limite de poser une question')
  assert.equal(urgenceQuestions({ ...date('2026-11-04'), statut: 'a_verifier' }, m), null)
  assert.equal(urgenceQuestions(null, m), null)
})

import { tonConsommation } from '@/components/layout/QuotaGauge'

test('jauge des unités : vert sous 70 %, ambre de 70 à 90 %, rouge au-delà de 90 %', () => {
  assert.deepEqual([0, 0.69, 0.7, 0.9, 0.91, 1].map(tonConsommation), ['vert', 'vert', 'ambre', 'ambre', 'rouge', 'rouge'])
})
