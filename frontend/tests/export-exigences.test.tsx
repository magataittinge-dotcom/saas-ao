// Export « 0/N » — décision de Mohamed du 25/10 (« confirmé par le patron »).
// Plus jamais de fraction : « N exigences relevées, chacune avec sa source »,
// et « dont M confirmées par vous » seulement si M > 0. « Tout confirmer » par
// groupe. Le gate d'export compte les mêmes lignes que le score du serveur ;
// les pièces écartées du ZIP (X-Export-Warnings) sont affichées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ExigencesDuDossier, { type ExigenceExport } from '@/components/project/ExigencesDuDossier'
import { compteGroupe, lignesDuScore, lireAvertissementsExport, resumeExigences } from '@/lib/exportDossier'
import { textesAffiches } from './outils/textes'

test('résumé des exigences : jamais de fraction, « confirmées » seulement si M > 0', () => {
  assert.equal(resumeExigences(12, 12, 0), '12 exigences relevées, chacune avec sa source')
  assert.equal(resumeExigences(12, 12, 3), '12 exigences relevées, chacune avec sa source, dont 3 confirmées par vous')
  assert.equal(resumeExigences(1, 1, 1), '1 exigence relevée, avec sa source, dont 1 confirmée par vous')
  // extrait non retrouvé dans le DCE : on ne prétend pas « chacune avec sa source »
  assert.equal(resumeExigences(12, 10, 0), '12 exigences relevées · 2 à vérifier dans le dossier')
  assert.equal(resumeExigences(0, 0, 0), "Les exigences apparaissent après l'analyse du dossier")
  for (const t of [resumeExigences(12, 12, 0), resumeExigences(5, 4, 2)]) assert.ok(!/\d\s*\/\s*\d/.test(t), t)
})

test('compte par groupe', () => {
  assert.equal(compteGroupe(7, 0), '7 exigences')
  assert.equal(compteGroupe(7, 2), '7 exigences, dont 2 confirmées par vous')
  assert.equal(compteGroupe(1, 1), '1 exigence, confirmée par vous')
})

const exigence = (over: Partial<ExigenceExport>): ExigenceExport => ({
  id: 'e', exigence_text: 'Exigence inventée', category: 'technique', priority: 'obligatoire',
  status: 'non_couvert', groupe: 'execution', source_document: 'CCTP', source_page: 4,
  source_verifiee: true, ...over,
})
const rendu = (items: ExigenceExport[]) => renderToStaticMarkup(
  <ExigencesDuDossier items={items} onConfirmer={() => {}} onConfirmerGroupe={() => {}} enCours={false} />,
)

test('un bouton « Tout confirmer » par groupe qui a des exigences à confirmer', () => {
  const html = rendu([
    exigence({ id: 'a', groupe: 'candidature', category: 'candidature' }),
    exigence({ id: 'b', groupe: 'execution' }),
    exigence({ id: 'c', groupe: 'offre_technique', category: 'offre', status: 'couvert' }),
  ])
  assert.equal(html.split('Tout confirmer').length - 1, 2, html)   // pas pour le groupe déjà confirmé
  for (const libelle of ['Candidature', 'Offre technique', 'Exécution']) assert.ok(html.includes(libelle), libelle)
  assert.ok(!/\d\s*\/\s*\d/.test(html.replace(/<[^>]+>/g, ' ')), 'aucune fraction affichée')
})

test('chaque exigence montre sa source, ou « à vérifier dans le dossier »', () => {
  const html = rendu([
    exigence({ id: 'a', source_document: 'RC', source_page: 7 }),
    exigence({ id: 'b', source_verifiee: false }),
  ])
  assert.ok(html.includes('RC p.7'), html)
  assert.ok(html.includes('À vérifier dans le dossier'), html)
  assert.equal(html.split('type="checkbox"').length - 1, 2)
})

test('le gate d’export compte les mêmes lignes que le score du serveur', () => {
  const lignes = [
    { id: '1', document_group: 'fournir' }, { id: '2', document_group: 'completer' },
    { id: '3', document_group: 'workflow' }, { id: '4', document_group: 'synorix' },
  ]
  assert.deepEqual(lignesDuScore(lignes).map((l) => l.id), ['1', '2'])
})

test('les pièces écartées du ZIP sont lues dans X-Export-Warnings', () => {
  assert.deepEqual(lireAvertissementsExport('["a.pdf : à renouveler", "DPGF remplie : à déposer"]'),
    ['a.pdf : à renouveler', 'DPGF remplie : à déposer'])
  assert.deepEqual(lireAvertissementsExport(undefined), [])
  assert.deepEqual(lireAvertissementsExport('pas du json'), [])
  assert.deepEqual(lireAvertissementsExport('{"a": 1}'), [])
})

test('l’écran Export ne dit plus « couvertes » ni « Matrice de conformité (x/y) »', () => {
  const textes = textesAffiches('src/routes/project/StepExport.tsx').map((t) => t.texte)
  assert.ok(!textes.some((t) => /couvert/i.test(t)), textes.filter((t) => /couvert/i.test(t)).join(' | '))
  assert.ok(!textes.some((t) => t.includes('Matrice de conformité')))
})
