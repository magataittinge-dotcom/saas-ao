// C1 — « Proposer un paragraphe » sur une ligne « À couvrir » (RELECTURE_PROPOSER, éteinte par défaut côté serveur).
// Éteinte : la liste de la relecture est identique au caractère près. Allumée : un lien sur les seules lignes « À couvrir ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ListeRelecture } from '@/components/memoire/RelectureMemoire'
import PropositionParagraphe from '@/components/memoire/PropositionParagraphe'
import { TOUT_ETEINT, lireFonctionsIA } from '@/lib/fonctionsIA'
import type { ReponseRelecture } from '@/lib/relectureMemoire'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const DONNEES: ReponseRelecture = {
  nombre: 2, message: null, pages_estimees: 12, limite_pages: null,
  lignes: [
    { type: 'sous_critere', libelle: 'À couvrir', texte: 'Gestion des déchets (inventé)', detail: 'Valeur technique', ancre: 'sec-dechets', section: 'Partie B · 6. Traitement des déchets', source: null },
    { type: 'dtu', libelle: 'Hors liste autorisée', texte: 'DTU 52.2', detail: null, ancre: 'sec-methodologie', section: 'Partie C · 1. Méthodologie détaillée', source: null },
  ],
}
const rendre = (onProposer?: () => void) => renderToStaticMarkup(
  <MemoryRouter><ListeRelecture donnees={DONNEES} onAller={RIEN} onSource={RIEN} onProposer={onProposer} /></MemoryRouter>,
)

test('éteinte : aucun bouton, la liste est celle d’aujourd’hui au caractère près', () => {
  const sans = rendre()
  assert.doesNotMatch(sans, /Proposer un paragraphe/)
  assert.equal(sans, renderToStaticMarkup(<MemoryRouter><ListeRelecture donnees={DONNEES} onAller={RIEN} onSource={RIEN} /></MemoryRouter>))
})

test('allumée : « Proposer un paragraphe » sur les seules lignes « À couvrir »', () => {
  const avec = rendre(RIEN)
  assert.equal((avec.match(/Proposer un paragraphe/g) ?? []).length, 1)
  assert.doesNotMatch(avec, /manquant|incomplet|absent|!/i)
})

test('le tiroir ne passe le geste que si le serveur dit la fonction allumée', () => {
  const src = sansCommentaires(lire('src/components/memoire/RelectureMemoire.tsx'))
  assert.match(src, /onProposer=\{fonctions\.relecture_proposer \? .* : undefined\}/)
  assert.match(src, /\/memoire\/proposer-paragraphe/)
})

test('seul un true explicite allume ; par défaut tout est éteint', () => {
  assert.deepEqual(TOUT_ETEINT, { relecture_proposer: false, reecrire_trois: false, fiche_proposee: false, style_entreprise: false })
  assert.deepEqual(lireFonctionsIA({ relecture_proposer: 'true', reecrire_trois: 1, fiche_proposee: null }), TOUT_ETEINT)
  assert.equal(lireFonctionsIA({ relecture_proposer: true }).relecture_proposer, true)
  assert.deepEqual(lireFonctionsIA(undefined), TOUT_ETEINT)
})

test('la proposition : le texte, la copie, rien n’est écrit sans l’utilisateur', () => {
  const pret = renderToStaticMarkup(<PropositionParagraphe proposition={{ etat: 'pret', sousCritere: 'Déchets', texte: 'Nous trions les déchets [À COMPLÉTER : filière].', section: 'Partie B' }} onRetour={RIEN} onCopier={RIEN} onReessayer={RIEN} />)
  assert.match(pret, /Copier et aller à la partie/)
  assert.match(pret, /Ne pas l’utiliser/)
  assert.match(pret, /Nous trions les déchets/)
  const sansPartie = renderToStaticMarkup(<PropositionParagraphe proposition={{ etat: 'pret', sousCritere: 'Déchets', texte: 'Texte.', section: null }} onRetour={RIEN} onCopier={RIEN} onReessayer={RIEN} />)
  assert.match(sansPartie, /Copier le paragraphe/)
  const erreur = renderToStaticMarkup(<PropositionParagraphe proposition={{ etat: 'erreur', sousCritere: 'Déchets', message: 'Le service d’IA n’a pas répondu.' }} onRetour={RIEN} onCopier={RIEN} onReessayer={RIEN} />)
  assert.match(erreur, /Réessayer/)
  const attente = renderToStaticMarkup(<PropositionParagraphe proposition={{ etat: 'enCours', sousCritere: 'Déchets' }} onRetour={RIEN} onCopier={RIEN} onReessayer={RIEN} />)
  assert.match(attente, /aria-busy="true"/)
  for (const html of [pret, erreur, attente]) assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})
