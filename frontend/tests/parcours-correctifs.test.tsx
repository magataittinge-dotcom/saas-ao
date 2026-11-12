// Les bugs trouvés par le test de bout en bout (frontend/e2e, rapport E2E du 12/11), un test chacun. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verrouLancement } from '@/lib/verrouLancement'
import { rienEnCours } from '@/hooks/useProgressStream'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('double clic sur « Télécharger le dossier » : un seul dossier (le second lancement est refusé tant que le premier court)', () => {
  const verrou = verrouLancement()
  assert.equal(verrou.prendre(), true, 'premier clic : lancé')
  assert.equal(verrou.prendre(), false, 'second clic pendant le premier : refusé')
  verrou.rendre()
  assert.equal(verrou.prendre(), true, 'le téléchargement fini, un nouveau clic relance')
  const code = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.doesNotMatch(code, /onClick=\{\(\) => exportZip\(\)\}/, 'le bouton ne lance plus exportZip sans garde')
  assert.match(code, /if \(!verrouZip\.prendre\(\)\) return/)
  assert.match(code, /exportZip\(undefined, \{ onSettled: verrouZip\.rendre \}\)/)
})

test('fin de travail manquée : à l’abonnement, un état rattrapé « fini », « en échec » ou inconnu fait relire l’état final', () => {
  assert.equal(rienEnCours('init', { status: 'completed' }), 'completed')
  assert.equal(rienEnCours('init', { status: 'error' }), 'error')
  assert.equal(rienEnCours('init', {}), 'idle', 'rien de connu du serveur (redémarrage) : relire aussi')
  assert.equal(rienEnCours('init', { status: 'analyzing_pass1' }), null, 'un travail tourne : on suit le flux')
  assert.equal(rienEnCours('init', { status: 'running' }), null)
  assert.equal(rienEnCours('progress', { status: 'completed' }), null, 'seul l’état rattrapé à l’abonnement')
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(analyse, /onComplete: relireAnalyse,[\s\S]{0,80}onRienEnCours: relireAnalyse,/)
  const redaction = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(redaction, /enabled: isRunning && !isGenerating,\s*onComplete: finRedaction,\s*onRienEnCours: \(fin\) => \{/)
  assert.match(sansCommentaires(lire('src/hooks/useProgressStream.ts')), /if \(fin\) \{\s*onRienEnCoursRef\.current\?\.\(fin\)\s*continue/)
})

test('lecture en échec : l’écran relit le projet (sa phrase, jamais l’erreur technique du flux)', () => {
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(analyse, /onError: relireAnalyse,/)
  assert.match(analyse, /erreur=\{project\.processing_detail \|\| analysisSse\.detail \|\|/, 'la phrase du projet passe avant celle du flux')
})

test('aucun <p> autour d’EtatElement, qui rend lui-même un <p> (erreur de console à chaque ouverture de l’Export)', () => {
  assert.match(lire('src/components/etape/EtatElement.tsx'), /<p data-etat=\{etat\}/)
  const fautifs = fichiersSource().filter((f) => /<p\b[^>]*>\s*<EtatElement\b/.test(sansCommentaires(lire(f))))
  assert.deepEqual(fautifs, [])
})

test('rédaction relancée sur le même écran : pendant l’envoi de la demande, l’attente part de zéro (jamais « Terminé » d’avant)', () => {
  const redaction = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(redaction, /const flux = isGenerating \? \{ step: null, progress: 0, detail: '', phase: 'pending' as const \} : memoireSse/)
  assert.equal((redaction.match(/phase=\{flux\.phase\}/g) ?? []).length, 2)
  assert.doesNotMatch(redaction, /(currentStep|progress|detail|phase)=\{memoireSse\./)
})
