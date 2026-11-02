// Tableurs au dépôt (décision 5 du 2/11) — le serveur lit .xlsm et .ods depuis 4152bc1 : les écrans de dépôt les proposent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('dépôt du DCE : .xlsm et .ods dans le sélecteur et dans le texte des formats acceptés', () => {
  const src = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  assert.match(src, /'application\/vnd\.ms-excel\.sheet\.macroEnabled\.12':\s*\['\.xlsm'\]/)
  assert.match(src, /'application\/vnd\.oasis\.opendocument\.spreadsheet':\s*\['\.ods'\]/)
  assert.match(src, /'application\/octet-stream':\s*\[[^\]]*'\.xlsm'[^\]]*'\.ods'|'application\/octet-stream':\s*\[[^\]]*'\.ods'[^\]]*'\.xlsm'/)
  assert.match(src, /\.pdf · \.docx · \.xlsx · \.xlsm · \.ods · \.zip/)
  assert.match(src, /\.pdf \.docx \.xlsx \.xlsm \.ods \.zip/)
})

test('DPGF remplie et formulaires remplis : .xlsm et .ods acceptés par les sélecteurs de fichier', () => {
  assert.match(lire('src/routes/project/StepExport.tsx'), /accept="\.xlsx,\.xls,\.xlsm,\.ods,\.pdf"/)
  assert.match(lire('src/routes/project/StepVerification.tsx'), /accept="\.xlsx,\.xls,\.xlsm,\.ods,\.pdf"/)
  const modeles = lire('src/components/project/CandidatureSectionTemplates.tsx')
  assert.match(modeles, /accept="[^"]*\.xlsm[^"]*"/)
  assert.match(modeles, /accept="[^"]*\.ods[^"]*"/)
})
