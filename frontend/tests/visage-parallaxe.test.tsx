// Mon entreprise, phase A (nuit du 1er au 2/11) — le visage suit la souris (parallaxe ±6 px, inclinaison ≤ 2°, retour en
// douceur, jamais au toucher ni en mouvement réduit) et le médaillon du thème clair a un bord fondu (dégradé long, léger
// flou) ; en nuit, rien ne change. Le mouvement réel est mesuré dans Chromium, hors npm test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import VisageAnime, { FLOU_MEDAILLON_PX, MEDAILLON_CLAIR } from '@/components/entreprise/VisageAnime'
import {
  DECALAGE_MAX_PX, INCLINAISON_MAX_DEG, REPOS, auRepos, lisser, normaliser, parallaxePermise, pose, transformation,
} from '@/lib/entreprise/parallaxe'
import { courbe, decalerDepart, pointSurCourbe } from '@/lib/entreprise/fils'
import { lire, sansCommentaires } from './outils/sources'

const SCENE = { left: 100, top: 50, width: 1000, height: 420 }

test('parallaxe : ±6 px et ≤ 2° aux bords, rien au centre, bornée hors de la scène', () => {
  assert.equal(DECALAGE_MAX_PX, 6)
  assert.equal(INCLINAISON_MAX_DEG, 2)
  const centre = pose(normaliser(600, 260, SCENE))
  assert.deepEqual([centre.dx, centre.dy, centre.rotX, centre.rotY].map((v) => Math.abs(v)), [0, 0, 0, 0])
  const coin = pose(normaliser(1100, 470, SCENE))
  assert.deepEqual([coin.dx, coin.dy], [6, 6])
  assert.equal(coin.rotY, 2)
  assert.equal(coin.rotX, -2, 'le bas de la scène incline le haut du visage vers l\'arrière')
  const loin = pose(normaliser(-5000, 9000, SCENE))
  assert.ok(Math.abs(loin.dx) <= 6 && Math.abs(loin.dy) <= 6 && Math.abs(loin.rotX) <= 2 && Math.abs(loin.rotY) <= 2)
  assert.deepEqual(normaliser(10, 10, { left: 0, top: 0, width: 0, height: 0 }), REPOS, 'scène sans taille : repos')
  const inf = pose({ x: Number.NaN, y: Number.POSITIVE_INFINITY })
  assert.ok([inf.dx, inf.dy, inf.rotX, inf.rotY].every((v) => v === 0), 'valeurs non finies : repos')
})

test('parallaxe : la transformation est vide au repos (aucun calque gardé) et porte décalage + inclinaison sinon', () => {
  assert.equal(transformation(pose(REPOS)), '')
  assert.equal(transformation(pose({ x: 0.5, y: -1 })), 'translate3d(3.00px, -6.00px, 0) rotateX(2.00deg) rotateY(1.00deg)')
})

test('parallaxe : le retour se fait en douceur (lissage exponentiel, indépendant de la cadence) puis s\'arrête', () => {
  const cible = REPOS
  let n = { x: 1, y: -1 }
  const premier = lisser(n, cible, 16)
  assert.ok(premier.x < 1 && premier.x > 0.85, 'un pas de 16 ms ne saute pas : ~10 % du chemin')
  // 60 i/s ou 30 i/s : même position après le même temps
  let a = { x: 1, y: 0 }; for (let i = 0; i < 30; i++) a = lisser(a, cible, 1000 / 60)
  let b = { x: 1, y: 0 }; for (let i = 0; i < 15; i++) b = lisser(b, cible, 1000 / 30)
  assert.ok(Math.abs(a.x - b.x) < 1e-9)
  let images = 0
  while (!auRepos(n, cible) && images < 600) { n = lisser(n, cible, 1000 / 60); images++ }
  assert.ok(images > 30 && images < 120, `retour au repos en ${images} images (entre 0,5 et 2 s)`)
  assert.deepEqual(lisser({ x: 0.3, y: 0.3 }, cible, 5000), lisser({ x: 0.3, y: 0.3 }, cible, 100), 'un long gel (onglet) ne fait pas de saut absurde')
})

test('parallaxe : seulement à la souris, sur grand écran, mouvement permis et scène active', () => {
  const ok = { pointerType: 'mouse', mouvementReduit: false, tactile: false, large: true, actif: true }
  assert.equal(parallaxePermise(ok), true)
  assert.equal(parallaxePermise({ ...ok, pointerType: 'touch' }), false, 'jamais au toucher')
  assert.equal(parallaxePermise({ ...ok, pointerType: 'pen' }), false)
  assert.equal(parallaxePermise({ ...ok, mouvementReduit: true }), false, 'jamais en « réduire les animations »')
  assert.equal(parallaxePermise({ ...ok, tactile: true }), false, 'écran tactile principal')
  assert.equal(parallaxePermise({ ...ok, large: false }), false, 'téléphone')
  assert.equal(parallaxePermise({ ...ok, actif: false }), false, 'scène hors écran ou onglet caché')
})

test('fils : le départ côté visage suit le décalage, l\'arrivée reste accrochée à la bulle', () => {
  const c = courbe({ x: 400, y: 200 }, { x: 100, y: 80 })
  assert.equal(decalerDepart(c, 0, 0), c)
  const d = decalerDepart(c, 6, -4)
  assert.deepEqual(d.p0, { x: 406, y: 196 })
  assert.deepEqual(d.c1, { x: c.c1.x + 6, y: c.c1.y - 4 })
  assert.equal(d.c2, c.c2)
  assert.equal(d.p3, c.p3)
  assert.deepEqual(pointSurCourbe(d, 1), c.p3)
})

test('branchement : la scène écoute la souris, le visage est dans un calque à part (les fils ne sont plus montés)', () => {
  const scene = sansCommentaires(lire('src/components/entreprise/SceneVisage.tsx'))
  assert.match(scene, /onPointerMove=\{surMouvement\}/)
  assert.match(scene, /onPointerLeave=\{surSortie\}/)
  assert.match(scene, /parallaxePermise\(/)
  assert.match(scene, /data-plan-visage/)
  assert.doesNotMatch(scene, /FilsVisage|<canvas/, 'plus de fils autour du visage : il vit à côté d\'une phrase')
  assert.match(scene, /cancelAnimationFrame/)
  assert.ok(!/will-change/.test(scene), 'aucun calque permanent : la transformation est vide au repos')
  const fils = sansCommentaires(lire('src/components/entreprise/FilsVisage.tsx'))
  assert.match(fils, /decalerDepart\(f\.courbe/)
})

test('médaillon clair : dégradé long à paliers doux, léger flou, éteint en nuit ; masque de nuit inchangé', () => {
  assert.ok(FLOU_MEDAILLON_PX > 0 && FLOU_MEDAILLON_PX <= 8, 'flou léger')
  assert.ok((MEDAILLON_CLAIR.match(/color-mix/g) ?? []).length >= 5, 'au moins cinq paliers intermédiaires : pas de bande grise')
  assert.match(MEDAILLON_CLAIR, /transparent 82%\)$/, 'le médaillon s\'éteint avec le masque du clip')
  const g = globalThis as unknown as { window?: unknown }
  const avant = g.window
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }
  let html = ''
  try { html = renderToStaticMarkup(<VisageAnime actif={false} />) } finally { g.window = avant }
  const medaillon = html.match(/<div[^>]*data-medaillon=""[^>]*>/)?.[0] ?? ''
  assert.ok(medaillon, 'médaillon rendu')
  assert.match(medaillon, /dark:opacity-0/, 'en nuit, pas de médaillon (comme avant)')
  assert.match(medaillon, /filter:blur\(6px\)/)
  assert.ok(!/rounded-\[50%\/42%\]/.test(medaillon), 'plus de bord coupé par un arrondi')
  assert.match(html, /dark:\[mask-image:radial-gradient\(ellipse_54%_50%_at_50%_50%,#000_58%,transparent_80%\)\]/, 'masque de nuit d\'origine')
  assert.match(html, /\[mask-image:radial-gradient\(ellipse_54%_50%_at_50%_50%,#000_52%,transparent_82%\)\]/, 'masque clair plus long')
})
