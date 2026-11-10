// Un seul bouton en dégradé par écran (retour du coordinateur) : l'en-tête porte l'action principale sur ordinateur, la barre du
// bas la porte au téléphone ; jamais deux visibles ensemble.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarrePlan, BoutonPrincipalPlan, libelleEtat, libelleValidation, type EtatPlan } from '@/components/plan/ActionsPlan'
import { cartesRedaction } from '@/routes/project/StepMemoire'
import { lire, sansCommentaires } from './outils/sources'

const base: EtatPlan = { valideEtAJour: false, valideLe: null, enregistre: false, modifie: false, enCours: false, enValidation: false }
const ETATS: [string, EtatPlan][] = [
  ['proposé', base],
  ['enregistré', { ...base, enregistre: true }],
  ['modifié', { ...base, enregistre: true, modifie: true }],
  ['validé', { ...base, enregistre: true, valideEtAJour: true, valideLe: '2026-11-02T20:00:00' }],
]
const noop = () => {}
const nb = (html: string, motif: string) => (html.match(new RegExp(motif, 'g')) ?? []).length

for (const [nom, etat] of ETATS) {
  test(`plan ${nom} : un seul bouton en dégradé sur ordinateur (l'en-tête), un seul au téléphone (la barre)`, () => {
    const entete = renderToStaticMarkup(<BoutonPrincipalPlan etat={etat} onValider={noop} onRediger={noop} />)
    const barre = renderToStaticMarkup(<BarrePlan etat={etat} onValider={noop} onRediger={noop} />)
    assert.equal(nb(entete, 'data-variante="principal"'), 1)
    assert.doesNotMatch(entete, /signature-btn/)
    // dans la barre : seul le bouton porté par ActionsBarreTel (visible au téléphone seulement) est le bouton principal
    assert.equal(nb(barre, 'data-variante="principal"'), 1)
    assert.equal(nb(barre, 'data-principal-tel'), 1)
    assert.doesNotMatch(entete, /data-principal-tel/)
    // la barre ordinateur ne porte aucun bouton : l'état du plan seulement
    assert.equal(nb(barre, '<button'), 1)
  })
}

test('avant validation : « Valider le plan » est l’action, écrite une fois ; validé : « Rédiger le mémoire »', () => {
  const avant = renderToStaticMarkup(<BarrePlan etat={base} onValider={noop} onRediger={noop} />)
  assert.match(avant, /Valider le plan/)
  assert.doesNotMatch(avant, /Valider le plan et rédiger/)
  assert.doesNotMatch(avant, /Étape suivante/)
  const apres = renderToStaticMarkup(<BarrePlan etat={ETATS[3][1]} onValider={noop} onRediger={noop} />)
  assert.match(apres, /Rédiger le mémoire/)
  assert.doesNotMatch(apres, /Étape suivante/)
  assert.match(apres, /Plan validé le 2 novembre/)
})

test('libellés de l’état du plan', () => {
  assert.equal(libelleEtat(base), 'Plan proposé, à valider')
  assert.equal(libelleEtat({ ...base, enregistre: true }), 'Plan enregistré, à valider')
  assert.equal(libelleEtat({ ...base, modifie: true }), 'Modifications en cours')
  assert.equal(libelleEtat({ ...base, enCours: true }), 'Enregistrement…')
  assert.equal(libelleValidation(null), 'Plan validé')
})

test('Rédiger : « Passer à l’export » en dégradé dans l’en-tête, la barre ne le porte qu’au téléphone', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.equal((code.match(/signature-btn/g) ?? []).length, 1)           // l'en-tête
  assert.match(code, /<ActionsBarreTel>\s*<BoutonSuite etape="Export"/)    // la barre : téléphone seulement
  assert.ok(cartesRedaction)
})

test('« À couvrir » propose d’ajouter une partie pour le critère, dans la partie la plus proche', () => {
  const code = sansCommentaires(lire('src/routes/project/StepPlan.tsx'))
  assert.match(code, /Ajouter une partie pour ce critère/)
  assert.match(code, /ajouter\(parties, c\.partie \?\? 'partie_c', c\.nom\)/)
})
