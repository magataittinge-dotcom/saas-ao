// Lecture des sources du frontend pour les tests « rien de faux dans le code ».
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** Dossier frontend/ (fourni par scripts/run-tests.mjs). */
export const RACINE = process.env.FRONTEND_ROOT ?? process.cwd()

/** Contenu d'un fichier, chemin relatif à frontend/. */
export function lire(rel: string): string {
  return readFileSync(path.join(RACINE, rel), 'utf8')
}

/** Tous les .ts/.tsx sous `dossier` (relatif à frontend/), chemins relatifs à frontend/. */
export function fichiersSource(dossier = 'src'): string[] {
  const resultat: string[] = []
  const parcourir = (rel: string) => {
    for (const nom of readdirSync(path.join(RACINE, rel))) {
      const enfant = `${rel}/${nom}`
      if (statSync(path.join(RACINE, enfant)).isDirectory()) parcourir(enfant)
      else if (/\.tsx?$/.test(nom)) resultat.push(enfant)
    }
  }
  parcourir(dossier)
  return resultat.sort()
}

// Le code sans ses commentaires (ligne, bloc, et bloc JSX entre accolades) :
// on ne cherche que dans ce qui s'affiche ou s'exécute.
export function sansCommentaires(code: string): string {
  return code
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}
