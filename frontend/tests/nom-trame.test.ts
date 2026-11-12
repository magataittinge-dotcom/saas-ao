// Restes 2, point 3 — la trame DPGF/BPU/DQE téléchargée garde l'extension du fichier réel (elle s'appelait toujours
// « DPGF.xlsx » ou « bordereau.xlsx », même pour un PDF de l'acheteur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomTrame } from '@/lib/nomTrame'
import { lire, sansCommentaires } from './outils/sources'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

test("l'extension vient du nom envoyé par le serveur (même origine, en production)", () => {
  assert.equal(nomTrame('dpgf_template', { entete: 'attachment; filename="DPGF lot 3.pdf"', mime: 'application/pdf' }), 'DPGF.pdf')
  assert.equal(nomTrame('bpu_template', { entete: "attachment; filename*=utf-8''bordereau%20%C3%A9tabli.XLS", mime: '' }), 'BPU.xls')
  assert.equal(nomTrame('dqe_template', { entete: 'attachment; filename="DQE.ods"', mime: XLSX }), 'DQE.ods')
})

test("sans en-tête lisible (autre origine), l'extension suit le type du fichier", () => {
  assert.equal(nomTrame('dpgf_template', { mime: 'application/pdf' }), 'DPGF.pdf')
  assert.equal(nomTrame('dpgf_template', { mime: XLSX }), 'DPGF.xlsx')
  assert.equal(nomTrame('bpu_template', { mime: 'application/vnd.ms-excel' }), 'BPU.xls')
  assert.equal(nomTrame('autre_trame', { mime: 'application/vnd.oasis.opendocument.spreadsheet' }), 'bordereau.ods')
  assert.equal(nomTrame('dpgf_template', { mime: 'application/pdf; charset=binary' }), 'DPGF.pdf')
})

test("type inconnu : pas d'extension inventée", () => {
  assert.equal(nomTrame('dpgf_template', { mime: 'application/octet-stream' }), 'DPGF')
  assert.equal(nomTrame('autre_trame', {}), 'bordereau')
  assert.equal(nomTrame('dpgf_template', { entete: 'attachment; filename="sans-extension"', mime: '' }), 'DPGF')
})

test("l'étape « Réunir les pièces » nomme la trame par nomTrame, plus par un nom en .xlsx écrit en dur", () => {
  const code = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.match(code, /nomTrame\(/)
  assert.doesNotMatch(code, /'DPGF\.xlsx'|'bordereau\.xlsx'/)
})
