import assert from 'node:assert/strict'
import test from 'node:test'
import { FORMATS_COFFRE, MESSAGE_REFUS_FORMAT, PRECISION_COFFRE, TAILLE_MAX_COFFRE_MO } from '@/lib/coffreFormats'

test('le coffre-fort annonce ses cinq formats et sa limite en Mo', () => {
  assert.equal(PRECISION_COFFRE, 'PDF, Word, Excel, JPEG ou PNG, 50 Mo au plus par fichier')
  assert.equal(TAILLE_MAX_COFFRE_MO, 50)
  assert.match(MESSAGE_REFUS_FORMAT, /Word, Excel, JPEG ou PNG/)
})

test('le sélecteur accepte .pdf .docx .xlsx .jpg .jpeg .png et ni les anciens formats ni les macros', () => {
  const extensions = Object.values(FORMATS_COFFRE).flat().sort()
  assert.deepEqual(extensions, ['.docx', '.jpeg', '.jpg', '.pdf', '.png', '.xlsx'])
  for (const interdit of ['.doc', '.xls', '.docm', '.xlsm', '.zip']) assert.ok(!extensions.includes(interdit as never))
})
