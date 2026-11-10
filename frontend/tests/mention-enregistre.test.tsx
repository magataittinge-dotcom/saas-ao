// Page « Fiche à télécharger » : la mention discrète « Enregistré » qui suit chaque enregistrement automatique réussi du
// bordereau, pendant une seconde, sans faire sauter la page et sans animation en mouvement réduit.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import MentionEnregistre, { DUREE_MENTION_MS, creerMention } from '@/components/fiche/MentionEnregistre'
import { lire, sansCommentaires } from './outils/sources'

test('la mention dure une seconde après un enregistrement réussi, puis disparaît', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const vus: boolean[] = []
    const mention = creerMention((v) => vus.push(v))
    assert.equal(DUREE_MENTION_MS, 1000)
    mention.montrer()
    assert.deepEqual(vus, [true])
    mock.timers.tick(999)
    assert.deepEqual(vus, [true])
    mock.timers.tick(1)
    assert.deepEqual(vus, [true, false])
  } finally { mock.timers.reset() }
})

test('un second enregistrement repart pour une seconde pleine ; un échec masque tout de suite', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const vus: boolean[] = []
    const mention = creerMention((v) => vus.push(v))
    mention.montrer()
    mock.timers.tick(700)
    mention.montrer()                                   // le délai repart de zéro
    mock.timers.tick(700)
    assert.equal(vus[vus.length - 1], true, 'encore affichée 1,4 s après le premier, 0,7 s après le second')
    mock.timers.tick(300)
    assert.equal(vus[vus.length - 1], false)
    mention.montrer()
    mention.masquer()                                   // échec : rien n'est affiché
    assert.equal(vus[vus.length - 1], false)
    mock.timers.tick(5000)
    assert.deepEqual(vus.slice(-2), [true, false])      // et le minuteur ne rallume rien
  } finally { mock.timers.reset() }
})

test('le composant : région annoncée poliment, place toujours réservée, texte 12 px secondaire', () => {
  const masque = renderToStaticMarkup(<MentionEnregistre visible={false} />)
  const visible = renderToStaticMarkup(<MentionEnregistre visible />)
  for (const html of [masque, visible]) {
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /min-h-4/)                       // la place reste prise : pas de saut de mise en page
    assert.match(html, /text-xs/)
    assert.match(html, /text-fg-2/)
    assert.doesNotMatch(html, /role="alert"/)
  }
  assert.ok(!masque.includes('Enregistré'))
  assert.ok(visible.includes('Enregistré'))
})

test('l\'écran : la mention naît d\'un enregistrement réussi seulement, l\'échec garde son message', () => {
  const code = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.match(code, /onSuccess: \(reponse\) => \{[^}]*mention\.montrer\(\)/)
  assert.match(code, /onError: \(\) => \{[^}]*mention\.masquer\(\)/)
  assert.match(code, /<MentionEnregistre visible=\{mention\.visible\} \/>/)
  assert.doesNotMatch(code, /setEnregistre/)           // plus de « Enregistré » collé dans l'en-tête de l'aperçu
  assert.match(code, /<Message ton="erreur">Le bordereau n’a pas pu être enregistré/)   // l'échec : un Message du système, avec le geste pour repartir
})

test('mouvement réduit : pas de fondu, la mention est seulement affichée ou masquée ; couleurs par jetons', () => {
  const css = lire('src/index.css')
  assert.match(css, /@keyframes mention-fondu/)
  const reduit = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduit, /\.mention-enregistre\s*\{\s*animation:\s*none/)
  const composant = lire('src/components/fiche/MentionEnregistre.tsx')
  assert.doesNotMatch(composant, /#[0-9a-fA-F]{3,8}\b|rgb\(|text-(gray|slate|zinc)/)   // jetons existants, clair et nuit
})
