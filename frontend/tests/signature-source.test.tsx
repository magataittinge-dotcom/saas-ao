// Bloc 9, tranche 4 — la signature lue dans le RC cite sa source (document, article, page)
// et renvoie au passage d'origine ; sans exigence du RC, la règle générale est citée à la place.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import SignatureLigne, { libelleSourceRc, phraseSourceSignature, regleSignature } from '@/components/project/SignatureLigne'
import { lire } from './outils/sources'
import type { ChecklistItem } from '@/types'

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'dc1_template', source_kind: 'dce_template',
  status: 'manquant', document_group: 'completer', details: 'DC1', ...over,
})
const rendre = (item: ChecklistItem) => renderToStaticMarkup(
  <SignatureLigne item={item} onToggleSignature={async () => {}} onOpenSource={() => {}} />)

test('la source dit le document, l’article et la page', () => {
  assert.equal(
    libelleSourceRc({ source_document: 'RC.pdf', source_article: 'Article 5.2 — Présentation des candidatures', source_page: 7 }),
    'RC.pdf — Article 5.2 — Présentation des candidatures, page 7')
  assert.equal(libelleSourceRc({ source_document: 'RC.pdf', source_article: null, source_page: 7 }), 'RC.pdf, page 7')
  assert.equal(libelleSourceRc({ source_document: null, source_article: null, source_page: null }), null)
})

test('signature demandée par le RC : case, source citée, lien « Voir dans le dossier » renvoyant à l’exigence', () => {
  const html = rendre(ligne({
    signature_required: true, source_document: 'RC.pdf', source_page: 7,
    source_article: 'Article 5.2 — Présentation des candidatures', source_exigence_id: 'ex-1',
  }))
  assert.ok(html.includes('Je confirme avoir signé ce document'))
  assert.ok(html.includes('Source : RC.pdf — Article 5.2 — Présentation des candidatures, page 7'))
  assert.ok(html.includes('data-piece-source=""') && html.includes('Voir dans le dossier'))
  // la case du système (Radix : un bouton role=checkbox) ; plus de case native écrite dans le composant
  assert.ok(html.includes('role="checkbox"'), 'la case du système')
  assert.ok(!/<input\b/.test(lire('src/components/project/SignatureLigne.tsx')), 'plus de case native')
})

test('sans exigence d’origine retrouvable, la source est citée mais sans lien', () => {
  const html = rendre(ligne({ signature_required: true, source_document: 'RC.pdf', source_page: 7 }))
  assert.ok(html.includes('Source : RC.pdf, page 7'))
  assert.ok(!html.includes('data-piece-source') && !html.includes('Voir dans le dossier'))
})

test('signature non demandée : la règle générale est citée', () => {
  for (const type of ['dc1_template', 'dc2_template', 'dume']) {
    const html = rendre(ligne({ document_type_required: type, signature_required: false }))
    assert.ok(html.includes('Signature non demandée pour ce formulaire'), type)
    assert.ok(html.includes('service-public F32144, F32106'), type)
    assert.ok(!html.includes('Je confirme'), type)
  }
})

test('acte d’engagement : à signer à l’attribution, avec sa règle', () => {
  const html = rendre(ligne({ document_type_required: 'acte_engagement_template', signature_required: false }))
  assert.ok(html.includes('Acte d’engagement : à signer à l’attribution') || html.includes('à signer à l'))
  assert.ok(html.includes('R17445'))
  assert.equal(regleSignature(ligne({ document_type_required: 'urssaf' })), null)
})

test('déclaration sur l’honneur : la case, sans source inventée', () => {
  const html = rendre(ligne({ document_type_required: 'declaration_honneur', signature_required: true }))
  assert.ok(html.includes('Je confirme avoir signé') && !html.includes('Source :'))
})

test('aucune couleur écrite dans SignatureLigne, cible tactile de 44 px', () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|style=/.test(lire('src/components/project/SignatureLigne.tsx')))
  // la case et le lien sont ceux du système (44 px de cible : ui/case.tsx « min-h-11 », ui/bouton.tsx variante lien au toucher)
  const ligne_ = lire('src/components/project/SignatureLigne.tsx')
  assert.ok(ligne_.includes('<CaseACocher') && ligne_.includes('<Bouton variante="lien"'))
  assert.ok(lire('src/components/ui/case.tsx').includes('min-h-11'))
})

test('StepVerification ouvre le panneau « Voir dans le DCE » sur l’exigence d’origine', () => {
  const code = lire('src/routes/project/StepVerification.tsx')
  assert.ok(code.includes("type: 'exigence', id: item.source_exigence_id"))
  assert.ok(code.includes('<PanneauSource'))
})

test('l’écran Export cite la même phrase de source et le même « Déposé le … par … » que l’écran des pièces', () => {
  const item = ligne({
    signature_required: true, source_document: 'RC.pdf', source_page: 7,
    source_article: 'Article 5.2 — Présentation des candidatures',
  })
  assert.equal(phraseSourceSignature(item),
    'Le règlement de la consultation demande une signature. Source : RC.pdf — Article 5.2 — Présentation des candidatures, page 7')
  assert.equal(phraseSourceSignature({ ...item, signature_required: false }), null)
  assert.equal(phraseSourceSignature({ ...item, document_type_required: 'declaration_honneur' }), null)
  const code = lire('src/routes/project/StepExport.tsx')
  assert.ok(code.includes('noteDepot(item)') && code.includes('phraseSourceSignature(item)'))
})

// R19 — la phrase cite le document réellement lu : « le règlement de la consultation » seulement si la source est le RC.
test('phraseSourceSignature : le document cité n’est pas toujours le RC', () => {
  const item = ligne({ document_type_required: 'dume', signature_required: true, source_document: '2829 – Acte d’engagement.pdf', source_page: 18, source_article: 'Article 3 — Mode de règlement' })
  assert.equal(phraseSourceSignature(item),
    'Le dossier de consultation demande une signature. Source : 2829 – Acte d’engagement.pdf — Article 3 — Mode de règlement, page 18')
  const rc = ligne({ document_type_required: 'dume', signature_required: true, source_document: 'Règlement de consultation.pdf', source_page: 4 })
  assert.match(phraseSourceSignature(rc) ?? '', /^Le règlement de la consultation demande une signature\./)
})
