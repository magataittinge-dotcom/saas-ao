// B3 — recherche de zone : résolution d'un résultat de l'API Adresse, départements par nom ou par code,
// rayon autour d'une ville (haversine), recherche différée avec abandon, rendu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import RechercheZone from '@/components/veille/RechercheZone'
import {
  DELAI_RECHERCHE_MS, RAYONS_KM, chercherDepartements, departementDepuisContexte, departementsDansLeRayon, departementsDeLaVille,
  distanceKm, estSaisieDeCode, nettoyerRequete, rechercheDifferee, villeDepuisAdresse, type FeatureAdresse, type VilleZone,
} from '@/lib/veille'
import { lire, sansCommentaires } from './outils/sources'

// Résultat simulé de l'API Adresse pour « Lyon » (forme du service : GeoJSON, contexte « code, département, région »).
const LYON: FeatureAdresse = {
  properties: { label: 'Lyon', name: 'Lyon', postcode: '69001', citycode: '69123', context: '69, Rhône, Auvergne-Rhône-Alpes', city: 'Lyon' },
  geometry: { coordinates: [4.835659, 45.764043] },
}

test('un résultat de l’API Adresse donne la ville et son département', () => {
  const v = villeDepuisAdresse(LYON)!
  assert.deepEqual(v, { libelle: 'Lyon', code_insee: '69123', code_postal: '69001', departement: '69', lat: 45.764043, lon: 4.835659, rayon_km: 0 })
  assert.equal(villeDepuisAdresse(LYON, 50)!.rayon_km, 50)
})

test('le contexte « code, nom, région » se lit pour la métropole, la Corse et l’outre-mer ; un code inconnu est refusé', () => {
  assert.deepEqual(departementDepuisContexte('69, Rhône, Auvergne-Rhône-Alpes'), { code: '69', nom: 'Rhône' })
  assert.deepEqual(departementDepuisContexte('2A, Corse-du-Sud, Corse'), { code: '2A', nom: 'Corse-du-Sud' })
  assert.deepEqual(departementDepuisContexte('2b, Haute-Corse, Corse'), { code: '2B', nom: 'Haute-Corse' })
  assert.deepEqual(departementDepuisContexte('974, La Réunion, La Réunion'), { code: '974', nom: 'La Réunion' })
  assert.equal(departementDepuisContexte('99, Inconnu, Nulle part'), null)
  assert.equal(departementDepuisContexte(''), null)
  assert.equal(departementDepuisContexte(undefined), null)
})

test('un résultat inexploitable est écarté (sans coordonnées, sans contexte, coordonnées absurdes)', () => {
  assert.equal(villeDepuisAdresse({ properties: LYON.properties }), null)
  assert.equal(villeDepuisAdresse({ geometry: LYON.geometry }), null)
  assert.equal(villeDepuisAdresse({ properties: { ...LYON.properties, context: 'x' }, geometry: LYON.geometry }), null)
  assert.equal(villeDepuisAdresse({ properties: LYON.properties, geometry: { coordinates: [NaN, 1] } }), null)
})

test('haversine : un degré de latitude vaut environ 111,2 km ; distance nulle sur le même point', () => {
  assert.ok(Math.abs(distanceKm({ lat: 45, lon: 3 }, { lat: 46, lon: 3 }) - 111.19) < 0.1)
  assert.equal(distanceKm({ lat: 45, lon: 3 }, { lat: 45, lon: 3 }), 0)
  assert.ok(Math.abs(distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 }) - 392) < 6, 'Paris-Lyon ≈ 392 km')
})

// Centroïdes fixes sur le même méridien : 0,2° ≈ 22 km ; 0,5° ≈ 56 km ; 0,9° ≈ 100,08 km ; 1,5° ≈ 167 km.
const POINTS = [
  { code: 'A', lat: 45.0, lon: 4 },
  { code: 'B', lat: 45.2, lon: 4 },
  { code: 'C', lat: 45.5, lon: 4 },
  { code: 'D', lat: 45.9, lon: 4 },
  { code: 'E', lat: 46.5, lon: 4 },
]
const CENTRE = { lat: 45.0, lon: 4 }

test('le rayon ajoute les départements dont le centroïde est à moins de N km, du plus proche au plus éloigné', () => {
  assert.deepEqual(departementsDansLeRayon(CENTRE, 0, 'A', POINTS), ['A'], '0 km : le département de la ville seulement')
  assert.deepEqual(departementsDansLeRayon(CENTRE, 25, 'A', POINTS), ['A', 'B'])
  assert.deepEqual(departementsDansLeRayon(CENTRE, 50, 'A', POINTS), ['A', 'B'], '56 km : hors du rayon de 50')
  assert.deepEqual(departementsDansLeRayon(CENTRE, 100, 'A', POINTS), ['A', 'B', 'C'], '100,08 km : juste au-delà de 100')
  assert.deepEqual(departementsDansLeRayon(CENTRE, 200, 'A', POINTS), ['A', 'B', 'C', 'D', 'E'])
})

test('le département de la ville reste dans la zone même quand son centroïde est loin ; il passe en premier', () => {
  const loin = departementsDansLeRayon({ lat: 45.9, lon: 4 }, 25, 'A', POINTS)
  assert.deepEqual(loin, ['A', 'D'])
  assert.deepEqual(departementsDansLeRayon(CENTRE, 25, null, POINTS), ['A', 'B'])
})

test('la zone d’une ville suit son rayon (centroïdes de la carte) : Lyon à 0 km = le Rhône ; à 100 km, plus de départements', () => {
  const v = villeDepuisAdresse(LYON, 0)!
  assert.deepEqual(departementsDeLaVille(v), ['69'])
  const large = departementsDeLaVille({ ...v, rayon_km: 100 })
  assert.equal(large[0], '69')
  assert.ok(large.length > 1, 'des départements voisins s’ajoutent')
  for (const voisin of ['01', '42', '38']) assert.ok(large.includes(voisin), `${voisin} à moins de 100 km de Lyon`)
  assert.ok(!large.includes('75'), 'Paris reste loin')
  const m: VilleZone = { ...v, rayon_km: 25 }
  assert.ok(departementsDeLaVille(m).length <= large.length, 'plus le rayon est petit, moins il y a de départements')
  assert.deepEqual([...RAYONS_KM], [0, 25, 50, 100])
})

test('départements : par nom (accents et casse ignorés), par début de nom, par numéro', () => {
  const noms = (q: string) => chercherDepartements(q).map((d) => d.nom)
  assert.equal(noms('rhone')[0], 'Rhône')
  assert.ok(noms('rhone').includes('Bouches-du-Rhône'))
  assert.equal(noms('69')[0], 'Rhône')
  assert.equal(noms('2a')[0], 'Corse-du-Sud')
  assert.equal(noms('2B')[0], 'Haute-Corse')
  assert.equal(noms('974')[0], 'La Réunion')
  assert.deepEqual(noms('côte').sort(), ["Côte-d'Or", "Côtes-d'Armor"].sort())
  assert.deepEqual(noms('zzzz'), [])
  assert.deepEqual(noms('   '), [])
  assert.ok(chercherDepartements('a').length <= 6, 'six propositions au plus')
})

test('une saisie de numéro court ne part pas à l’API ; la requête est nettoyée', () => {
  assert.ok(estSaisieDeCode('69') && estSaisieDeCode('974') && estSaisieDeCode('2a'))
  assert.ok(!estSaisieDeCode('69003') && !estSaisieDeCode('Lyon'))
  assert.equal(nettoyerRequete('  Saint   Étienne '), 'Saint Étienne')
})

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('recherche différée : seule la dernière saisie part ; la requête périmée est abandonnée', async () => {
  const appels: string[] = []
  const abandons: string[] = []
  const chercher = (q: string, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
    appels.push(q)
    signal.addEventListener('abort', () => { abandons.push(q); reject(new DOMException('abandon', 'AbortError')) })
    setTimeout(() => resolve(`résultat ${q}`), 40)
  })
  const r = rechercheDifferee(chercher, 20)
  const recus: string[] = []
  r.demander('ly', (x) => recus.push(x))
  r.demander('lyo', (x) => recus.push(x))
  await attendre(5)
  r.demander('lyon', (x) => recus.push(x))
  await attendre(30)
  assert.deepEqual(appels, ['lyon'], 'les saisies intermédiaires n’ont jamais été envoyées')
  r.demander('lyons', (x) => recus.push(x))    // la requête « lyon » est encore en vol : elle est abandonnée
  await attendre(120)
  assert.deepEqual(abandons, ['lyon'])
  assert.deepEqual(recus, ['résultat lyons'], 'seul le résultat de la dernière saisie arrive')
  assert.equal(DELAI_RECHERCHE_MS, 300)
})

test('annuler arrête la minuterie et la requête ; une erreur est rapportée une seule fois', async () => {
  let appels = 0
  const r = rechercheDifferee(async () => { appels += 1; throw new Error('réseau') }, 10)
  const erreurs: unknown[] = []
  r.demander('x', () => {}, (e) => erreurs.push(e))
  r.annuler()
  await attendre(40)
  assert.equal(appels, 0)
  r.demander('y', () => {}, (e) => erreurs.push(e))
  await attendre(40)
  assert.equal(appels, 1)
  assert.equal(erreurs.length, 1)
})

test('le rendu : champ nommé, rôle combobox, rayon et puces de la zone choisie', () => {
  const v = villeDepuisAdresse(LYON, 25)!
  const html = renderToStaticMarkup(<RechercheZone selection={['69', '01']} ville={v} onZone={() => {}} chercher={async () => []} />)
  assert.ok(html.includes('Département, ville ou code postal'))
  assert.match(html, /role="combobox"/)
  assert.ok(html.includes('Rayon autour de Lyon'))
  assert.equal((html.match(/role="radio"/g) ?? []).length, 4)
  assert.match(html, /aria-checked="true"[^>]*>25 km|>25 km<\/button>/)
  assert.ok(html.includes('aria-label="Retirer Rhône de la zone"') && html.includes('aria-label="Retirer Ain de la zone"'))
  assert.ok(html.includes('Effacer la zone'))
  const vide = renderToStaticMarkup(<RechercheZone selection={[]} ville={null} onZone={() => {}} chercher={async () => []} />)
  assert.ok(!vide.includes('Effacer la zone') && !vide.includes('Rayon autour'))
})

test('l’appel à l’API Adresse est direct (fetch), sans le jeton de connexion, avec les réglages du contrat', () => {
  const code = sansCommentaires(lire('src/services/adresse.ts'))
  assert.match(code, /api-adresse\.data\.gouv\.fr\/search\//)
  assert.match(code, /limit: '5'/)
  assert.match(code, /type: 'municipality'/)
  assert.match(code, /credentials: 'omit'/)
  assert.doesNotMatch(code, /from '@\/services\/api'|axios/, 'jamais l’instance qui joint le jeton')
})
