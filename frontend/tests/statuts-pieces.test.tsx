// Bloc 9, tranche 1 — statuts positifs des pièces : fonction pure, compteur,
// classes sémantiques regroupées dans styles/pieces.css, aucun mot négatif à l'écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  comptesPieces, dateFr, libelleComptes, noteValidite, statutDocument, statutPiece,
} from '@/lib/statutPiece'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import { FileCard } from '@/components/common/FileCard'
import type { ChecklistItem, Document } from '@/types'
import { lire } from './outils/sources'
import { textesAffiches } from './outils/textes'

test('les six statuts de la mission, avec leurs mots exacts', () => {
  assert.deepEqual(
    (({ code, texte }) => ({ code, texte }))(statutPiece({ status: 'manquant' })),
    { code: 'a-joindre', texte: 'À joindre' })
  assert.equal(statutPiece({ status: 'present', jointe: true, valable_jusqu_au: '2027-01-31' }).texte,
    'Prêt — valable jusqu’au 31/01/2027')
  assert.equal(statutPiece({ status: 'expire', valable_jusqu_au: '2026-09-30' }).texte,
    'À renouveler — fin de validité le 30/09/2026')
  assert.equal(statutPiece({ status: 'manquant', obligation: 'si_concerne' }).texte, 'Si concerné')
  assert.equal(statutPiece({ status: 'manquant', obligation: 'facultatif' }).texte, 'Facultatif')
  assert.equal(statutPiece({ status: 'manquant', phase: 'attribution' }).texte, 'Pour l’attribution — à préparer')
})

test('l’ambre est réservé à ce qui demande une action', () => {
  const attendu: [Parameters<typeof statutPiece>[0], boolean][] = [
    [{ status: 'manquant' }, true],
    [{ status: 'expire' }, true],
    [{ status: 'warning' }, true],
    [{ status: 'present', jointe: true, valable_jusqu_au: '2027-01-31' }, false],
    [{ status: 'manquant', obligation: 'si_concerne' }, false],
    [{ status: 'manquant', obligation: 'facultatif' }, false],
    [{ status: 'manquant', phase: 'attribution' }, false],
    [{ status: 'non_applicable' }, false],
  ]
  for (const [entree, action] of attendu) assert.equal(statutPiece(entree).action, action, JSON.stringify(entree))
})

test('une pièce prête qui cesse d’être valable avant la remise est « À renouveler avant le dépôt »', () => {
  const p = { status: 'present', jointe: true, valable_jusqu_au: '2026-11-10' }
  assert.equal(statutPiece(p, '2026-11-20').texte, 'À renouveler avant le dépôt — valable jusqu’au 10/11/2026')
  assert.equal(statutPiece(p, '2026-11-20').code, 'a-renouveler')
  assert.equal(statutPiece(p, '2026-11-10').code, 'pret')   // valable le jour même de la remise
  assert.equal(statutPiece(p, null).code, 'pret')           // échéance inconnue : on ne devine pas
})

test('« Prêt » exige un fait ; un « present » sans fichier reste « À joindre »', () => {
  assert.equal(statutPiece({ status: 'present', jointe: false }).code, 'a-joindre')
  assert.equal(statutPiece({ status: 'warning', jointe: false }).texte, 'Date de validité à confirmer')
})

test('compteur : « {n} pièces à joindre · {m} prêtes », sans fraction', () => {
  const pieces = [
    { status: 'present', jointe: true, valable_jusqu_au: '2027-01-31' },
    { status: 'present', jointe: true },
    { status: 'manquant' },
    { status: 'expire' },
    { status: 'manquant', obligation: 'facultatif' },
    { status: 'manquant', obligation: 'si_concerne' },
    { status: 'manquant', phase: 'attribution' },
    { status: 'non_applicable' },
  ]
  const { aJoindre, pretes } = comptesPieces(pieces)
  assert.deepEqual({ aJoindre, pretes }, { aJoindre: 2, pretes: 2 })
  assert.equal(libelleComptes(aJoindre, pretes), '2 pièces à joindre · 2 prêtes')
  assert.equal(libelleComptes(1, 1), '1 pièce à joindre · 1 prête')
  assert.ok(!/\d\s*\/\s*\d/.test(libelleComptes(7, 3)))
})

test('statut d’une pièce du coffre : mêmes mots, jamais « Valide » ni « Expire »', () => {
  assert.equal(statutDocument({ status: 'valid', expiry_date: '2027-03-01' }).texte, 'Prêt — valable jusqu’au 01/03/2027')
  assert.equal(statutDocument({ status: 'expired', expiry_date: '2026-03-01' }).code, 'a-renouveler')
  assert.equal(statutDocument({ status: 'unverified' }).texte, 'Date de validité à confirmer')
  assert.equal(statutDocument({ status: 'valid' }).code, 'a-confirmer')
  assert.equal(dateFr('2026-02-05T10:00:00'), '05/02/2026')
})

test('durées de validité sourcées : URSSAF = règle, Kbis = usage', () => {
  assert.equal(noteValidite('urssaf'), 'Attestation URSSAF : valable 6 mois (Code du travail, art. D8222-5)')
  assert.equal(noteValidite('kbis'), 'Kbis : 3 mois, usage courant des acheteurs')
  assert.equal(noteValidite('decennale'), null)   // aucune durée inventée
})

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'urssaf', source_kind: 'vault',
  status: 'manquant', document_group: 'fournir', details: 'Attestation de vigilance', ...over,
})

test('le rendu pose les classes sémantiques, sans mot négatif', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[
        ligne({ id: 'a' }),
        ligne({ id: 'b', details: 'Extrait Kbis', document_type_required: 'kbis', jointe: true, piece_nom: 'kbis.pdf', valable_jusqu_au: '2027-03-01', status: 'present' }),
        ligne({ id: 'c', details: 'Attestation du sous-traitant', document_type_required: 'dc4', obligation: 'si_concerne', source_in_rc: 'Le cas échéant, une attestation par sous-traitant.' }),
      ]}
      onPickFromVault={() => {}} onOpenVault={() => {}}
    />,
  )
  for (const c of ['statut-piece--a-joindre', 'statut-piece--pret', 'statut-piece--si-concerne']) assert.ok(html.includes(c), c)
  assert.ok(html.includes('Attestation URSSAF : valable 6 mois (Code du travail, art. D8222-5)'))
  assert.ok(html.includes('Lu dans le RC : « Le cas échéant'))
  assert.ok(html.includes('1 pièce à joindre · 1 prête'))
  assert.ok(!/À fournir|Expiré|manquant|incomplet|absent/i.test(html.replace(/class="[^"]*"/g, '')))
})

test('le coffre-fort : statut positif, note de durée, jamais « Expire le »', () => {
  const doc = { id: 'd', organization_id: 'o', type: 'urssaf', category: 'attestations_sociales_fiscales',
    file_url: '/x', file_name: 'urssaf.pdf', status: 'expired', expiry_date: '2026-03-01', uploaded_at: '2026-01-01' } as Document
  const html = renderToStaticMarkup(<FileCard document={doc} />)
  assert.ok(html.includes('statut-piece--a-renouveler'))
  assert.ok(html.includes('À renouveler — fin de validité le 01/03/2026'))
  assert.ok(!/Expire|Expiré/.test(html))
})

// ── Garde : aucun mot négatif dans les textes affichés des écrans de pièces ──
const FICHIERS_PIECES = [
  'src/routes/project/StepVerification.tsx', 'src/routes/project/StepExport.tsx',
  'src/routes/project/StepAnalysis.tsx', 'src/routes/Vault.tsx',
  'src/components/project/CandidatureSectionVault.tsx', 'src/components/project/CandidatureSectionTemplates.tsx',
  'src/components/project/VaultPickerModal.tsx', 'src/components/common/FileCard.tsx',
  'src/components/common/ExpiryAlert.tsx', 'src/components/common/StatusBadge.tsx',
  'src/lib/statutPiece.ts', 'src/lib/vault.ts', 'src/lib/exportDossier.ts',
]
const NEGATIFS: [RegExp, string][] = [
  [/À fournir/i, '« À fournir »'],
  [/\bExpir[ée]/i, '« Expiré »'],
  [/Expire (bientôt|le)\b/i, '« Expire … »'],
  [/manquant/i, '« manquant »'],
  [/incompl[eè]t/i, '« incomplet »'],
  [/\babsente?s?\b/i, '« absent »'],
  [/Présente — à vérifier/i, '« Présente — à vérifier »'],
]

test('aucun statut négatif dans les textes affichés des écrans de pièces', () => {
  const fautes: string[] = []
  for (const f of FICHIERS_PIECES) {
    for (const t of textesAffiches(f)) {
      for (const [re, nom] of NEGATIFS) {
        if (re.test(t.texte)) fautes.push(`${t.fichier}:${t.ligne} ${nom} — « ${t.texte.trim().slice(0, 80)} »`)
      }
    }
  }
  assert.deepEqual(fautes, [])
})

test('les classes sémantiques sont définies dans un seul fichier CSS et aucun JSX n’écrit de couleur pour les statuts', () => {
  const css = lire('src/styles/pieces.css')
  for (const c of ['.statut-piece', '.statut-piece--a-joindre', '.statut-piece--pret', '.statut-piece--a-renouveler',
    '.statut-piece--a-confirmer', '.statut-piece--si-concerne', '.statut-piece--facultatif', '.statut-piece--attribution',
    '.statut-piece--non-concerne']) {
    assert.ok(css.includes(c), c)
  }
  assert.ok(lire('src/main.tsx').includes("'./styles/pieces.css'"))
  const statuts = lire('src/lib/statutPiece.ts')
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(statuts), 'statutPiece.ts ne porte aucune couleur')
})
