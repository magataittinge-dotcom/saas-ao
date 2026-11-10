// Aurore (DESIGN.md § Components > Aurore) : trois garde-fous (réduire les animations, onglet caché, connexion
// économe), transform seul (aucun filter: blur animé), posée derrière tout le contenu, et le logo en arc d'aurore.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { connexionEconome } from '../src/components/layout/Aurore'

const composant = sansCommentaires(lire('src/components/layout/Aurore.tsx'))
const feuille = sansCommentaires(lire('src/components/layout/aurore.css'))

test('aurore : les trois garde-fous sont dans le composant (reduced-motion, visibilitychange, saveData / 2G)', () => {
  assert.match(composant, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(composant, /addEventListener\('visibilitychange'/)
  assert.match(composant, /document\.hidden/)
  assert.match(composant, /saveData/)
  assert.match(composant, /effectiveType/)
  assert.match(feuille, /\.aurore\[data-arretee\] \.aurore-ruban \{ animation-play-state: paused; \}/)
  assert.match(feuille, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.aurore-ruban \{ animation: none !important; \}/)
})

test('aurore : connexion économe = saveData ou 2G ; 3G et 4G laissent le ciel bouger', () => {
  assert.equal(connexionEconome(undefined), false)
  assert.equal(connexionEconome({ saveData: true, effectiveType: '4g' }), true)
  assert.equal(connexionEconome({ effectiveType: '2g' }), true)
  assert.equal(connexionEconome({ effectiveType: 'slow-2g' }), true)
  assert.equal(connexionEconome({ effectiveType: '3g' }), false)
  assert.equal(connexionEconome({ saveData: false, effectiveType: '4g' }), false)
})

test('aurore : transform seul, aucun filter: blur, trois rubans bleus de 28 / 36 / 44 s, plus de lueur d\'aube, pas de violet', () => {
  assert.doesNotMatch(feuille, /filter\s*:/)
  assert.doesNotMatch(feuille, /blur\(/)
  const images = [...feuille.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?)\}\s*\}/g)].map((m) => m[1])
  assert.equal(images.length, 3)
  for (const k of images) {
    const proprietes = [...k.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
    assert.deepEqual([...new Set(proprietes)], ['transform'])
  }
  const theme = lire('src/styles/theme.css')
  assert.match(theme, /--aurore-duree-a: 28s;\s*--aurore-duree-b: 36s;\s*--aurore-duree-c: 44s;/)
  // la lueur d'aube (une ellipse d'or) est retirée : elle passait derrière des titres et ressemblait à un reflet
  assert.equal(composant.match(/className="aurore-ruban /g)?.length, 3)
  assert.doesNotMatch(feuille + composant + theme, /aurore-aube|aurore-duree-d|aurore-derive-d/)
  for (const j of ['--aurore-a', '--aurore-b', '--aurore-c']) {
    for (const m of theme.matchAll(new RegExp(`${j}: rgba\\((\\d+), (\\d+), (\\d+)`, 'g'))) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
      assert.ok(!(r > g && b > g), `${j} : pas de violet (${r}, ${g}, ${b})`)
    }
  }
})

test('aurore : derrière tout (fixe, z-index 0, sans pointeur, aria-hidden), posée une fois dans Layout', () => {
  assert.match(feuille, /\.aurore \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 0;[^}]*pointer-events: none;/)
  assert.match(feuille, /mask-image: linear-gradient\(180deg, black 0%, black 38%, transparent 78%\)/)
  assert.match(composant, /aria-hidden="true"/)
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.equal(layout.match(/<Aurore \/>/g)?.length, 1)
  // nuit : 0,66 au plus : à 0,9 la sous-ligne du titre (--text-2) tombait à 3,7:1 sur le cœur des rubans (mesure sur capture, outils-socle/contraste_aurore.py)
  assert.match(lire('src/styles/theme.css'), /--aurore-opacite: \.3;[\s\S]*--aurore-opacite: \.66;/)
})

test('logo : l\'arc d\'aurore en SVG en ligne (aucune image), à la place du « S » de la barre latérale', () => {
  const logo = sansCommentaires(lire('src/components/layout/Logo.tsx'))
  assert.match(logo, /<svg viewBox="0 0 34 34"/)
  assert.match(logo, /var\(--aurore-mark\)/)
  assert.match(logo, /var\(--accent-ui\)/)
  assert.equal(logo.match(/var\(--flamme\)/g)?.length, 1, 'une seule braise')
  assert.doesNotMatch(logo, /<img|\.png|#[0-9a-f]{6}/i)
  const rail = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.match(rail, /<Logo /)
  assert.doesNotMatch(rail, />\s*S\s*</)
})
