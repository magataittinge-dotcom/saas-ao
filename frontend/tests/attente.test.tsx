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
  assert.match(analyse, /avis="Vous pouvez fermer cette page : Synorix vous prévient par e-mail\."/)
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
