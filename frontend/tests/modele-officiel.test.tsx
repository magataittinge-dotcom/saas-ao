// Libellé « Cerfa » (mission V, dernière tranche du bloc 2).
// Source : service-public (fiches F32144 et F32106) classe le DC1, le DC2 et le
// DUME en « Modèle de document » : ils n'ont pas de numéro Cerfa. Le libellé
// écrit « Modèle officiel (ministère de l'Économie) ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import type { ChecklistItem } from '@/types'
import { fichiersSource, lire } from './outils/sources'

const rien = async () => {}

test("formulaire standard absent du DCE : « Modèle officiel », jamais « Cerfa »", () => {
  const item: ChecklistItem = {
    id: 'l', project_id: 'p', document_type_required: 'dc1_template', source_kind: 'dce_template',
    status: 'manquant', document_group: 'completer', signature_required: false,
  }
  const html = renderToStaticMarkup(
    <CandidatureSectionTemplates projectId="p" items={[item]} onUploadCompleted={rien} onToggleSignature={rien} />,
  )
  assert.ok(html.includes('Modèle officiel (ministère de l&#x27;Économie)'), html)
  assert.ok(!/cerfa/i.test(html), html)
})

test('aucun fichier du front ne parle plus de Cerfa', () => {
  const fautes = fichiersSource().filter((f) => /cerfa/i.test(lire(f)))
  assert.deepEqual(fautes, [])
})
