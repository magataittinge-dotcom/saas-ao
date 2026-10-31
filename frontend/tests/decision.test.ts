// 1.7 — Fiche de décision : conditions vérifiées avec leur source, libellés
// calmes, aucun score ni verdict machine, aucun critère de prix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libelleStatut } from '@/components/project/SynorixScoreCard'
import { lire, sansCommentaires } from './outils/sources'

test('libellés calmes : « Correspond à votre profil », « Relevé dans le dossier », « À confirmer par vous »', () => {
  assert.equal(libelleStatut({ id: 'ca', statut: 'ok' }), 'Correspond à votre profil')
  assert.equal(libelleStatut({ id: 'qualifications', statut: 'ok' }), 'Correspond à votre profil')
  assert.equal(libelleStatut({ id: 'delai', statut: 'ok' }), 'Relevé dans le dossier')
  for (const statut of ['warning', 'ko', 'non_evaluable'] as const) {
    assert.equal(libelleStatut({ id: 'ca', statut }), 'À confirmer par vous')
  }
})

test('ni score, ni verdict Go/No-Go, ni critère de prix dans la fiche', () => {
  const code = sansCommentaires(lire('src/components/project/SynorixScoreCard.tsx'))
  for (const interdit of ['No-Go', "'Go'", 'Vigilance', '/100', 'data.score', 'data.verdict', 'ponderation', 'Pondération']) {
    assert.ok(!code.includes(interdit), interdit)
  }
  assert.ok(code.includes('On y va') && code.includes('On passe'))
  assert.match(code, /changerStatut\('sans_suite'\)/)            // « On passe » = statut sans suite existant
})

test("la fiche est affichée en fin d'analyse et « On y va » valide l'analyse", () => {
  const code = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(code, /<SynorixScoreCard project=\{project\} onOpenSource=\{openFieldSource\} onYAller=\{handleValidate\}/)
})
