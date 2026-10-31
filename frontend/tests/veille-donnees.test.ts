// B1 — données de la carte : tous les départements, le poids, la cohérence des centroïdes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import path from 'node:path'
import { CADRE_METROPOLE, DEPARTEMENTS, ENCARTS, PAYS_VOISINS, VIEWBOX } from '@/components/veille/donnees/departements'
import { RACINE } from './outils/sources'

const CODES_ATTENDUS = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((c) => c !== '20'),
  '2A', '2B', '971', '972', '973', '974', '975', '976',
]

test('chaque département est présent une seule fois : 01 à 95 (2A et 2B pour la Corse), 971 à 976', () => {
  const codes = DEPARTEMENTS.map((d) => d.code)
  assert.equal(new Set(codes).size, codes.length, 'aucun doublon')
  for (const c of CODES_ATTENDUS) assert.ok(codes.includes(c), `le département ${c} est présent`)
  assert.equal(codes.length, CODES_ATTENDUS.length, 'et aucun autre code')
  assert.ok(!codes.includes('20'), "le code 20 n'existe plus")
})

test('le fichier de données reste sous 60 ko avant compression', () => {
  const octets = statSync(path.join(RACINE, 'src/components/veille/donnees/departements.ts')).size
  assert.ok(octets < 60_000, `${octets} octets`)
})

test('noms, tracés et ancrages sont renseignés ; les ancrages tombent dans le dessin', () => {
  const noms = new Map(DEPARTEMENTS.map((d) => [d.code, d.nom]))
  assert.equal(noms.get('69'), 'Rhône')
  assert.equal(noms.get('2A'), 'Corse-du-Sud')
  assert.equal(noms.get('973'), 'Guyane')
  assert.equal(noms.get('975'), 'Saint-Pierre-et-Miquelon')
  for (const d of DEPARTEMENTS) {
    assert.match(d.d, /^M-?\d+ -?\d+l.*z$/, `${d.code} : tracé relatif fermé`)
    assert.ok(Number.isFinite(d.lat) && Number.isFinite(d.lon), `${d.code} : latitude et longitude`)
    assert.ok(d.cx >= VIEWBOX.x && d.cx <= VIEWBOX.x + VIEWBOX.w, `${d.code} : cx dans le dessin`)
    assert.ok(d.cy >= VIEWBOX.y && d.cy <= VIEWBOX.y + VIEWBOX.h, `${d.code} : cy dans le dessin`)
  }
})

test('les centroïdes géographiques de la métropole sont en France (rayon autour d’une ville)', () => {
  for (const d of DEPARTEMENTS.filter((x) => x.code.length < 3 && x.code !== '975')) {
    assert.ok(d.lat > 41 && d.lat < 51.2, `${d.code} lat ${d.lat}`)
    assert.ok(d.lon > -5.2 && d.lon < 9.7, `${d.code} lon ${d.lon}`)
  }
  const rhone = DEPARTEMENTS.find((d) => d.code === '69')!
  assert.ok(Math.abs(rhone.lat - 45.87) < 0.2 && Math.abs(rhone.lon - 4.65) < 0.3, 'le Rhône est autour de Lyon')
  const reunion = DEPARTEMENTS.find((d) => d.code === '974')!
  assert.ok(reunion.lat < -20 && reunion.lon > 55, 'La Réunion est dans l’océan Indien')
})

test('six encarts pour l’outre-mer, sous le cadre de la métropole', () => {
  assert.deepEqual(ENCARTS.map((e) => e.code), ['971', '972', '973', '974', '975', '976'])
  for (const e of ENCARTS) assert.ok(e.y >= CADRE_METROPOLE.y + CADRE_METROPOLE.h, `${e.code} sous la métropole`)
  assert.ok(PAYS_VOISINS.startsWith('M'), 'les pays voisins forment un tracé')
})
