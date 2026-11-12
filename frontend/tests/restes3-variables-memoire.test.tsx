// RESTES-3 (PARCOURS-2, vus en route) : après un rechargement, Rédiger perdait « ouvriers » et « délai » ; « Relancer la
// rédaction » (ou « Régénérer ») restait grisé tant qu'ils n'étaient pas ressaisis. Les valeurs déjà données sont relues du
// mémoire (le serveur les range avec lui, `memoire.variables`) ; rien d'enregistré : les champs restent vides, rien n'est
// inventé. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VARIABLES_VIDES, corpsGeneration, variablesDuMemoire } from '@/lib/memoireGeneration'
import { lire, sansCommentaires } from './outils/sources'

test('les valeurs rangées avec le mémoire sont relues, et repartent telles quelles au serveur', () => {
  const v = variablesDuMemoire({
    nb_ouvriers: 6, delai: '4 mois', chef_chantier_nom: 'Paul Exemple', particularites: 'Site occupé',
    reference_ids: ['r1'], include_organigramme: true, gantt_phases: [{ nom: 'Phase inventée' }],
  })
  assert.deepEqual(v, { ...VARIABLES_VIDES, nb_ouvriers: '6', delai: '4 mois', chef_chantier_nom: 'Paul Exemple', particularites: 'Site occupé' })
  const corps = corpsGeneration(v, {})
  assert.equal(corps.nb_ouvriers, 6)
  assert.equal(corps.delai, '4 mois')
})

test('rien d’enregistré (aucun mémoire, ou un mémoire sans variables) : champs vides, rien d’inventé', () => {
  assert.deepEqual(variablesDuMemoire(undefined), VARIABLES_VIDES)
  assert.deepEqual(variablesDuMemoire(null), VARIABLES_VIDES)
  assert.deepEqual(variablesDuMemoire({}), VARIABLES_VIDES)
  assert.deepEqual(variablesDuMemoire({ nb_ouvriers: 'quatre', delai: 12 }), VARIABLES_VIDES, 'une valeur d’un autre type n’est pas reprise')
})

test('Rédiger : la saisie l’emporte, sinon les valeurs du mémoire', () => {
  const etape = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(etape, /const \[saisie, setSaisie\] = useState<VariablesMemoire \| null>\(null\)/)
  assert.match(etape, /const variables = saisie \?\? variablesDuMemoire\(memoire\?\.variables\)/)
  assert.match(etape, /onVariables=\{setSaisie\}/)
})
