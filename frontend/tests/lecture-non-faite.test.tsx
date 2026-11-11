// G9 (recette du 4/11) — Plan et Rédiger d'un AO jamais lu affichaient de faux constats (« Le règlement ne détaille pas de
// sous-critères », « Longueur non précisée », « Aucune pondération relevée ») et proposaient de rédiger.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { dossierLu } from '@/lib/dossierLu'
import { AnalyseNonFaite, LectureNonFaite } from '@/components/etape'
import { enumerer } from '@/components/etape/LectureNonFaite'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

test('le dossier est lu quand l\'étape 3 est faite ou que le projet a passé l\'étape 3', () => {
  assert.equal(dossierLu({ current_step: 2, completed_steps: {} }), false)
  assert.equal(dossierLu({ current_step: 3, completed_steps: { '1': true, '2': true } }), false)
  assert.equal(dossierLu({ current_step: 3, completed_steps: { '3': true } }), true)
  assert.equal(dossierLu({ current_step: 5, completed_steps: undefined }), true)
})

test('« analyse non faite » : dessiné une fois (Synorix le dit, une action), ni case, ni bouton grisé, aucun faux constat', () => {
  const projet = { id: 'p1', name: 'AO', current_step: 3, completed_steps: { '1': true, '2': true }, status: 'en_cours' } as unknown as Project
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <LectureNonFaite project={projet} titre="Plan du mémoire" utilite="Les parties." libelles={['Les parties', 'Les critères du règlement', 'La longueur demandée']} />
    </MemoryRouter>)
  // jury, tour 1 : des cases répétaient « Analyse non faite », à côté d'un bouton grisé qui redisait le titre
  assert.doesNotMatch(html, /Analyse non faite/)
  assert.doesNotMatch(html, /data-case-resume|data-bande-cases|disabled=""/)
  assert.equal((html.match(/data-synorix-parle/g) ?? []).length, 1, 'Synorix le dit, une fois')
  assert.equal((html.match(/data-visage/g) ?? []).length, 1)
  assert.match(html, /Le dossier n’a pas encore été analysé\. Les parties, les critères du règlement et la longueur demandée s’afficheront ici une fois l’analyse faite\./)
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 1, 'une seule action')
  assert.match(html, /href="\/projects\/p1\/analysis"/)
  assert.doesNotMatch(html, /ne détaille pas|non précisée|Aucune pondération|Non détaillés|manquant|incomplet|absent|!/i)
})

test('« analyse non faite » se pose dans n\'importe quelle étape : le même état, sans le gabarit', () => {
  const projet = { id: 'p1', name: 'AO', current_step: 1, completed_steps: {}, status: 'en_cours' } as unknown as Project
  const html = renderToStaticMarkup(<MemoryRouter><AnalyseNonFaite project={projet} /></MemoryRouter>)
  assert.match(html, /data-lecture-non-faite=""/)
  assert.match(html, /Cet écran se remplit une fois l’analyse faite\./)
  assert.doesNotMatch(html, /<h1/)
  assert.equal(enumerer(['Le plan']), 'Le plan')
  assert.equal(enumerer(['Le plan', 'Le poids de chaque partie']), 'Le plan et le poids de chaque partie')
})

test('les routes Plan et Rédiger passent par « Lecture non faite » tant que le dossier n\'est pas lu', () => {
  const code = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.equal((code.match(/dossierLu\(project\)/g) ?? []).length, 2)
  assert.equal((code.match(/<LectureNonFaite\b/g) ?? []).length, 2)
})
