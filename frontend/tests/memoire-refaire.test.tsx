// E2 — « Refaire cette partie » : un bouton par partie, une confirmation avec le coût estimé
// (jamais de chiffre inventé côté écran), le reste du mémoire inchangé. Textes inventés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocumentView } from '@/routes/project/StepMemoire'
import { BoutonRefaire, CorpsConfirmationRefaire, libelleCout, type EstimationRefaire } from '@/components/memoire/RefaireSection'
import type { MemoireContent, Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

const CONTENU = {
  preambule: 'Préambule.',
  partie_a: { implantation: 'Caen.', historique: 'Depuis 2008.' },
  partie_b: { dechets: 'Tri sélectif.' },
  partie_c: { delai: 'Quatre mois.' },
} as unknown as MemoireContent

const rendre = (props: Partial<Parameters<typeof DocumentView>[0]> = {}) =>
  renderToStaticMarkup(
    <DocumentView content={CONTENU} project={{ name: 'AO test' } as Project} docRef={{ current: null }} {...props} />)

const ESTIMATION: EstimationRefaire = {
  modele: 'claude-sonnet-5-5', base: 'reel', jetons_prefixe: 80200, jetons_sortie: 1760, cout_usd: 0.3386, cout_eur: 0.32,
}

test('chaque partie rédigée a son bouton « Refaire cette partie », et rien sans le branchement', () => {
  assert.equal((rendre().match(/Refaire cette partie/g) ?? []).length, 0)
  const html = rendre({ onRefaire: () => {} })
  assert.equal((html.match(/memoire-refaire/g) ?? []).length, 4)           // 4 sections rédigées
  assert.match(html, /aria-label="Refaire cette partie : 1\. Implantation géographique"/)
})

test('le bouton est désactivé pendant une rédaction', () => {
  const html = rendre({ onRefaire: () => {}, refaireDesactive: true })
  assert.equal((html.match(/memoire-refaire[^>]*disabled|disabled=""[^>]*memoire-refaire/g) ?? []).length, 4)
})

test('les ancres des sections ne changent pas (les liens de la relecture y pointent)', () => {
  const html = rendre({ onRefaire: () => {} })
  for (const id of ['preambule', 'sec-implantation', 'sec-historique', 'sec-dechets', 'sec-delai']) {
    assert.ok(html.includes(`id="${id}"`), id)
  }
})

test('la confirmation affiche le coût estimé par le serveur, arrondi, et dit que rien d’autre ne change', () => {
  const html = renderToStaticMarkup(
    <CorpsConfirmationRefaire titre="4. Traitement des déchets" estimation={ESTIMATION} chargement={false} erreur={false} />)
  assert.match(html, /Coût estimé : environ 0,32( | )€/)
  assert.match(html, /Le reste du mémoire ne change pas/)
  assert.match(html, /Aucune unité de votre abonnement n’est décomptée/)
  assert.equal(libelleCout(0.12).replace(/ | /g, ' '), 'environ 0,12 €')
})

test('pendant le calcul ou si le coût est illisible, aucun chiffre n’est inventé', () => {
  const attente = renderToStaticMarkup(<CorpsConfirmationRefaire titre="x" estimation={null} chargement erreur={false} />)
  assert.match(attente, /Estimation du coût/)
  assert.doesNotMatch(attente, /€/)
  const echec = renderToStaticMarkup(<CorpsConfirmationRefaire titre="x" estimation={null} chargement={false} erreur />)
  assert.match(echec, /n’a pas pu être estimé/)
  assert.doesNotMatch(echec, /€/)
})

test('le bouton porte le nom de la partie pour les lecteurs d’écran', () => {
  const html = renderToStaticMarkup(<BoutonRefaire titre="2. Historique" onClick={() => {}} />)
  assert.match(html, /aria-label="Refaire cette partie : 2\. Historique"/)
})

test('l’écran du mémoire appelle la route de refaire et l’estimation, sans autre appel payant', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(code, /memoire\/sections\/\$\{c\.part\}\/\$\{c\.cle\}\/refaire/)
  const section = sansCommentaires(lire('src/components/memoire/RefaireSection.tsx'))
  assert.match(section, /refaire\/estimation/)
})

test('aucun mot négatif ni point d’exclamation dans « Refaire cette partie »', () => {
  const fautes = ['src/components/memoire/RefaireSection.tsx']
    .flatMap((f) => textesAffiches(f))
    .filter((t) => /manquant|incompl|absent|!/i.test(t.texte))
  assert.deepEqual(fautes, [])
})
