// C2 — la réécriture en trois propositions avec « Voir les différences » (REECRIRE_TROIS, éteinte par défaut).
// Éteinte : la barre appelle la route d'aujourd'hui et son dialogue est inchangé. Allumée : une route à part, trois
// propositions au choix, les différences mot à mot (retiré barré, ajouté souligné, jamais la couleur seule).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CorpsTrois, Differences } from '@/components/project/TroisPropositions'
import { differences, mots, motsChanges } from '@/lib/differences'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const AVANT = 'Nous posons les menuiseries selon les règles de l’art.'
const TROIS = ['Les menuiseries sont posées selon les règles de l’art.', 'La pose des menuiseries suit les règles de l’art.', 'Nous assurons la pose des menuiseries.']

test('les mots et leurs espaces redonnent le texte exact', () => {
  for (const t of [AVANT, '  deux  espaces\n\net ligne ', '']) assert.equal(mots(t).join(''), t)
})

test('différences : rien ne se perd, l’avant et l’après se relisent', () => {
  for (const apres of TROIS) {
    const d = differences(AVANT, apres)
    assert.equal(d.filter((x) => x.sorte !== 'ajoute').map((x) => x.texte).join(''), mots(AVANT).join(''))
    assert.equal(d.filter((x) => x.sorte !== 'retire').map((x) => x.texte).join(''), apres)
  }
  assert.deepEqual(differences(AVANT, AVANT), [{ sorte: 'pareil', texte: AVANT }])
  assert.equal(motsChanges(differences(AVANT, AVANT)), 0)
  assert.ok(motsChanges(differences(AVANT, TROIS[0])) > 0)
})

test('les différences se lisent sans la couleur : barré, souligné, et dites aux lecteurs d’écran', () => {
  const html = renderToStaticMarkup(<Differences morceaux={differences('Nous posons vite.', 'Nous posons bien.')} />)
  assert.match(html, /<del [^>]*line-through[^>]*><span class="sr-only">Retiré : <\/span>vite\.<\/del>/)
  assert.match(html, /<ins [^>]*underline[^>]*><span class="sr-only">Ajouté : <\/span>bien\.<\/ins>/)
})

test('le corps : trois choix, le texte choisi, « Voir les différences »', () => {
  const html = renderToStaticMarkup(<CorpsTrois trois={{ original: AVANT, propositions: TROIS }} choix={1} onChoix={RIEN} voirDifferences={false} onVoirDifferences={RIEN} />)
  for (const n of [1, 2, 3]) assert.match(html, new RegExp(`Proposition ${n}`))
  assert.match(html, /Voir les différences/)
  assert.match(html, /La pose des menuiseries suit/)
  assert.match(html, /mots changés/)
  const avecDiff = renderToStaticMarkup(<CorpsTrois trois={{ original: AVANT, propositions: TROIS }} choix={0} onChoix={RIEN} voirDifferences onVoirDifferences={RIEN} />)
  assert.match(avecDiff, /data-differences=""/)
  for (const h of [html, avecDiff]) assert.doesNotMatch(h, /manquant|incomplet|absent|!/i)
})

test('éteinte : la barre garde la route et le dialogue d’aujourd’hui ; allumée seulement si le serveur le dit', () => {
  const src = sansCommentaires(lire('src/components/project/RewritePassageBar.tsx'))
  assert.match(src, /const \{ reecrire_trois: enTrois \} = useFonctionsIA\(\)/)
  assert.match(src, /if \(enTrois\) \{[\s\S]*\/memoire\/reecrire-trois[\s\S]*return\n\s*\}/)
  assert.match(src, /\/memoire\/rewrite-passage/)
  assert.match(src, /titre="Réécriture proposée"/)
  assert.match(src, /\{enTrois && <TroisPropositions /)
})
