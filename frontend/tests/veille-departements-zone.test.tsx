// Recette du 4/11 — un avis couvrant plusieurs départements s'affichait « à LILLE (59) » dans la zone Marne et Aisne :
// on montre celui (ceux) de la zone choisie.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { departementsAAfficher } from '@/lib/veille'
import CarteAvis from '@/components/veille/CarteAvis'
import type { AvisVeille } from '@/services/veille'

const AVIS = {
  id: 'a1', id_boamp: 'x', objet: 'Accord-cadre de travaux', acheteur: 'Acheteur fictif', departements: ['59', '51'],
  date_parution: '2026-11-01', date_limite: null, procedure: 'ouvert', procedure_libelle: 'Ouvert', famille: null, metiers: [],
  url_avis: 'https://exemple.test/avis', url_dossier: null, nouveau: false,
} as unknown as AvisVeille
const NOMS = { '59': 'Nord', '51': 'Marne', '02': 'Aisne' }

test('la zone choisie filtre les départements d\'un avis ; sans zone ou sans recoupement, la liste complète', () => {
  assert.deepEqual(departementsAAfficher(['59', '51'], ['51', '02']), ['51'])
  assert.deepEqual(departementsAAfficher(['59', '51'], []), ['59', '51'])
  assert.deepEqual(departementsAAfficher(['59', '51'], undefined), ['59', '51'])
  assert.deepEqual(departementsAAfficher(['59', '75'], ['51']), ['59', '75'])
})

test('la carte d\'un avis multi-départements montre celui de la zone', () => {
  const html = renderToStaticMarkup(<CarteAvis avis={AVIS} libellesMetiers={{}} nomsDepartements={NOMS} zone={['51', '02']} onCreerAO={() => {}} />)
  assert.match(html, /Marne \(51\)/)
  assert.doesNotMatch(html, /Nord \(59\)/)
  const sansZone = renderToStaticMarkup(<CarteAvis avis={AVIS} libellesMetiers={{}} nomsDepartements={NOMS} onCreerAO={() => {}} />)
  assert.match(sansZone, /Nord \(59\), Marne \(51\)/)
})
