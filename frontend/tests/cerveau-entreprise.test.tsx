// Mon entreprise, T1 — le cerveau lumineux : rendu sans canvas côté serveur, décisions pures (monter les effets,
// faire tourner la boucle), cadence 60 / 30 images par seconde, calcul de cadrage, éclairs et étincelles reproductibles,
// chargement à la demande. Le rendu réel (images/s mesurées, 0 image hors écran) est mesuré dans Chromium, hors npm test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import CerveauEntreprise from '@/components/entreprise/CerveauEntreprise'
import { IMAGES_ORDINATEUR, IMAGES_TACTILE, boucleDoitTourner, doitMonterEffets, imagesParSeconde } from '@/lib/entreprise/cerveau'
import {
  REPERES, cadrageCover, eclatEtincelle, faireAlea, faireEclair, faireEtincelles, faireRegulateur, lireRvb, pointDansBoite, positionSouris, rgba, suivre,
} from '@/lib/entreprise/cerveauEffets'
import { RACINE, lire, sansCommentaires } from './outils/sources'

const html = renderToStaticMarkup(<CerveauEntreprise titre="Mon entreprise" sousTitre="Profil vivant" />)

test('rendu serveur : le titre, l\'image WebP en deux largeurs, aucun canvas', () => {
  assert.match(html, /<h1[^>]*>Mon entreprise<\/h1>/)
  assert.ok(!html.includes('<canvas'), 'pas de canvas avant que la carte soit vue')
  assert.match(html, /srcSet="\/entreprise\/cerveau-800\.webp 800w, \/entreprise\/cerveau-1600\.webp 1600w"/)
  assert.match(html, /loading="lazy"/)
  assert.match(html, /decoding="async"/)
  assert.match(html, /alt=""/, 'image décorative')
  assert.match(html, /data-theme="dark"/, 'carte sombre même en thème clair')
})

test('les deux WebP sont servis, sous 200 Ko', () => {
  for (const [nom, max] of [['cerveau-1600.webp', 200_000], ['cerveau-800.webp', 200_000]] as const) {
    const taille = statSync(path.join(RACINE, 'public/entreprise', nom)).size
    assert.ok(taille > 10_000 && taille < max, `${nom} : ${taille} octets`)
    assert.equal(readFileSync(path.join(RACINE, 'public/entreprise', nom)).subarray(8, 12).toString('latin1'), 'WEBP')
  }
})

test('effets : montés seulement si la carte est vue et le mouvement permis (mouvement réduit = image seule)', () => {
  assert.equal(doitMonterEffets({ mouvementReduit: false, aLEcran: true }), true)
  assert.equal(doitMonterEffets({ mouvementReduit: false, aLEcran: false }), false, 'rien avant que la carte approche')
  assert.equal(doitMonterEffets({ mouvementReduit: true, aLEcran: true }), false, 'mouvement réduit : 0 octet de script')
  assert.equal(doitMonterEffets({ mouvementReduit: false, aLEcran: true, serveur: true }), false)
})

test('boucle : ne démarre pas hors écran, ni onglet caché, ni mouvement réduit', () => {
  const ok = { mouvementReduit: false, aLEcran: true, ongletVisible: true }
  assert.equal(boucleDoitTourner(ok), true)
  assert.equal(boucleDoitTourner({ ...ok, aLEcran: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, ongletVisible: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, mouvementReduit: true }), false)
})

/** Nombre d'images calculées pendant `secondes` sur un écran de `hz` hertz, avec un léger tremblement d'horloge. */
function images(ips: number, hz: number, secondes: number): number {
  const regul = faireRegulateur(ips)
  const alea = faireAlea(3)
  let n = 0
  for (let t = 0, i = 0; t < secondes * 1000; i++) {
    t = (i * 1000) / hz + (alea() - 0.5) * 1.2
    if (regul(t)) n++
  }
  return n
}

test('cadence : 60 images/s sur ordinateur, 30 au téléphone, jamais plus quelle que soit la fréquence de l\'écran', () => {
  assert.equal(imagesParSeconde(false), IMAGES_ORDINATEUR)
  assert.equal(imagesParSeconde(true), IMAGES_TACTILE)
  assert.ok(Math.abs(images(60, 60, 2) / 2 - 60) <= 2, 'ordinateur 60 Hz')
  assert.ok(Math.abs(images(30, 60, 2) / 2 - 30) <= 2, 'téléphone 60 Hz')
  assert.ok(images(60, 144, 2) / 2 <= 62, 'ordinateur 144 Hz : plafonné à 60')
  assert.ok(images(30, 120, 2) / 2 <= 32, 'téléphone 120 Hz : plafonné à 30')
})

test('cadrage « cover » : l\'image remplit la boîte et le repère du cerveau reste dans la carte', () => {
  const large = cadrageCover(1100, 458)
  assert.ok(Math.abs(large.echelle - 1100 / 2752) < 1e-9, 'carte large : l\'échelle suit la largeur')
  const c = pointDansBoite(large, REPERES.centre.u, REPERES.centre.v)
  assert.ok(c.x > 500 && c.x < 600 && c.y > 100 && c.y < 360, `centre ${c.x},${c.y}`)
  const mobile = cadrageCover(390, 292)
  const g = pointDansBoite(mobile, REPERES.bordGauche.u, REPERES.bordGauche.v)
  const d = pointDansBoite(mobile, REPERES.bordDroit.u, REPERES.bordDroit.v)
  assert.ok(g.x > 0 && d.x < 390, 'au téléphone le cerveau tient en largeur')
})

test('éclairs et étincelles : reproductibles, bornés, 64 segments et 3 branches', () => {
  const a = faireEclair(100, 200, -10, 180, 0.42, faireAlea(7))
  const b = faireEclair(100, 200, -10, 180, 0.42, faireAlea(7))
  assert.deepEqual(a, b)
  assert.equal(a.principal.length, 65)
  assert.equal(a.branches.length, 3)
  assert.deepEqual(a.principal[0], [100, 200])
  assert.deepEqual(a.principal[64], [-10, 180])
  const e = faireEtincelles(170, faireAlea(7))
  assert.equal(e.length, 170)
  for (const s of e) {
    assert.ok(s.rayon >= 0.5 && s.rayon <= 1.9)
    for (const t of [0, 500, 12345]) { const v = eclatEtincelle(s, t); assert.ok(v >= 0.25 - 1e-9 && v <= 0.85 + 1e-9) }
  }
})

test('parallaxe : la souris est bornée, le rattrapage ne dépend pas de la cadence', () => {
  assert.deepEqual(positionSouris(550, 250, 0, 0, 1100, 500), { x: 0, y: 0 })
  assert.deepEqual(positionSouris(5000, -5000, 0, 0, 1100, 500), { x: 1, y: -1 })
  let a = 0; for (let i = 0; i < 60; i++) a = suivre(a, 1, 1000 / 60)
  let b = 0; for (let i = 0; i < 30; i++) b = suivre(b, 1, 1000 / 30)
  assert.ok(Math.abs(a - b) < 1e-9, 'une seconde à 60 ou à 30 images/s : même position')
})

test('couleurs : lues dans les variables CSS, jamais écrites dans le composant', () => {
  assert.deepEqual(lireRvb('#008cf8'), [0, 140, 248])
  assert.deepEqual(lireRvb('rgb(0 140 248)'), [0, 140, 248])
  assert.equal(lireRvb('nimporte quoi'), null)
  assert.equal(rgba([0, 140, 248], 0.5), 'rgba(0,140,248,0.5)')
})

test('chargement à la demande : la page n\'importe pas les effets, elle les charge par import dynamique', () => {
  const carte = sansCommentaires(lire('src/components/entreprise/CerveauEntreprise.tsx'))
  assert.match(carte, /lazy\(\(\) => import\('\.\/CerveauEffets'\)\)/)
  assert.doesNotMatch(carte, /from '\.\/(CerveauEffets|moteurCerveau)'/)
  for (const f of ['src/routes/Company.tsx']) assert.doesNotMatch(sansCommentaires(lire(f)), /moteurCerveau|CerveauEffets/)
  assert.match(sansCommentaires(lire('src/components/entreprise/CerveauEffets.tsx')), /from '\.\/moteurCerveau'/)
  assert.doesNotMatch(sansCommentaires(lire('src/components/entreprise/CerveauEntreprise.tsx')), /cerveauEffets/, 'le calcul des effets reste hors du morceau de la page')
})

test('un voile opaque à gauche passe entre les particules et le titre (un pixel d’étoile ne traverse plus le sous-titre)', () => {
  const src = lire('src/components/entreprise/CerveauEntreprise.tsx')
  const voile = src.match(/data-voile className="([^"]+)"/)?.[1] ?? ''
  assert.match(voile, /\bfrom-surface-0\b/, 'opaque sous le texte')
  assert.match(voile, /via-surface-0\/80/, 'fondu progressif')
  assert.match(voile, /w-\[48%\]/, 'large comme le bloc de texte')
})
