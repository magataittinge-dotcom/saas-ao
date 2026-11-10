// Grille (VEILLE-DESIGN P8, P10) : un seul conteneur, posé par la coquille, qui porte aussi le contenu de la barre du haut ;
// un en-tête de page (h1 serif, sous-ligne, action à droite) ; le petit titre de la barre n'apparaît que lorsque le h1 est sorti
// de l'écran. Le garde-fou « page-sans-conteneur » (garde-fous-design.test.ts) tient les routes ; la mesure à l'écran est
// design/scenarios/grille.mjs (banc).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Page } from '@/components/ui/page'
import { TitreBarre } from '@/components/layout/Header'
import { lire, sansCommentaires } from './outils/sources'

test('le conteneur : 1 200 px + gouttière, une seule classe, aux jetons', () => {
  const css = sansCommentaires(lire('src/index.css'))
  const regle = css.match(/\.conteneur\s*\{[^}]+\}/)?.[0] ?? ''
  assert.match(regle, /max-width:\s*calc\(var\(--container\) \+ 2 \* var\(--gutter\)\)/)
  assert.match(regle, /padding-inline:\s*var\(--gutter\)/)
  assert.match(regle, /margin-inline:\s*auto/)
})

test('la coquille pose le conteneur : autour de l\'écran et dans la barre du haut ; <main> n\'a plus de marge latérale', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /<div className="conteneur[^"]*"[^>]*data-conteneur-page/)
  const main = layout.match(/<main[\s\S]*?>/)?.[0] ?? ''
  assert.doesNotMatch(main, /\bpx-\d|sm:px-/)
  const header = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(header, /className="conteneur /)
  assert.doesNotMatch(header, /px-3 sm:px-6/)
})

test('<Page> : un h1 serif, une sous-ligne, une action à droite ; étroite = alignée à gauche, jamais recentrée', () => {
  const html = renderToStaticMarkup(<Page titre="Coffre-fort" sousTitre="Vos pièces, prêtes à joindre." action={<a href="/x">Déposer</a>} etroite><p>contenu</p></Page>)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.match(html, /<h1[^>]*class="[^"]*titre-page[^"]*"[^>]*>Coffre-fort<\/h1>/)
  assert.match(html, /Vos pièces, prêtes à joindre\./)
  assert.match(html, /data-page-action[^>]*><a href="\/x">Déposer<\/a>/)
  assert.match(html, /data-page="etroite"/)
  assert.doesNotMatch(html, /mx-auto/)
  const pleine = renderToStaticMarkup(<Page titre="Rédiger" pleine><p>x</p></Page>)
  assert.match(pleine, /data-page-pleine/)
})

test('le titre de la barre est caché tant que le h1 est à l\'écran (opacité 0, aria-hidden), montré en fondu de 100 ms quand il en sort', () => {
  const cache = renderToStaticMarkup(<TitreBarre titre="Mes AO" montre={false} />)
  assert.match(cache, /aria-hidden="true"/)
  assert.match(cache, /opacity-0/)
  assert.match(cache, /transition-opacity/)
  assert.match(cache, /duration-fast/)
  const montre = renderToStaticMarkup(<TitreBarre titre="Mes AO" montre />)
  assert.doesNotMatch(montre, /aria-hidden="true"/)
  assert.match(montre, /opacity-100/)
  // même boîte dans les deux états : aucun saut de mise en page
  assert.equal(cache.replace(/ aria-hidden="true"/, '').replace('opacity-0', 'opacity-100'), montre)
})

test('la coquille observe le h1 de l\'écran (IntersectionObserver), quel que soit l\'écran', () => {
  const code = sansCommentaires(lire('src/components/layout/useTitreSorti.ts'))
  assert.match(code, /new IntersectionObserver\(/)
  assert.match(code, /querySelector\('h1'\)/)
  assert.match(code, /MutationObserver/)
})
