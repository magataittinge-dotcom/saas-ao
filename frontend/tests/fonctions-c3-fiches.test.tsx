// C3 — « Ce que vous voulez dire » proposé pour chaque fiche du plan (FICHE_PROPOSEE, éteinte par défaut côté serveur).
// Éteinte : la fiche est identique au caractère près. Allumée : la proposition sous le champ, à prendre ou à laisser ;
// le texte pris va dans le champ existant `voulu` (le chemin d'aujourd'hui vers le générateur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import FichePartie from '@/components/plan/FichePartie'
import { PropositionFiche, ProposerFiches } from '@/components/plan/ProposerFiches'
import type { PartiePlan } from '@/lib/planMemoire'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const PARTIE: PartiePlan = {
  cle: 'partie_b.dechets', partie: 'partie_b', titre: 'Traitement des déchets', titre_modele: 'Traitement des déchets',
  retiree: false, attendue: null, fiche: { references: null, personnes: null, materiel: null, voulu: '' },
  sous_criteres: [{ critere: 'Valeur technique', nom: 'Gestion des déchets', poids: 30 }],
  attendues: [], source: null,
  exigences: [{ id: 'e1', texte: 'Les déchets sont triés.', source: { type: 'exigence', id: 'e1', document: 'CCTP.pdf', page: 14 } }],
  propose: { references: [], personnes: [], materiel: [] },
}
const fiche = (extra: Partial<Parameters<typeof FichePartie>[0]> = {}) =>
  renderToStaticMarkup(<FichePartie partie={PARTIE} onChange={RIEN} onVoirSource={RIEN} {...extra} />)

test('éteinte : la fiche est celle d’aujourd’hui au caractère près', () => {
  const aujourdhui = fiche()
  assert.doesNotMatch(aujourdhui, /Proposé par Synorix|data-proposition-fiche/)
  assert.equal(fiche({ proposition: null, onIgnorerProposition: undefined }), aujourdhui)
  // une proposition sans geste pour la laisser ne s'affiche pas (l'écran ne la passe qu'allumée)
  assert.equal(fiche({ proposition: 'Nous trions.' }), aujourdhui)
})

test('allumée : la proposition sous le champ, à prendre ou à laisser', () => {
  const html = fiche({ proposition: 'Nous trions les déchets en benne dédiée.', onIgnorerProposition: RIEN })
  assert.match(html, /Proposé par Synorix, à relire/)
  assert.match(html, /Nous trions les déchets en benne dédiée\./)
  assert.match(html, /Utiliser ce texte/)
  assert.match(html, /Ignorer/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('« Utiliser ce texte » remplit le champ existant, puis retire la proposition', () => {
  const appels: string[] = []
  const element = PropositionFiche({ texte: 'x', onUtiliser: () => appels.push('utiliser'), onIgnorer: () => appels.push('ignorer') })
  assert.ok(element)
  const src = sansCommentaires(lire('src/components/plan/FichePartie.tsx'))
  assert.match(src, /onUtiliser=\{\(\) => \{ onChange\(\{ voulu: proposition\.slice\(0, MAX_TEXTE_LIBRE\) \}\); onIgnorerProposition\(\) \}\}/)
})

test('la ligne du plan : avant, pendant, après, sans rien inventer', () => {
  const avant = renderToStaticMarkup(<ProposerFiches enCours={false} nombre={null} erreur={null} onProposer={RIEN} />)
  assert.match(avant, /Proposer pour chaque partie/)
  const apres = renderToStaticMarkup(<ProposerFiches enCours={false} nombre={3} erreur={null} onProposer={RIEN} />)
  assert.match(apres, /3 propositions à relire/)
  const rien = renderToStaticMarkup(<ProposerFiches enCours={false} nombre={0} erreur={null} onProposer={RIEN} />)
  assert.match(rien, /Rien de sûr à proposer/)
  const erreur = renderToStaticMarkup(<ProposerFiches enCours={false} nombre={null} erreur="Le service d’IA n’a pas répondu." onProposer={RIEN} />)
  assert.match(erreur, /Le service d’IA n’a pas répondu\./)
  for (const h of [avant, apres, rien, erreur]) assert.doesNotMatch(h, /manquant|incomplet|absent|!/i)
})

test('le plan ne montre la ligne et ne passe les propositions que si le serveur dit la fonction allumée', () => {
  const src = sansCommentaires(lire('src/routes/project/StepPlan.tsx'))
  assert.match(src, /const \{ fiche_proposee: fichesProposees \} = useFonctionsIA\(\)/)
  assert.match(src, /\{fichesProposees && \(\s*<SectionEtape/)
  assert.match(src, /proposition=\{fichesProposees \? propositions\?\.\[p\.cle\] \?\? null : null\}/)
  assert.match(src, /onIgnorerProposition=\{fichesProposees \? .* : undefined\}/)
  assert.match(src, /\/plan-memoire\/proposer-voulu/)
})
