// Étapes Pièces et Export dans le gabarit : cartes de résumé tirées des statuts existants, un seul bouton en dégradé par écran. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartesPieces, comptesDetailles, phraseComptes } from '@/lib/resumePieces'
import { nomPiece } from '@/lib/nomsPieces'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import { lire, sansCommentaires } from './outils/sources'

const PIECES = [
  { status: 'present', jointe: true, valable_jusqu_au: '2027-06-01' },
  { status: 'present', jointe: true, valable_jusqu_au: '2027-06-01' },
  { status: 'present', jointe: true, valable_jusqu_au: '2026-12-01' },   // périme avant la remise : à renouveler
  { status: 'expire', valable_jusqu_au: '2026-09-01' },
  { status: 'manquant' },
  { status: 'warning' },
  { status: 'manquant', obligation: 'si_concerne' },                     // « si concerné » : pas à joindre maintenant
  { status: 'non_applicable' },
]

test('Pièces : un seul calcul — prêtes + à joindre + à renouveler = pièces demandées ; les autres statuts sortent du total', () => {
  const c = comptesDetailles(PIECES, '2027-03-01')
  assert.deepEqual(c, { pretes: 2, aJoindre: 2, aRenouveler: 2, total: 6, autres: 1 })
  assert.equal(c.pretes + c.aJoindre + c.aRenouveler, c.total)
  assert.equal(phraseComptes(c), '2 prêtes · 2 à joindre · 2 à renouveler')
  // la même fonction nourrit le résumé : mêmes nombres, jamais deux calculs
  const [pretes, aJoindre, aRenouveler] = cartesPieces(PIECES, '2027-03-01', {
    coffre: PIECES.slice(0, 5), formulaires: PIECES.slice(5, 6),
  })
  assert.deepEqual([pretes.valeur, aJoindre.valeur, aRenouveler.valeur], ['2', '2', '2'])
  assert.deepEqual(pretes.jauge, { rempli: 2, total: 6 })
  assert.match(pretes.detail ?? '', /^sur 6 pièces demandées au dépôt, plus 1 facultative ou pour l’attribution$/)
  assert.match(aJoindre.detail ?? '', /pièce.* du coffre-fort · 1 formulaire à compléter/)
  assert.equal(aJoindre.etat, 'a-verifier')
})

test('Pièces : tout est prêt', () => {
  const cartes = cartesPieces([{ status: 'present', jointe: true }], null)
  assert.deepEqual(cartes.map((c) => [c.valeur, c.etat]), [['1', 'pret'], ['0', 'pret'], ['0', 'pret']])
  assert.equal(comptesDetailles([], null).total, 0)
})

test('Pièces : le nom d’une pièce est lisible, jamais une clé brute', () => {
  assert.equal(nomPiece('dc1', null), 'Lettre de candidature (DC1)')
  assert.equal(nomPiece('dc1_template', null), 'Lettre de candidature (DC1)')
  assert.equal(nomPiece('ae', null), 'Acte d’engagement (AE)')
  assert.equal(nomPiece('acte_engagement_template', ''), 'Acte d’engagement (AE)')
  assert.equal(nomPiece('attestation-visite', null), 'Attestation de visite')
  assert.equal(nomPiece('attestation_visite_template', undefined), 'Attestation de visite')
  assert.equal(nomPiece('kbis', null), 'Extrait Kbis')
  assert.equal(nomPiece('urssaf', 'Attestation de vigilance de moins de six mois'), 'Attestation de vigilance de moins de six mois')
  assert.equal(nomPiece('urssaf', 'urssaf'), 'Attestation de vigilance (Urssaf)')
  assert.equal(nomPiece('piece_inconnue_demo', null), 'Piece inconnue demo')
  for (const cle of ['dc1', 'dc2', 'dc4', 'dume', 'ae', 'attestation-visite', 'dpgf_template']) assert.doesNotMatch(nomPiece(cle, null), /^[a-z0-9_-]+$/)
})

test('Pièces : l’état de chaque pièce est dit par un mot positif, « Non concerné » vit dans le menu « … »', () => {
  const item = (over: object) => ({ id: 'l', project_id: 'p', document_type_required: 'urssaf', source_kind: 'vault', status: 'manquant', document_group: 'fournir', details: 'Pièce inventée', ...over }) as never
  const html = renderToStaticMarkup(<CandidatureSectionVault items={[item({ id: 'a' }), item({ id: 'b', status: 'non_applicable' })]} onPickFromVault={() => {}} onNonConcerne={async () => {}} />)
  assert.equal((html.match(/aria-label="Autres actions pour cette pièce"/g) ?? []).length, 1, 'le menu « … » n’est que sur la pièce concernée')
  assert.equal((html.match(/>Non concerné</g) ?? []).length, 1, 'seul le statut de la pièce écartée, jamais un bouton répété sur chaque ligne')
  assert.equal((html.match(/Je suis concerné/g) ?? []).length, 1)
  assert.match(html, /<h2(?![^>]*uppercase)[^>]*>Pièces administratives<\/h2>/)
  // FIN-B1 : une liste par famille de pièces (une surface, des filets), plus de grille de cartes sur deux colonnes
  assert.match(html, /data-liste-pieces=""/)
  assert.doesNotMatch(html, /md:grid-cols-2/)
  assert.match(html, /<span data-etat="a-joindre" class="text-sm text-fg-2">À joindre<\/span>/, '« À joindre » : texte neutre, ni bleu ni icône')
})

test('un seul bouton en dégradé par écran : l’action de l’en-tête, jamais doublée sur ordinateur par la barre ni par une autre carte', () => {
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.equal((analyse.match(/variante="principal"/g) ?? []).length, 1)
  assert.match(analyse, /<ActionsBarreTel>\s*<BoutonSuite/)
  const decision = sansCommentaires(lire('src/components/project/SynorixScoreCard.tsx'))
  assert.doesNotMatch(decision, /signature-btn/, '« On y va » n’est pas un second bouton principal')
  const export_ = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.equal((export_.match(/variante="principal"/g) ?? []).length, 1, 'le bouton est écrit une fois')
  assert.doesNotMatch(export_, /signature-btn/, 'le bouton du système, plus la classe')
  assert.match(export_, /actionPrincipale=\{tel \? undefined : \([\s\S]*?\{boutonTelecharger\}/, 'en-tête : sur ordinateur seulement')
  assert.match(export_, /<ActionsBarreTel className="max-\[768px\]:flex-1">\{tel \? <>\{boutonTelecharger\}\{boutonPieces\}<\/> : null\}<\/ActionsBarreTel>/, 'barre : au téléphone seulement')
  const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.equal((lots.match(/variante="principal"/g) ?? []).length, 1, 'Lots : le bouton « Lire » est écrit une fois (en-tête à l’ordinateur, barre du bas au téléphone)')
  assert.match(lots, /<ActionsBarreTel>\{actionLire\}<\/ActionsBarreTel>/)
  const verification = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  // FIN-B1 : l'action de l'étape a la même place sur toutes les étapes : en tête à l'ordinateur, dans la barre au téléphone
  assert.match(verification, /actionPrincipale=\{suite\(\)\}/)
  assert.match(verification, /<ActionsBarreTel>\{suite\(\)\}<\/ActionsBarreTel>/)
})
