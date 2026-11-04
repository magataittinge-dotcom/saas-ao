// G9 (recette du 4/11) — Plan et Rédiger d'un AO jamais lu affichaient de faux constats (« Le règlement ne détaille pas de
// sous-critères », « Longueur non précisée », « Aucune pondération relevée ») et proposaient de rédiger.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { dossierLu } from '@/lib/dossierLu'
import { LectureNonFaite } from '@/components/etape'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

test('le dossier est lu quand l\'étape 3 est faite ou que le projet a passé l\'étape 3', () => {
  assert.equal(dossierLu({ current_step: 2, completed_steps: {} }), false)
  assert.equal(dossierLu({ current_step: 3, completed_steps: { '1': true, '2': true } }), false)
  assert.equal(dossierLu({ current_step: 3, completed_steps: { '3': true } }), true)
  assert.equal(dossierLu({ current_step: 5, completed_steps: undefined }), true)
})

test('« Lecture non faite » : cartes sobres, action grisée, chemin vers la lecture, aucun faux constat', () => {
  const projet = { id: 'p1', name: 'AO', current_step: 3, completed_steps: { '1': true, '2': true }, status: 'en_cours' } as unknown as Project
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <LectureNonFaite project={projet} titre="Plan du mémoire" utilite="Les parties." action="Valider le plan" libelles={['Parties', 'Critères du règlement', 'Longueur']} />
    </MemoryRouter>)
  assert.equal((html.match(/Lecture non faite/g) ?? []).length, 3)
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*Valider le plan/)
  assert.match(html, /href="\/projects\/p1\/analysis"/)
  assert.doesNotMatch(html, /ne détaille pas|non précisée|Aucune pondération|Non détaillés|manquant|incomplet|absent|!/i)
})

test('les routes Plan et Rédiger passent par « Lecture non faite » tant que le dossier n\'est pas lu', () => {
  const code = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.equal((code.match(/dossierLu\(project\)/g) ?? []).length, 2)
  assert.equal((code.match(/<LectureNonFaite\b/g) ?? []).length, 2)
})
