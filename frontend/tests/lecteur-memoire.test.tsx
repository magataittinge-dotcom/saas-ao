// B2 (recette du 4/11) — les titres et le gras du mémoire, dans Rédiger, restaient blancs sur fond clair
// (`prose-invert`). Le lecteur doit prendre les jetons de texte du thème, clair comme nuit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import LecteurMarkdown, { Cellule } from '@/components/memoire/LecteurMarkdown'
import { lire } from './outils/sources'
import { contrasteJetons, type Theme } from './outils/jetons'

const MD = '## Titre de partie\n\n### Sous-titre\n\nUn texte avec **un mot en gras** et une liste :\n\n- premier\n- second'

test('le lecteur ne force pas le texte clair (plus de prose-invert) et porte sa classe de thème', () => {
  const html = renderToStaticMarkup(<LecteurMarkdown text={MD} />)
  assert.doesNotMatch(html, /prose-invert/)
  assert.match(html, /lecteur-memoire/)
  // les titres du texte descendent sous ceux de l'écran (h1 étape, h2 partie, h3 section) : jamais un second h1
  assert.match(html, /<h4[^>]*>Titre de partie<\/h4>/)
  assert.match(html, /<h5[^>]*>Sous-titre<\/h5>/)
  assert.doesNotMatch(renderToStaticMarkup(<LecteurMarkdown text={'# Un grand titre dans le texte'} />), /<h[123]\b/)
  assert.match(html, /<strong>un mot en gras<\/strong>/)
})

test('la feuille de style du lecteur donne aux titres et au gras un jeton de texte lisible en clair et en nuit', () => {
  const css = lire('src/index.css')
  const bloc = css.match(/\.lecteur-memoire\s*\{([^}]*)\}/)
  assert.ok(bloc, '.lecteur-memoire absent de index.css')
  const titres = bloc[1].match(/--tw-prose-headings:\s*var\((--[\w-]+)\)/)
  const gras = bloc[1].match(/--tw-prose-bold:\s*var\((--[\w-]+)\)/)
  const corps = bloc[1].match(/--tw-prose-body:\s*var\((--[\w-]+)\)/)
  assert.ok(titres && gras && corps, 'jetons --tw-prose-headings / bold / body à définir')
  const faibles: string[] = []
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const [nom, jeton] of [['titres', titres[1]], ['gras', gras[1]], ['corps', corps[1]]]) {
      const { minimum } = contrasteJetons(theme, jeton, '--surface-1')
      if (minimum < 4.5) faibles.push(`${theme} ${nom} (${jeton}) : ${minimum.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(faibles, [])
})

test('une cellule de tableau « # » reste un signe, jamais un titre vide (trois h1 dans Rédiger avant la vague 1)', () => {
  const html = renderToStaticMarkup(<Cellule texte="#" />)
  assert.doesNotMatch(html, /<h\d/)
  assert.match(html, /#/)
  assert.match(renderToStaticMarkup(<Cellule texte="**Poste**" />), /<strong>Poste<\/strong>/)
})
