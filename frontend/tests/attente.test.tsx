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

// ── Mission finale (10/11) : l'écran d'attente refait. Rien ne boucle, une vraie barre, les étapes du serveur, l'erreur dite. ──
import { avancementSuivant, tempsHabituel } from '@/components/common/ProgressDisplay'

const ETAPES = [
  { key: 'preparation', label: 'Lecture des documents', estimated_s: 2 },
  { key: 'analyzing_pass1', label: 'Exigences administratives', estimated_s: 50 },
  { key: 'finalizing', label: 'Finalisation', estimated_s: 5 },
]

test('attente : une vraie barre (progressbar, valeur annoncée), les étapes faites, en cours et à venir, le temps habituel, le visage une fois', () => {
  const html = renderToStaticMarkup(
    <ProgressDisplay variant="page" title="Synorix lit votre dossier" steps={ETAPES} currentStep="analyzing_pass1" progress={42} detail="Je relève les exigences du règlement" avis="Vous pouvez fermer cette page : la lecture continue." />)
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="42"/)
  assert.match(html, /style="width:42%"/)
  assert.match(html, /42 %/)
  assert.match(html, /<li[^>]*aria-current="step"[^>]*>[\s\S]*?Exigences administratives[\s\S]*?En cours/)
  assert.match(html, /Lecture des documents<\/span><span[^>]*>Fait</)
  assert.match(html, /Temps habituel\s*: quelques minutes\./)
  assert.ok(html.includes('Vous pouvez fermer cette page : la lecture continue.'))
  assert.equal((html.match(/data-visage/g) ?? []).length, 1, 'le visage, une fois, à côté de la phrase de Synorix')
  assert.ok(html.includes('Je relève les exigences du règlement'))
})

test('attente : rien ne boucle, aucune couleur ni style de mise en forme en dur, aucun portail maison', () => {
  const code = sansCommentaires(lire('src/components/common/ProgressDisplay.tsx'))
  assert.doesNotMatch(code, /animate-(spin|pulse|ping)|infinite|requestAnimationFrame|createPortal|<button\b|<svg\b/)
  assert.doesNotMatch(code, /var\(--|color-mix|#[0-9a-f]{3,6}\b/i)
  assert.match(code, /motion-reduce:transition-none/)
})

test('attente en erreur : ce qui s\'est passé, l\'unité rendue, « Relancer » ; jamais « Erreur » seul ni une barre à 0 %', () => {
  const html = renderToStaticMarkup(
    <ProgressDisplay variant="page" steps={ETAPES} currentStep="analyzing_pass1" progress={30} phase="error"
      erreur="Le service de lecture est momentanément indisponible." uniteRendue onRelancer={() => {}} />)
  assert.match(html, /role="alert"/)
  assert.ok(html.includes('Le service de lecture est momentanément indisponible.'))
  assert.ok(html.includes('Votre unité vous est rendue.'))
  assert.match(html, /<button[^>]*>Relancer<\/button>/)
  assert.doesNotMatch(html, /role="progressbar"/)
  assert.match(html, /Exigences administratives[\s\S]*?Arrêtée/)
  assert.doesNotMatch(html, /Continuer en arrière-plan|manquant|incomplet|absent|!/)
})

test('attente : la barre ne recule jamais pendant un traitement ; terminé = 100 ; le temps habituel sans chiffre inventé', () => {
  assert.equal(avancementSuivant(40, 25, 'in_progress'), 40)
  assert.equal(avancementSuivant(40, 55.4, 'in_progress'), 55)
  assert.equal(avancementSuivant(40, 100, 'in_progress'), 99)
  assert.equal(avancementSuivant(40, 10, 'complete'), 100)
  assert.equal(avancementSuivant(100, 5, 'in_progress'), 5, 'un nouveau traitement repart de sa valeur')
  assert.equal(tempsHabituel(ETAPES), 'quelques minutes')
  assert.equal(tempsHabituel([{ key: 'a', label: 'A', estimated_s: 30 }]), 'moins d’une minute')
  assert.equal(tempsHabituel([{ key: 'a', label: 'A' }]), null)
  const fini = renderToStaticMarkup(<ProgressDisplay steps={ETAPES} currentStep="finalizing" progress={80} phase="complete" />)
  assert.match(fini, /aria-valuenow="100"/)
  assert.ok(fini.includes('Terminé'))
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
  assert.ok(code.includes('Rédaction : environ 3 minutes'))      // 169 s mesurées sur le mémoire réel (recette du 4/11, G8)
  assert.ok(!code.includes('15 minutes'))
  assert.ok(code.includes('sur votre essai'))                    // l'essai est à vie, pas « ce mois »
  assert.ok(!/20 pages|2 minutes/.test(code))
})

// R11 — la promesse de l'e-mail suit la configuration réelle du serveur.
import { avisAttente } from '@/lib/avisAttente'

test('R11 : « vous prévient par e-mail » seulement si l\'envoi d\'e-mails est actif', () => {
  assert.equal(avisAttente('analyse', true), 'Vous pouvez fermer cette page : Synorix vous prévient par e-mail.')
  for (const inconnu of [false, undefined] as const) {
    assert.equal(avisAttente('analyse', inconnu), 'Vous pouvez quitter cette page : la lecture continue.')
    assert.equal(avisAttente('mémoire', inconnu), 'Vous pouvez quitter cette page : la rédaction continue.')
  }
  for (const f of ['src/routes/project/StepAnalysis.tsx', 'src/routes/project/StepMemoire.tsx']) {
    assert.ok(!sansCommentaires(lire(f)).includes('Synorix vous prévient par e-mail'), f)
  }
})
