// FIN-ECR — décision 110 du fondateur (jury, tour 4, mes-ao M4, bloquant) : « À la une » disait « 15 pièces restent à joindre
// avant de télécharger le dossier » avec « Télécharger le dossier » en bouton plein. Tant qu'il reste des pièces à joindre,
// l'action d'un AO dont le mémoire est écrit mène à l'étape Pièces, au verbe de cette étape (« Réunir les pièces ») ;
// « Télécharger le dossier » revient quand plus aucune pièce n'est à joindre. Le fil des étapes ne change pas (« Pièces »
// reste franchie). Une seule source (`lectureAO`) : « À la une », la rangée de Mes AO, la liste de l'Accueil et la palette
// suivent la même règle, donc le même AO n'a jamais deux prochaines actions sur un écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lectureAO, lienAO } from '@/lib/etatAO'
import { filDeLAO } from '@/lib/mesAO'
import { ALaUne } from '@/components/mesao/ALaUne'
import type { Project } from '@/types'

const MAINTENANT = new Date(2026, 10, 10, 9, 0, 0)
const FUTUR = { date: '2026-11-20', heure: '12h00' }
const avancement = (total: number, pretes: number) => ({ unites: { analyses: 1, memoires: 1 }, pieces: { total, pretes }, plan_valide_le: '2026-11-01', memoire_ecrit_le: '2026-11-02' })
const ao = (p: Partial<Project>): Project => ({
  id: 'ao-1', organization_id: 'o', name: 'Réhabilitation de la salle des fêtes', status: 'en_cours', current_step: 6,
  completed_steps: { 1: true, 2: true, 3: true, 4: true, 5: true }, echeance: FUTUR,
  created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', ...p,
} as Project)

const rendreUne = (p: Project) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><ALaUne projet={p} maintenant={MAINTENANT} /></MemoryRouter></QueryClientProvider>,
)

test('mémoire écrit, pièces à joindre : l’action mène à l’étape Pièces (« Réunir les pièces »), la phrase dit ce qui reste', () => {
  const p = ao({ avancement: avancement(15, 0) })
  const l = lectureAO(p, MAINTENANT)
  assert.deepEqual(l.action, { verbe: 'Réunir les pièces', segment: 'verification', statut: false })
  assert.equal(lienAO(p, MAINTENANT), '/projects/ao-1/verification')
  assert.match(l.phrase, /15 pièces restent à joindre/)
  const partiel = lectureAO(ao({ avancement: avancement(15, 14) }), MAINTENANT)
  assert.deepEqual(partiel.action, { verbe: 'Réunir les pièces', segment: 'verification', statut: false })
})

test('plus aucune pièce à joindre : « Télécharger le dossier » redevient l’action', () => {
  const p = ao({ avancement: avancement(9, 9) })
  assert.deepEqual(lectureAO(p, MAINTENANT).action, { verbe: 'Télécharger le dossier', segment: 'export', statut: false })
  assert.equal(lienAO(p, MAINTENANT), '/projects/ao-1/export')
  // le serveur ne dit rien des pièces : rien ne change non plus
  assert.equal(lectureAO(ao({ avancement: null }), MAINTENANT).action.verbe, 'Télécharger le dossier')
})

test('AO sans mémoire : l’action est inchangée', () => {
  const plan = ao({ current_step: 5, completed_steps: { 1: true, 2: true, 3: true, 4: true }, avancement: { ...avancement(15, 0), memoire_ecrit_le: null } })
  assert.deepEqual(lectureAO(plan, MAINTENANT).action, { verbe: 'Préparer le plan du mémoire', segment: 'plan', statut: false })
  const pieces = ao({ current_step: 4, completed_steps: { 1: true, 2: true, 3: true }, avancement: { ...avancement(15, 0), memoire_ecrit_le: null } })
  assert.deepEqual(lectureAO(pieces, MAINTENANT).action, { verbe: 'Réunir les pièces', segment: 'verification', statut: false })
})

test('le fil des étapes ne change pas : « Pièces » reste franchie quand des pièces restent à joindre', () => {
  const avec = filDeLAO(ao({ avancement: avancement(15, 0) }))
  const sans = filDeLAO(ao({ avancement: avancement(9, 9) }))
  assert.deepEqual(avec, sans)
})

test('« À la une » : un seul bouton plein, vers Pièces tant qu’il reste des pièces, vers l’export ensuite', () => {
  const reste = rendreUne(ao({ avancement: avancement(15, 0) }))
  assert.match(reste, /href="\/projects\/ao-1\/verification"[^>]*>Réunir les pièces/)
  assert.doesNotMatch(reste, /Télécharger le dossier<|\/export"/)
  const pret = rendreUne(ao({ avancement: avancement(9, 9) }))
  assert.match(pret, /href="\/projects\/ao-1\/export"[^>]*>Télécharger le dossier/)
})
