// 1.9 — Le mémoire à l'écran : le sommaire mène à des sections de même nom,
// les libellés ont leurs accents, l'éditeur corrige l'orthographe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocumentView } from '@/routes/project/StepMemoire'
import { sommaireMemoire } from '@/lib/memoireSections'
import type { MemoireContent, Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

const CONTENU = {
  preambule: 'Nous avons l’honneur…',
  partie_a: { implantation: 'Reims.', organigramme: 'Équipe.', references: 'Trois chantiers.', engagement_qualitatif: 'Qualibat.' },
  partie_b: { dechets: 'Tri sélectif.', environnement: '' },
  partie_c: { methodologie: 'Phasage.', delai: '4 mois.' },
} as unknown as MemoireContent

const normaliser = (t: string) => t.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim().toLocaleLowerCase('fr')

/** Le titre (h2/h3) qui suit l'élément d'identifiant `id` dans le HTML rendu. */
function titreDe(html: string, id: string): string | null {
  const i = html.indexOf(`id="${id}"`)
  if (i < 0) return null
  const m = html.slice(i).match(/<h[23][^>]*>([^<]*)<\/h[23]>/)
  return m ? normaliser(m[1]) : null
}

test('chaque entrée du sommaire mène à la section de même nom', () => {
  const html = renderToStaticMarkup(
    <DocumentView content={CONTENU} project={{ name: 'AO test' } as Project} docRef={{ current: null }} />,
  )
  const entrees = sommaireMemoire(CONTENU as never)
  const toutes = entrees.flatMap((e) => [e, ...e.enfants])
  assert.ok(toutes.length >= 10)
  for (const e of toutes) {
    assert.equal(titreDe(html, e.id), normaliser(e.titre), `entrée « ${e.titre} » → #${e.id}`)
  }
  // seules les sections rédigées figurent au sommaire ; aucun identifiant en double
  assert.ok(!toutes.some((e) => e.id === 'sec-environnement'))
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length)
})

test('plus aucun libellé sans accent sur l\'écran du mémoire', () => {
  const sansAccent = /\b(dedies?|delai|estime|materiel|specifique|particulieres?|experience|ingenieur|echafaudage|articulee|occupe|memoire|genere|redige|reference|equipe|securite|qualite|methodologie|deja)\b/i
  const fautes = ['src/routes/project/StepMemoire.tsx', 'src/components/project/MemoirePreflight.tsx', 'src/components/project/RewritePassageBar.tsx']
    .flatMap((f) => textesAffiches(f))
    .filter((t) => sansAccent.test(t.texte))
    .map((t) => `${t.fichier}:${t.ligne} « ${t.texte.trim()} »`)
  assert.deepEqual(fautes, [])
})

test("l'éditeur du mémoire corrige l'orthographe en français", () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(code, /spellCheck\s*\n\s*lang="fr"/)
  assert.doesNotMatch(code, /spellCheck=\{false\}/)
})
