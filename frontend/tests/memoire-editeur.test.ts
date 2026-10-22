// 1.8 — L'éditeur du mémoire ne perd ni ne déplace rien : aller-retour exact
// entre le mémoire et le texte de l'éditeur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depuisMarkdown, versMarkdown } from '@/lib/memoireMarkdown'
import { SECTIONS_MEMOIRE } from '@/lib/memoireSections'
import type { MemoireContent } from '@/types'

/** Un mémoire aux contenus piégeux : sous-titres générés, séparateurs, titres d'éditeur dans le texte… */
function memoirePiegeux(): MemoireContent {
  const a: Record<string, string> = {}
  const b: Record<string, string> = {}
  const c: Record<string, string> = {}
  for (const s of SECTIONS_MEMOIRE) {
    const cible = s.part === 'partie_a' ? a : s.part === 'partie_b' ? b : c
    cible[s.cle] = `Texte de « ${s.titre} ».\n\n### Sous-titre généré\n\n- point **gras**\n- point *italique*`
  }
  // Le cas démontré par l'audit : un sous-titre qui finit par le nom d'une autre section.
  b.dechets = 'Tri sélectif.\n\n### Gestion de l\'Environnement\n\nTri sélectif sur chantier.'
  b.environnement = 'Arrosage des pistes.'
  // Lignes identiques aux titres de l'éditeur, séparateurs, blancs en bordure.
  a.historique = '## 10. Références chantiers\n\nCréée en 1998.\n---'
  a.references = '\\## 1. Implantation géographique\n# PARTIE B — PRÉSENTATION DE LA PRESTATION\n'
  c.delai = '---\n\nDélai : 4 mois.\n\n'
  a.vehicules = ''
  return {
    preambule: '\n# PRÉAMBULE\nNous avons l\'honneur…\n---',
    partie_a: a,
    partie_b: b,
    partie_c: c,
    _generation_meta: { warnings: [] },
  } as unknown as MemoireContent
}

test('3 sauvegardes sans modification : contenu identique, octet pour octet', () => {
  const origine = memoirePiegeux()
  const texteOrigine = versMarkdown(origine)
  let courant = origine
  for (let i = 0; i < 3; i++) {
    courant = depuisMarkdown(versMarkdown(courant), courant)
  }
  assert.equal(JSON.stringify(courant), JSON.stringify(origine))
  assert.equal(versMarkdown(courant), texteOrigine)
})

test('un sous-titre généré ne déplace plus de texte', () => {
  const origine = memoirePiegeux()
  const relu = depuisMarkdown(versMarkdown(origine), origine)
  const b = relu.partie_b as unknown as Record<string, string>
  assert.equal(b.dechets, 'Tri sélectif.\n\n### Gestion de l\'Environnement\n\nTri sélectif sur chantier.')
  assert.equal(b.environnement, 'Arrosage des pistes.')
})

test('aucun séparateur « --- » ajouté par une sauvegarde', () => {
  const origine = memoirePiegeux()
  const relu = depuisMarkdown(versMarkdown(origine), origine)
  assert.equal(relu.preambule, origine.preambule)
  const nb = (s: string) => (s.match(/^---$/gm) ?? []).length
  assert.equal(nb(versMarkdown(relu)), nb(versMarkdown(origine)))
})

test('une retouche reste dans sa section, les autres sections ne bougent pas', () => {
  const origine = memoirePiegeux()
  const texte = versMarkdown(origine).replace('Arrosage des pistes.', 'Arrosage des pistes deux fois par jour.')
  const relu = depuisMarkdown(texte, origine)
  const b = relu.partie_b as unknown as Record<string, string>
  assert.equal(b.environnement, 'Arrosage des pistes deux fois par jour.')
  assert.equal(b.dechets, (origine.partie_b as unknown as Record<string, string>).dechets)
  assert.equal(relu.preambule, origine.preambule)
})

test('un titre de section d\'une autre partie saisi dans le texte reste du texte', () => {
  const origine = memoirePiegeux()
  const texte = versMarkdown(origine).replace('Arrosage des pistes.', 'Arrosage des pistes.\n## 1. Implantation géographique\nSuite.')
  const relu = depuisMarkdown(texte, origine)
  const b = relu.partie_b as unknown as Record<string, string>
  const a = relu.partie_a as unknown as Record<string, string>
  assert.equal(b.environnement, 'Arrosage des pistes.\n## 1. Implantation géographique\nSuite.')
  assert.equal(a.implantation, (origine.partie_a as unknown as Record<string, string>).implantation)
})

test('texte saisi sous un titre de partie : rattaché à la section suivante, jamais perdu', () => {
  const origine = memoirePiegeux()
  const texte = versMarkdown(origine).replace(
    '# PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE\n\n',
    '# PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE\n\nIntroduction de la partie C.\n\n',
  )
  const relu = depuisMarkdown(texte, origine)
  const c = relu.partie_c as unknown as Record<string, string>
  assert.ok(c.methodologie.startsWith('Introduction de la partie C.'))
})

test('titre « PRÉAMBULE » effacé : le texte du préambule est conservé', () => {
  const origine = memoirePiegeux()
  const texte = versMarkdown(origine).replace('# PRÉAMBULE\n', '')
  const relu = depuisMarkdown(texte, origine)
  assert.ok(relu.preambule.includes('Nous avons l\'honneur'))
})
