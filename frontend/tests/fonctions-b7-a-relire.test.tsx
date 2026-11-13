// B7 — un formulaire rempli déposé que Synorix n'a pas pu relier à l'entreprise (ni raison sociale ni SIRET dans le texte,
// scan sans texte) est « À relire » : le mot de la ligne, le motif du serveur, la version déposée et « Remplacer ».
// Le fait vient du serveur (`a_relire`, schemas/compliance.py) ; l'écran ne devine rien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { statutPiece } from '@/lib/statutPiece'
import { comptesDetailles } from '@/lib/resumePieces'
import { pieceDemandee } from '@/lib/exportDossier'
import type { ChecklistItem } from '@/types'

const MOTIF = 'Ni votre raison sociale ni votre SIRET n’apparaissent dans le texte de ce formulaire : relisez-le avant le dépôt. Fichier déposé : DC1_rempli.pdf.'
const formulaire = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'f', project_id: 'p', document_type_required: 'dc1_template', source_kind: 'dce_template',
  status: 'warning', document_group: 'completer', completed_project_doc_id: 'doc-rempli', details: MOTIF, ...over,
})
const rien = async () => {}
const rendre = (item: ChecklistItem) => renderToStaticMarkup(
  <CandidatureSectionTemplates projectId="p" items={[item]} onUploadCompleted={rien} onNonConcerne={rien} />,
)

test('« À relire » quand le serveur le dit, jamais « Date de validité à confirmer »', () => {
  const s = statutPiece({ status: 'warning', a_relire: true })
  assert.deepEqual({ code: s.code, texte: s.texte, action: s.action }, { code: 'a-relire', texte: 'À relire', action: true })
  // sans le fait du serveur, rien ne change (pièce du coffre sans date)
  assert.equal(statutPiece({ status: 'warning' }).texte, 'Date de validité à confirmer')
  assert.equal(statutPiece({ status: 'warning', a_relire: false }).texte, 'Date de validité à confirmer')
  // « Non concerné » l'emporte : la pièce est sortie du dossier
  assert.equal(statutPiece({ status: 'non_applicable', a_relire: true }).code, 'non-concerne')
})

test('une pièce « À relire » reste demandée au dépôt et ne compte pas « prête »', () => {
  const c = comptesDetailles([{ status: 'warning', a_relire: true }, { status: 'present', jointe: true }], null)
  assert.deepEqual({ pretes: c.pretes, total: c.total, autres: c.autres }, { pretes: 1, total: 2, autres: 0 })
  assert.equal(pieceDemandee({ status: 'warning', a_relire: true }), true)
})

test('la ligne : le mot, le motif, la version déposée, « Remplacer »', () => {
  const html = rendre(formulaire({ a_relire: true }))
  assert.match(html, /À relire/)
  assert.doesNotMatch(html, /Date de validité à confirmer/)
  assert.match(html, /Ni votre raison sociale ni votre SIRET/)
  assert.match(html, /Voir la version déposée/)
  assert.match(html, /Remplacer/)
  assert.doesNotMatch(html, /Déposer le formulaire/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('un formulaire en attente (rien de déposé) garde sa ligne d’aujourd’hui', () => {
  const html = rendre(formulaire({ status: 'manquant', completed_project_doc_id: undefined, details: '' }))
  assert.match(html, /Déposer le formulaire/)
  assert.doesNotMatch(html, /À relire|Voir la version déposée/)
})
