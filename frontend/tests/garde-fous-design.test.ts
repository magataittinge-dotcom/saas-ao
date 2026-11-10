// Garde-fous du design (VEILLE-DESIGN P30) — une dette par fichier, qui ne peut que diminuer.
//
// Chaque règle (tests/outils/gardeFous.ts) compte ses écarts dans chaque fichier de src/. Le compte permis par fichier est dans
// tests/dette-design.json : { "règle": { "src/chemin.tsx": n } }. Un fichier absent de la liste a droit à ZÉRO.
//
// Le test échoue :
//   - si un fichier dépasse son compte (ou si un fichier hors liste a un seul écart) : corrigez le code, pas la liste ;
//   - si un fichier est passé SOUS son compte : la liste est périmée, baissez-la (commande ci-dessous) ;
//   - si un fichier du socle (lot « socle ») figure dans la liste pour une règle tenue à zéro.
//
// MODE D'EMPLOI — retirer un fichier de la liste :
//   1. corrigez le fichier (le message d'échec de chaque règle dit quoi mettre à la place) ;
//   2. lancez `DETTE=baisser npm test -- garde-fous-design` : la liste est réécrite, chaque compte au plus bas atteint,
//      les fichiers à zéro en sortent. Cette commande ne monte JAMAIS un compte ;
//   3. commitez le fichier corrigé et tests/dette-design.json ensemble.
//   `DETTE=tableau npm test -- garde-fous-design` affiche la dette par règle et par lot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RACINE } from './outils/sources'
import { REGLES, lotDe, relever, type Dette } from './outils/gardeFous'

const FICHIER_DETTE = path.join(RACINE, 'tests/dette-design.json')
const lireDette = (): Dette => JSON.parse(readFileSync(FICHIER_DETTE, 'utf8'))
const ecrire = (d: Dette) => {
  const trie = Object.fromEntries(REGLES.map((r) => [r.id, Object.fromEntries(Object.entries(d[r.id] ?? {}).sort(([a], [b]) => a.localeCompare(b)))]))
  writeFileSync(FICHIER_DETTE, `${JSON.stringify(trie, null, 1)}\n`)
}

const releve = relever()

if (process.env.DETTE === 'baisser' || process.env.DETTE === 'initiale') {
  const avant = process.env.DETTE === 'initiale' ? null : lireDette()
  const apres: Dette = {}
  for (const r of REGLES) {
    apres[r.id] = {}
    const fichiers = avant ? Object.keys(avant[r.id] ?? {}) : Object.keys(releve[r.id])
    for (const f of fichiers) {
      const n = Math.min(avant ? avant[r.id][f] : Infinity, releve[r.id][f] ?? 0)
      if (n > 0) apres[r.id][f] = n
    }
  }
  ecrire(apres)
}

const dette = lireDette()

// Règles tenues à zéro dans le lot socle (ce que ce passage a rendu propre) : un fichier du socle n'y revient pas.
// Les autres règles gardent une dette au socle, listée dans tests/dette-design.json comme pour les autres lots.
const ZERO_AU_SOCLE = [
  'police-hors-echelle', 'capitales-forcees', 'approche-positive', 'taille-hors-echelle', 'duree-hors-echelle', 'transition-all',
  'boucle', 'etat-ao-hors-module', 'visage-en-vignette', 'page-sans-conteneur', 'controle-natif', 'aplat-accent',
]

for (const r of REGLES) {
  test(`garde-fou « ${r.id} » : aucun fichier ne dépasse sa dette, aucun n'est passé dessous sans que la liste suive`, () => {
    const permis = dette[r.id] ?? {}
    const trop: string[] = []
    const perimes: string[] = []
    for (const f of new Set([...Object.keys(permis), ...Object.keys(releve[r.id])])) {
      const n = releve[r.id][f] ?? 0
      const max = permis[f] ?? 0
      if (n > max) trop.push(`${f} : ${n} (permis : ${max})`)
      else if (n < max) perimes.push(`${f} : ${n} (liste : ${max})`)
    }
    assert.deepEqual(trop, [], `${r.quoi}`)
    assert.deepEqual(perimes, [], 'la dette a baissé : DETTE=baisser npm test -- garde-fous-design, puis commitez tests/dette-design.json')
  })
}

test('garde-fous : la liste de dette ne nomme que des règles connues, et le socle est à zéro sur les règles qu\'il tient', () => {
  const connues = new Set(REGLES.map((r) => r.id))
  assert.deepEqual(Object.keys(dette).filter((k) => !connues.has(k)), [])
  const restes: string[] = []
  for (const id of ZERO_AU_SOCLE) for (const f of Object.keys(dette[id] ?? {})) if (lotDe(f) === 'socle') restes.push(`${id} : ${f}`)
  assert.deepEqual(restes, [])
})

if (process.env.DETTE === 'tableau') {
  const lots = ['socle', 'a', 'b1', 'b2', 'c', 'd']
  console.log(`\n${'règle'.padEnd(24)}${lots.map((l) => l.padStart(12)).join('')}   (fichiers · écarts)`)
  for (const r of REGLES) {
    const cases = lots.map((l) => {
      const fs = Object.entries(dette[r.id] ?? {}).filter(([f]) => lotDe(f) === l)
      return `${fs.length} · ${fs.reduce((n, [, v]) => n + v, 0)}`.padStart(12)
    })
    console.log(`${r.id.padEnd(24)}${cases.join('')}`)
  }
}
