// Les textes affichés sont écrits avec leurs accents : « Vérifiez que tous les lots qui vous
// intéressent sont bien détectés », jamais « Verifiez … interessent … detectes ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource } from './outils/sources'
import { textesAffiches } from './outils/textes'
import { FORMES_SANS_ACCENT } from './outils/accents'

// Formes techniques (pas affichées telles quelles) : clé de statut, classe CSS, noms de fichiers
// exportés (volontairement en ASCII : un nom de fichier sans accent passe partout).
const TECHNIQUES = [/^echec$/, /statut-piece/, /Memoire_Technique_/]

test('aucun texte affiché ne contient une forme française sans accent', () => {
  const fautes: string[] = []
  for (const f of fichiersSource('src').filter((x) => /\.tsx?$/.test(x))) {
    for (const t of textesAffiches(f)) {
      if (TECHNIQUES.some((re) => re.test(t.texte.trim()) || re.test(t.texte))) continue
      for (const re of FORMES_SANS_ACCENT) {
        const m = t.texte.match(re)
        if (m) fautes.push(`${f}:${t.ligne} « ${m[0].trim()} » dans « ${t.texte.slice(0, 70).replace(/\s+/g, ' ')} »`)
      }
    }
  }
  assert.deepEqual(fautes, [])
})
