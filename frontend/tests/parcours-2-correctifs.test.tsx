// Les bugs trouvés par le second test de bout en bout (frontend/e2e/parcours-2.mjs, rapport E2E-2 du 12/11), un test
// chacun. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lotAOuvrir } from '@/lib/choixLots'
import { lire, sansCommentaires } from './outils/sources'

test('un seul lot coché, déjà analysé : il se rouvre sans être relu (aucune unité) ; sinon, c’est une vraie analyse', () => {
  assert.equal(lotAOuvrir(new Set(['lot02']), ['lot01', 'lot02']), 'lot02')
  assert.equal(lotAOuvrir(new Set(['lot02']), ['lot01']), null, 'jamais lu : on l’analyse (1 unité)')
  assert.equal(lotAOuvrir(new Set(['lot01', 'lot02']), ['lot01', 'lot02']), null, 'plusieurs lots cochés : une vraie analyse, confirmée')
  assert.equal(lotAOuvrir(new Set(['all']), ['lot01']), null, 'tout le dossier : une vraie analyse')
  assert.equal(lotAOuvrir(new Set(), ['lot01']), null)
  assert.equal(lotAOuvrir(new Set(['lot01']), undefined), null)
  const ecran = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(ecran, /lotAOuvrir\(selectedIds, project\.lots_analyses\)/)
  assert.match(ecran, /\{aOuvrir \? 'Ouvrir ce lot' : /)
  assert.match(ecran, /if \(aOuvrir\) \{ if \(!ouverture\.isPending\) ouverture\.mutate\(aOuvrir\); return \}/)
  assert.match(ecran, /api\.post<Project>\(`\/projects\/\$\{project\.id\}\/lots\/select`/, 'ouvrir = changer le lot en cours, sans /analyze')
  assert.match(ecran, /Analyser de nouveau \(\$\{libelleUnites\(1\)\}\)/, 'relire ce lot reste possible, et dit son coût')
  assert.match(lire('src/types/index.ts'), /lots_analyses\?: string\[\]/)
})

test('rédaction du mémoire en échec : la phrase du produit (rien décompté) et « Relancer la rédaction », comme l’analyse', () => {
  const formulaire = sansCommentaires(lire('src/components/project/FormulaireMemoire.tsx'))
  assert.match(formulaire, /echec \? 'Relancer la rédaction' : hasMemoire \? 'Régénérer le mémoire' : 'Rédiger le mémoire'/)
  const etape = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(etape, /echec=\{echecRun \|\| \(echecRedaction && !genError\)\}/, 'un refus au lancement (genError seul) n’est pas un échec de rédaction')
  assert.match(etape, /setEchecRun\(true\)\s*setGenError\(memoireSse\.detail \|\| ECHEC_REDACTION\)/, 'l’échec suivi en direct (flux) compte aussi')
  assert.match(etape, /const ECHEC_REDACTION = 'La rédaction du mémoire s’est arrêtée avant la fin\. Rien n’a été décompté de votre abonnement\.'/, 'sans phrase du serveur, la même phrase')
  assert.match(lire('../backend/routers/memoire.py'), /MSG_ECHEC_REDACTION = "La rédaction du mémoire s’est arrêtée avant la fin\. Rien n’a été décompté de votre abonnement\."/)
})

test('mur d’abonnement d’une organisation qui paie déjà : son offre marquée sans bouton, changer d’offre passe par le portail', async () => {
  const { gesteOffre } = await import('@/lib/murOffres')
  assert.equal(gesteOffre('essentiel', 'essentiel'), 'actuelle')
  assert.equal(gesteOffre('essentiel', 'pro'), 'portail')
  assert.equal(gesteOffre('pro', 'essentiel'), 'portail')
  assert.equal(gesteOffre('free', 'essentiel'), 'paiement', 'sans offre payante : rien ne change (la page de paiement)')
  assert.equal(gesteOffre(undefined, 'pro'), 'paiement')
  const mur = sansCommentaires(lire('src/components/common/SubscriptionWall.tsx'))
  assert.match(mur, /gesteOffre\(plan, offre\.id\)/)
  assert.match(mur, />Votre offre</)
  assert.match(mur, /api\.get\('\/stripe\/portal'\)/, 'le portail, comme Paramètres > Abonnement')
  assert.match(mur, /`Choisir \$\{offre\.nom\}`/, 'sans offre payante, le bouton de toujours')
})

test('Lots sans lot coché : le bouton grisé ne dit plus « le dossier (1 unité) » quand le dossier a plusieurs lots', async () => {
  const { libelleBoutonLire } = await import('@/lib/coutLecture')
  assert.equal(libelleBoutonLire(0, 2), 'Analyser les lots choisis', 'tout le dossier vaut 2 unités : aucun coût dit tant que rien n’est coché')
  assert.equal(libelleBoutonLire(0, 0), 'Analyser le dossier (1 unité)', 'dossier sans lots : inchangé')
  assert.equal(libelleBoutonLire(0), 'Analyser le dossier (1 unité)')
  assert.equal(libelleBoutonLire(2, 2), 'Analyser 2 lots (2 unités)')
  assert.match(sansCommentaires(lire('src/routes/project/StepLotSelection.tsx')), /libelleBoutonLire\(nbChoisis, lots\.length\)\}/)
})

test('un AO gagné ou perdu : sa page propose « Corriger le résultat », qui ouvre le dialogue de statut (D16)', async () => {
  const { lectureAO } = await import('@/lib/etatAO')
  const ao = (status: string) => ({ status, deadline: '2026-10-01', echeance: null, infos_marche: undefined, current_step: 6, processing_status: 'ready', completed_steps: {} }) as never
  assert.equal(lectureAO(ao('gagné')).correction, 'Corriger le résultat')
  assert.equal(lectureAO(ao('perdu')).correction, 'Corriger le résultat')
  assert.equal(lectureAO(ao('soumis')).correction, null, 'déposé : « Indiquer le résultat », l’action de toujours')
  assert.equal(lectureAO(ao('sans_suite')).correction, null)
  assert.equal(lectureAO(ao('gagné')).action.verbe, 'Ouvrir', 'Mes AO garde « Ouvrir » sur la ligne (la correction y est dans le menu « … »)')
  const page = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.match(page, /const actionStatut = lecture\.action\.statut \? lecture\.action\.verbe : lecture\.correction/)
  assert.match(page, /onClick=\{\(\) => setStatut\(true\)\}>\{actionStatut\}</)
})

test('Export après le dépôt : seul « Indiquer le résultat » (le bandeau), plus « Je l’ai déposé »', () => {
  const exp = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.match(exp, /<SuiteDepot telecharge=\{telecharge && etatAO\(project\) !== 'termine'\}/)
})
