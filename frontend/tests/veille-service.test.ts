// B4 — service et état de la veille : paramètres du contrat, visite à 24 h, sauvegarde différée de 500 ms,
// « Élargir » en deux temps, appels HTTP vers les routes du contrat (adaptateur axios simulé, aucun réseau).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { InternalAxiosRequestConfig } from 'axios'
import { api } from '@/services/api'
import {
  creerAODepuisAvis, enregistrerPreferences, lireAvis, lireComptes, lireMetiers, lirePreferences, poserVisite,
  PREFERENCES_PAR_DEFAUT,
} from '@/services/veille'
import {
  DELAI_SAUVEGARDE_MS, DELAI_VISITE_MS, FILTRES_PAR_DEFAUT, aDesFiltres, departementsVoisins, doitPoserVisite, etapeElargir,
  paramsAvis, paramsFiltres, sauvegardeDifferee, type FiltresAvis,
} from '@/lib/veille'
import { lire, sansCommentaires } from './outils/sources'

const FILTRES: FiltresAvis = { metiers: ['cvc', 'peinture'], delai_jours: 15, procedures: ['adaptee'], mots_cles: '  école  ' }

test('les filtres deviennent des paramètres du contrat : listes séparées par des virgules, valeurs vides omises', () => {
  assert.deepEqual(paramsFiltres(FILTRES), { metiers: 'cvc,peinture', procedures: 'adaptee', delai_jours: 15, q: 'école' })
  assert.deepEqual(paramsFiltres(FILTRES_PAR_DEFAUT), {})
  assert.deepEqual(paramsAvis(['69', '2A'], FILTRES_PAR_DEFAUT, 'date_limite', null), { departements: '69,2A', tri: 'date_limite', limite: 20 })
  assert.deepEqual(paramsAvis(['69'], FILTRES, 'date_parution', 'c3VpdGU', 50), {
    metiers: 'cvc,peinture', procedures: 'adaptee', delai_jours: 15, q: 'école', departements: '69', tri: 'date_parution', limite: 50, curseur: 'c3VpdGU',
  })
  assert.ok(aDesFiltres(FILTRES) && !aDesFiltres(FILTRES_PAR_DEFAUT) && !aDesFiltres({ ...FILTRES_PAR_DEFAUT, mots_cles: '   ' }))
})

test('la visite se pose à la sortie seulement si la dernière date de plus de 24 h (ou n’existe pas)', () => {
  const maintenant = new Date('2026-10-31T12:00:00Z')
  assert.equal(doitPoserVisite(null, maintenant), true)
  assert.equal(doitPoserVisite('illisible', maintenant), true)
  assert.equal(doitPoserVisite('2026-10-31T11:00:00Z', maintenant), false, 'il y a 1 h')
  assert.equal(doitPoserVisite('2026-10-30T12:00:00Z', maintenant), false, 'exactement 24 h : pas encore plus de 24 h')
  assert.equal(doitPoserVisite('2026-10-30T11:59:59Z', maintenant), true, '24 h et une seconde')
  assert.equal(DELAI_VISITE_MS, 86_400_000)
})

test('départements voisins : les plus proches d’abord, hors zone ; rien pour une île lointaine', () => {
  const paris = departementsVoisins(['75'])
  assert.deepEqual(paris.slice(0, 3).sort(), ['92', '93', '94'])
  assert.ok(!paris.includes('75') && paris.length <= 6)
  const rhone = departementsVoisins(['69'])
  assert.ok(rhone.includes('01') && rhone.includes('42') && rhone.includes('38'))
  assert.ok(!rhone.includes('69'))
  assert.deepEqual(departementsVoisins(['973']), [])
  assert.deepEqual(departementsVoisins([]), [])
  assert.ok(departementsVoisins(['69', '01']).every((c) => c !== '69' && c !== '01'))
})

test('« Élargir » : les filtres d’abord, puis les voisins, puis plus rien à proposer', () => {
  assert.deepEqual(etapeElargir(FILTRES, ['69']), { type: 'filtres' })
  const e = etapeElargir(FILTRES_PAR_DEFAUT, ['69'])
  assert.equal(e?.type, 'voisins')
  assert.ok(e?.type === 'voisins' && e.ajout.includes('01'))
  assert.equal(etapeElargir(FILTRES_PAR_DEFAUT, ['973']), null)
})

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('sauvegarde différée : la dernière valeur seule part ; vider l’envoie sans attendre ; annuler la jette', async () => {
  const envoyes: number[] = []
  const s = sauvegardeDifferee<number>((v) => envoyes.push(v), 25)
  s.planifier(1); s.planifier(2); s.planifier(3)
  await attendre(8)
  assert.deepEqual(envoyes, [], 'rien n’est parti avant le délai')
  await attendre(50)
  assert.deepEqual(envoyes, [3])
  s.planifier(4)
  s.vider()
  assert.deepEqual(envoyes, [3, 4], 'envoi immédiat à la sortie')
  await attendre(40)
  assert.deepEqual(envoyes, [3, 4], 'et pas deux fois')
  s.planifier(5); s.annuler()
  await attendre(40)
  assert.deepEqual(envoyes, [3, 4])
  assert.equal(DELAI_SAUVEGARDE_MS, 500)
})

// ── Appels HTTP : un adaptateur axios qui consigne la requête et répond ce qu'on lui donne ──
type Reponse = unknown
function simuler(reponse: Reponse) {
  const vues: InternalAxiosRequestConfig[] = []
  const ancien = api.defaults.adapter
  api.defaults.adapter = async (config) => { vues.push(config); return { data: reponse, status: 200, statusText: 'OK', headers: {}, config } }
  return { vues, restaurer: () => { api.defaults.adapter = ancien } }
}

test('les appels du contrat : routes, méthodes, paramètres et corps', async () => {
  const s = simuler({ ok: true })
  try {
    await lirePreferences()
    await enregistrerPreferences({ departements: ['69'], tri: 'date_parution' })
    await poserVisite()
    await lireMetiers().catch(() => {})
    await lireComptes(FILTRES)
    await lireAvis(['69', '01'], FILTRES, 'date_limite', 'curs')
    await creerAODepuisAvis('b3a7-1')
    const [pref, put, visite, metiers, comptes, avis, creer] = s.vues
    assert.deepEqual([pref.method, pref.url], ['get', '/veille/preferences'])
    assert.deepEqual([put.method, put.url], ['put', '/veille/preferences'])
    assert.deepEqual(JSON.parse(String(put.data)), { departements: ['69'], tri: 'date_parution' })
    assert.deepEqual([visite.method, visite.url], ['post', '/veille/visite'])
    assert.deepEqual([metiers.method, metiers.url], ['get', '/veille/metiers'])
    assert.deepEqual([comptes.method, comptes.url], ['get', '/veille/comptes'])
    assert.deepEqual(comptes.params, { metiers: 'cvc,peinture', procedures: 'adaptee', delai_jours: 15, q: 'école' })
    assert.deepEqual([avis.method, avis.url], ['get', '/veille/avis'])
    assert.equal(avis.params.departements, '69,01')
    assert.equal(avis.params.curseur, 'curs')
    assert.equal(avis.params.limite, 20)
    assert.deepEqual([creer.method, creer.url], ['post', '/veille/avis/b3a7-1/creer-ao'])
  } finally { s.restaurer() }
})

test('l’identifiant d’un avis est encodé dans l’URL de création', async () => {
  const s = simuler({ project_id: 'p-9' })
  try {
    const id = await creerAODepuisAvis('a/b?c')
    assert.equal(id, 'p-9')
    assert.equal(s.vues[0].url, '/veille/avis/a%2Fb%3Fc/creer-ao')
  } finally { s.restaurer() }
})

test('valeurs par défaut des préférences : celles du contrat', () => {
  assert.deepEqual(PREFERENCES_PAR_DEFAUT, {
    departements: [], ville: null, filtres: { metiers: [], delai_jours: null, procedures: [], mots_cles: '' }, tri: 'date_limite', derniere_visite: null,
  })
})

test('le hook : préférences lues à l’arrivée, enregistrées à chaque changement, visite à la sortie, rien d’envoyé avant le chargement', () => {
  const code = sansCommentaires(lire('src/hooks/useVeille.ts'))
  assert.match(code, /queryFn: lirePreferences/)
  assert.match(code, /sauvegardeDifferee\(/)
  assert.match(code, /envoyer\.planifier\(/)
  assert.match(code, /if \(!hydrate\) return/, 'aucune sauvegarde avant que les préférences soient chargées')
  assert.match(code, /envoyer\.vider\(\)/, 'envoi immédiat à la sortie')
  assert.match(code, /doitPoserVisite\(/)
  assert.match(code, /poserVisite\(\)/)
  assert.match(code, /enabled: hydrate && zone\.selection\.length > 0/, 'pas de requête d’avis sans zone')
})
