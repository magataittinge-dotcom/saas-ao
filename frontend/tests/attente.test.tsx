// 1.10 — Attente rassurante et quota annoncé : on peut continuer en
// arrière-plan, l'e-mail prévient, la durée affichée est mesurée.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgressDisplay from '@/components/common/ProgressDisplay'
import { lire, sansCommentaires } from './outils/sources'

test('l\'attente propose « Continuer en arrière-plan » et dit que l\'e-mail préviendra', () => {
  const html = renderToStaticMarkup(
    <ProgressDisplay
      steps={[]}
      currentStep="generating"
      progress={40}
      detail="Rédaction"
      avis="Vous pouvez fermer cette page : Synorix vous prévient par e-mail."
      onArrierePlan={() => {}}
    />,
  )
  assert.ok(html.includes('Continuer en arrière-plan'))
  assert.ok(html.includes('Vous pouvez fermer cette page : Synorix vous prévient par e-mail.'))
})

test('les attentes longues (analyse, mémoire) branchent l\'arrière-plan et l\'avis', () => {
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(analyse, /avis=\{avisAttente\}/)
  assert.match(analyse, /onArrierePlan=\{\(\) => navigate\('\/dashboard'\)\}/)
  const memoire = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.equal((memoire.match(/onArrierePlan=\{\(\) => navigate\('\/dashboard'\)\}/g) ?? []).length, 2)
})

test('avant la génération : quota selon l\'offre et durée mesurée, aucun chiffre inventé', () => {
  const code = sansCommentaires(lire('src/components/project/MemoirePreflight.tsx'))
  assert.ok(code.includes('Rédaction : environ 15 minutes'))     // 930 s mesurées (RESULTAT.md)
  assert.ok(code.includes('sur votre essai'))                    // l'essai est à vie, pas « ce mois »
  assert.ok(!/20 pages|2 minutes/.test(code))
})

// R11 — la promesse de l'e-mail suit la configuration réelle du serveur.
import { avisAttente } from '@/lib/avisAttente'

test('R11 : « vous prévient par e-mail » seulement si l\'envoi d\'e-mails est actif', () => {
  assert.equal(avisAttente('analyse', true), 'Vous pouvez fermer cette page : Synorix vous prévient par e-mail.')
  for (const inconnu of [false, undefined] as const) {
    assert.equal(avisAttente('analyse', inconnu), "Vous pouvez quitter cette page, l'analyse continue.")
    assert.equal(avisAttente('mémoire', inconnu), 'Vous pouvez quitter cette page, la rédaction continue.')
  }
  for (const f of ['src/routes/project/StepAnalysis.tsx', 'src/routes/project/StepMemoire.tsx']) {
    assert.ok(!sansCommentaires(lire(f)).includes('Synorix vous prévient par e-mail'), f)
  }
})
