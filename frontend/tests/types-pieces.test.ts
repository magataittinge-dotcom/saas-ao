// R3 — « Reconnu comme » : le vrai type de la pièce, jamais « RC » par défaut.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libelleType, optionsType, typeConnu } from '@/lib/typesPieces'
import { lire, sansCommentaires } from './outils/sources'

test('chaque type que le serveur sait poser a son libellé', () => {
  for (const t of ['rc', 'cctp', 'ccap', 'plan', 'diagnostic', 'notice', 'dt', 'pgc_sps', 'planning', 'autre',
    'acte_engagement_template', 'dpgf_template', 'bpu_template', 'dqe_template']) {
    assert.ok(typeConnu(t), t)
  }
  assert.notEqual(libelleType('notice'), libelleType('rc'))
  assert.notEqual(libelleType('pgc_sps'), libelleType('rc'))
  assert.notEqual(libelleType('diagnostic'), libelleType('rc'))
  assert.notEqual(libelleType('dt'), libelleType('rc'))
  assert.notEqual(libelleType('planning'), libelleType('rc'))
})

test('un type inconnu s\'affiche « Autre », jamais RC', () => {
  assert.equal(libelleType('type_invente'), 'Autre')
  assert.equal(typeConnu('type_invente'), false)
})

test('la liste déroulante contient le type courant et envoie des valeurs acceptées par le serveur', () => {
  const valeurs = optionsType('notice').map((o) => o.value)
  assert.ok(valeurs.includes('notice'))
  // anciennes chaînes « dpgf » / « acte_engagement » : refusées par la base (contrainte de type)
  assert.ok(!valeurs.includes('dpgf'))
  assert.ok(!valeurs.includes('acte_engagement'))
  assert.ok(valeurs.includes('dpgf_template'))
  // un type hors liste (ex. formulaire DC1) reste affiché tel quel
  assert.ok(optionsType('dc1_template').map((o) => o.value).includes('dc1_template'))
})

test('l\'écran de dépôt utilise la liste commune et tronque le libellé long', () => {
  const code = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  assert.ok(code.includes('optionsType(doc.type)'))
  assert.ok(!code.includes('const DOC_TYPES'))
  // le type se choisit dans la liste déroulante du système (plus de <select> natif) : c'est elle qui coupe un libellé long
  assert.ok(code.includes('<ListeDeroulante') && !code.includes('<select'))
  assert.ok(sansCommentaires(lire('src/components/ui/liste-deroulante.tsx')).includes('truncate'))
})
