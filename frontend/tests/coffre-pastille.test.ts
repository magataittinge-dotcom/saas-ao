// B1 — la pastille de la modale « Choisir une pièce du coffre-fort » ne dit
// « Valide » que pour une pièce reconnue ET datée (C10). Sans date, la
// validité reste à confirmer : jamais affirmée.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vaultValidityPill } from '@/lib/vault'
import { documentStatusBadge } from '@/components/common/StatusBadge'
import { textesAffiches } from './outils/textes'

test('une pièce sans date n’est jamais dite « Valide »', () => {
  assert.equal(vaultValidityPill({ status: 'unverified' }).label, 'Date de validité à confirmer')
  assert.equal(vaultValidityPill({ status: 'unclassified' }).label, 'Date de validité à confirmer')
  // statut incohérent (valide sans aucune date) : la pastille ne l’affirme pas
  assert.equal(vaultValidityPill({ status: 'valid' }).label, 'Date de validité à confirmer')
})

test('une pièce datée garde sa pastille', () => {
  assert.equal(vaultValidityPill({ status: 'valid', expiry_date: '2027-03-01' }).label, 'Prêt — valable jusqu’au 01/03/2027')
  // date de fin dérivée de l’émission (URSSAF, Kbis… — C11)
  assert.equal(vaultValidityPill({ status: 'valid', issued_date: '2026-10-01' }).label, 'Prêt')
  assert.equal(vaultValidityPill({ status: 'expiring_soon', expiry_date: '2026-11-10' }).label, 'Prêt — valable jusqu’au 10/11/2026')
  // tranche 4 : le jour où la date passe, la pièce est « À renouveler », avec sa date de fin
  assert.equal(vaultValidityPill({ status: 'expired', expiry_date: '2026-03-01' }).label, 'À renouveler — fin de validité le 01/03/2026')
})

test('le coffre dit « À renouveler » pour une pièce expirée', () => {
  assert.equal(documentStatusBadge('expired').label, 'À renouveler')
})

test('la modale passe par la règle commune (aucun « Valide » écrit en dur)', () => {
  const textes = textesAffiches('src/components/project/VaultPickerModal.tsx').map((t) => t.texte.trim())
  assert.ok(!textes.includes('Valide') && !textes.includes('Prêt'), 'VaultPickerModal affiche encore un statut en dur')
})
