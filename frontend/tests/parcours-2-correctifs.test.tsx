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
  assert.match(ecran, />\s*Ouvrir ce lot\s*</)
  assert.match(ecran, /api\.post<Project>\(`\/projects\/\$\{project\.id\}\/lots\/select`/, 'ouvrir = changer le lot en cours, sans /analyze')
  assert.match(ecran, /Analyser de nouveau \(\$\{libelleUnites\(1\)\}\)/, 'relire ce lot reste possible, et dit son coût')
  assert.match(lire('src/types/index.ts'), /lots_analyses\?: string\[\]/)
})

test('rédaction du mémoire en échec : la phrase du produit (rien décompté) et « Relancer la rédaction », comme l’analyse', () => {
  const formulaire = sansCommentaires(lire('src/components/project/FormulaireMemoire.tsx'))
  assert.match(formulaire, /echec \? 'Relancer la rédaction' : hasMemoire \? 'Régénérer le mémoire' : 'Rédiger le mémoire'/)
  const etape = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(etape, /echec=\{echecRedaction && !genError\}/, 'un refus au lancement (genError) n’est pas un échec de rédaction')
  assert.match(etape, /Rien n’a été décompté de votre abonnement\./, 'sans phrase du serveur, la même phrase')
  assert.match(lire('../backend/routers/memoire.py'), /MSG_ECHEC_REDACTION = "La rédaction du mémoire s’est arrêtée avant la fin\. Rien n’a été décompté de votre abonnement\."/)
})
