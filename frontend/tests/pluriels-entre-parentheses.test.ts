// FIN-ECR — un texte montré au client n'écrit jamais un pluriel entre parenthèses (« pièce(s) », « jointe(s) », « prévu(es) »,
// « travau(x) ») : il s'accorde avec le nombre (fonctions `pluriel` de lib/). Balayage des chaînes et du texte JSX de src/ et des
// pages juridiques. Le code n'est pas visé (`onChange(e)`, `ouvrir(s)`). Les textes du serveur sont tenus côté serveur
// (backend/tests/test_textes_serveur_accords.py), jamais corrigés à l'affichage (tests/textes-du-serveur.test.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fichiersSource, lire, RACINE, sansCommentaires } from './outils/sources'

const PLURIEL = /[A-Za-zÀ-ÿ’']{2,}\((?:s|e|es|x)\)/

/** Le texte des chaînes ('…', "…", `…` hors ${…}) et du texte JSX (entre une balise fermante « > » et la suivante « < »). */
function textesMontres(code: string): string[] {
  const textes: string[] = []
  let i = 0
  let codeCourant = ''
  const finCode = () => {
    // « => » et « -> » ne sont pas des balises
    for (const m of codeCourant.matchAll(/(?<![=-])>([^<>{}]+)</g)) textes.push(m[1])
    codeCourant = ''
  }
  while (i < code.length) {
    const c = code[i]
    // une apostrophe dans un mot (« l'entreprise ») n'ouvre pas une chaîne
    if ((c === "'" || c === '"') && !/[\p{L}\d]/u.test(code[i - 1] ?? '')) {
      finCode()
      let j = i + 1
      let t = ''
      while (j < code.length && code[j] !== c && code[j] !== '\n') { if (code[j] === '\\') { t += code[j + 1] ?? ''; j += 2; continue } t += code[j]; j++ }
      textes.push(t)
      i = j + 1
      continue
    }
    if (c === '`') {
      finCode()
      let j = i + 1
      let t = ''
      while (j < code.length && code[j] !== '`') {
        if (code[j] === '\\') { t += code[j + 1] ?? ''; j += 2; continue }
        if (code[j] === '$' && code[j + 1] === '{') {
          let prof = 1
          j += 2
          while (j < code.length && prof > 0) { if (code[j] === '{') prof++; else if (code[j] === '}') prof--; j++ }
          t += ' '
          continue
        }
        t += code[j]; j++
      }
      textes.push(t)
      i = j + 1
      continue
    }
    codeCourant += c
    i++
  }
  finCode()
  return textes
}

test('le balayage voit une chaîne et un texte JSX, pas un appel de fonction', () => {
  assert.ok(textesMontres("const a = 'Deux pièce(s) jointe(s)'").some((t) => PLURIEL.test(t)))
  assert.ok(textesMontres('<p>Trois document(s) lus</p>').some((t) => PLURIEL.test(t)))
  assert.ok(textesMontres('const b = `${n} prévu(es) à la remise`').some((t) => PLURIEL.test(t)))
  assert.ok(!textesMontres('onClick={() => onChange(e)} const x = ouvrir(s)').some((t) => PLURIEL.test(t)))
  assert.ok(!textesMontres('const y = `${libelleBarre(e)} ok`').some((t) => PLURIEL.test(t)))
  assert.ok(!textesMontres('retry: (n, e) => statut(e) === 503 && n < 3').some((t) => PLURIEL.test(t)))
})

test('aucun pluriel entre parenthèses dans un texte montré au client (src/)', () => {
  const fautifs: string[] = []
  for (const f of fichiersSource('src')) {
    for (const t of textesMontres(sansCommentaires(lire(f)))) {
      const m = PLURIEL.exec(t)
      if (m) fautifs.push(`${f} : « ${m[0]} »`)
    }
  }
  assert.deepEqual(fautifs, [])
})

test('aucun pluriel entre parenthèses dans les pages juridiques', () => {
  const dossier = path.join(RACINE, 'public/legal')
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.md'))) {
    const m = PLURIEL.exec(readFileSync(path.join(dossier, nom), 'utf8'))
    assert.equal(m, null, `${nom} : « ${m?.[0]} »`)
  }
})
