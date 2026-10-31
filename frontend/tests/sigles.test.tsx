// S3 — Lexique sourcé : chaque sigle de la commande publique est défini une seule fois (lib/lexique.ts), avec sa
// source ; aucun écran n'affiche un sigle nu : il passe par <Sigle> (développé à sa première apparition sur
// l'écran, abrégé ensuite) ou s'écrit « développement (SIGLE) ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { LEXIQUE, SIGLES, developper } from '../src/lib/lexique'
import { PorteeSigles, Sigle } from '../src/components/common/Sigle'
import { fichiersSource, lire } from './outils/sources'
import { textesAffiches } from './outils/textes'

// Fichiers réservés à l'agent SIMPLIF-A (parcours d'un AO) : leurs sigles nus sont convertis à l'intégration.
// Retirer un fichier de cette liste dès qu'il est converti : le test le vérifie alors.
export const RESERVES = [
  'src/routes/NewProject.tsx',
  'src/routes/project/StepMemoire.tsx',
  'src/routes/project/StepExport.tsx',
]
const SOURCES_DU_LEXIQUE = ['src/lib/lexique.ts', 'src/components/common/Sigle.tsx']

test('chaque entrée du lexique porte son développement, une explication d’une ligne et une source reconnue', () => {
  for (const code of SIGLES) {
    const e = LEXIQUE[code]
    assert.equal(e.sigle, code)
    assert.ok(e.developpe.length >= 8, `${code} : développement`)
    assert.ok(e.explication.length > 0 && e.explication.length <= 120, `${code} : explication d’une ligne (${e.explication.length} signes)`)
    assert.ok(/[.]$/.test(e.explication), `${code} : l’explication finit par un point`)
    assert.match(e.source, /(R2\d{3}-\d+|\b[FR]\d{5}\b|OECP)/, `${code} : source (article du Code ou fiche service-public)`)
    assert.ok(!/!/.test(e.explication), `${code} : ton sobre`)
  }
})

test('chaque entrée est précédée de sa source en commentaire dans lexique.ts', () => {
  const code = lire('src/lib/lexique.ts')
  for (const sigle of SIGLES) {
    assert.match(code, new RegExp(`//[^\\n]*\\n\\s*${sigle}: \\{`), `${sigle} : commentaire de source juste avant l’entrée`)
  }
})

test('aucun sigle du lexique n’est affiché sans son développement', () => {
  const fautes: string[] = []
  for (const f of fichiersSource()) {
    if (SOURCES_DU_LEXIQUE.includes(f) || RESERVES.includes(f)) continue
    for (const t of textesAffiches(f)) {
      let texte = t.texte
      // « tableau des prix (DPGF) » : la forme développée, quelle que soit la casse initiale.
      for (const code of SIGLES) texte = texte.replace(new RegExp(developper(code).replace(/[().]/g, '\\$&'), 'gi'), '')
      // Hors lexique : les noms de fichier (DPGF.xlsx) et l'assurance « RC Civile / RC Pro ».
      texte = texte.replace(/\b[A-Z0-9]+\.(xlsx?|docx?|pdf)\b/g, '').replace(/\bRC (Civile|Pro)\b/g, '')
      for (const code of SIGLES) {
        if (new RegExp(`(?<![A-Za-z0-9])${code}(?![A-Za-z0-9])`).test(texte)) {
          fautes.push(`${f}:${t.ligne} « ${code} » nu — « ${t.texte.trim().slice(0, 80)} »`)
        }
      }
    }
  }
  assert.deepEqual(fautes, [])
})

test('les fichiers réservés sont les seuls à garder des sigles nus (liste à vider à l’intégration)', () => {
  for (const f of RESERVES) assert.ok(fichiersSource().includes(f), `${f} existe`)
})

test('le composant : développé une fois par écran, abrégé ensuite, toujours développé sans écran', () => {
  const deux = renderToStaticMarkup(
    <PorteeSigles>
      <p>Lisez le <Sigle code="DCE" /> puis le <Sigle code="DCE" />.</p>
      <p><Sigle code="RC" majuscule /></p>
    </PorteeSigles>,
  )
  assert.equal(deux.split("dossier de l&#x27;acheteur (").length - 1, 1, 'développé une seule fois')
  assert.equal(deux.split('>DCE<').length - 1, 2, 'le sigle reste un bouton les deux fois')
  assert.ok(deux.includes('Règlement de la consultation ('), 'majuscule en début de phrase')
  const seul = renderToStaticMarkup(<p><Sigle code="CCAP" /> et <Sigle code="CCAP" /></p>)
  assert.equal(seul.split('clauses administratives (').length - 1, 2, 'sans écran, toujours développé')
})

test('le sigle est un bouton au clavier, nommé, avec une cible de 44 px au toucher', () => {
  const html = renderToStaticMarkup(<PorteeSigles><Sigle code="DPGF" /></PorteeSigles>)
  assert.match(html, /<button type="button"/)
  assert.match(html, /aria-label="DPGF, tableau des prix"/)
  assert.match(html, /cible-etendue/)
  assert.match(html, /cible-libre/)
})

test('le Layout pose une portée par écran et la page d’accueil publique pose la sienne', () => {
  assert.match(lire('src/components/layout/Layout.tsx'), /<PorteeSigles cle=\{pathname\}>/)
  assert.match(lire('src/routes/Landing.tsx'), /<PorteeSigles>/)
})
