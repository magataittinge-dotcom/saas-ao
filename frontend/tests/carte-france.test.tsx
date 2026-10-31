// B2 — la carte de France : rendu avec des comptes, nom accessible, clic qui remonte le code,
// sélection multiple, zoom et déplacement du cadre, flèches du clavier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import CarteFrance, { DepartementCarteVue } from '@/components/veille/CarteFrance'
import { DEPARTEMENTS, VIEWBOX } from '@/components/veille/donnees/departements'
import {
  basculerSelection, chiffreBulle, deplacer, estZoome, libelleDepartement, palierBulle, rayonBulle, voisinDansLaDirection, zoomer,
} from '@/lib/carteFrance'
import { lire, sansCommentaires } from './outils/sources'

const COMPTES = { '69': 12, '75': 1, '13': 30 }
const dep = (code: string) => DEPARTEMENTS.find((d) => d.code === code)!
const PLEIN = { ...VIEWBOX }

test('la carte se rend : un bouton par département, avec son nom et son nombre d’avis', () => {
  const html = renderToStaticMarkup(<CarteFrance comptes={COMPTES} selection={['69']} onSelection={() => {}} />)
  assert.equal((html.match(/role="button"/g) ?? []).length, DEPARTEMENTS.length, 'un bouton par département')
  assert.ok(html.includes('aria-label="Rhône, 12 avis"'))
  assert.ok(html.includes('aria-label="Paris, 1 avis"'))
  assert.ok(html.includes('aria-label="Bouches-du-Rhône, 30 avis"'))
  assert.ok(html.includes('aria-label="Ain, aucun avis ouvert"'))
  // le département choisi est annoncé comme enfoncé, les autres non
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.match(html, /aria-label="Rhône, 12 avis"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Rhône, 12 avis"/)
  // trois bulles seulement : les départements sans avis n'en ont pas
  assert.equal((html.match(/class="cf-bulle"/g) ?? []).length, 3)
  // les chiffres sont écrits dans les bulles
  assert.ok(/<text class="cf-chiffre">12<\/text>/.test(html) && /<text class="cf-chiffre">30<\/text>/.test(html))
})

test('un seul arrêt de tabulation sur la carte (tabindex itinérant)', () => {
  const html = renderToStaticMarkup(<CarteFrance comptes={COMPTES} selection={[]} onSelection={() => {}} />)
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1)
  assert.ok((html.match(/tabindex="-1"/g) ?? []).length >= DEPARTEMENTS.length - 1)
})

test('le clic sur un département remonte son code', () => {
  const recus: string[] = []
  const el = DepartementCarteVue({
    dep: dep('69'), compte: 12, choisi: false, echelle: 0.7, focalisable: true,
    onChoisir: (c) => recus.push(c), onSurvol: () => {},
  } as never) as ReactElement<{ onClick: () => void; onKeyDown: (e: { key: string; preventDefault: () => void }) => void; 'aria-label': string }>
  assert.equal(el.props['aria-label'], 'Rhône, 12 avis')
  el.props.onClick()
  el.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
  el.props.onKeyDown({ key: ' ', preventDefault: () => {} })
  el.props.onKeyDown({ key: 'a', preventDefault: () => {} })
  assert.deepEqual(recus, ['69', '69', '69'], 'clic, Entrée et Espace ; une autre touche ne fait rien')
})

test('sélection multiple : ajouter, retirer, limite du serveur', () => {
  assert.deepEqual(basculerSelection([], '69'), ['69'])
  assert.deepEqual(basculerSelection(['69'], '01'), ['69', '01'])
  assert.deepEqual(basculerSelection(['69', '01'], '69'), ['01'])
  const trente = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')).filter((c) => c !== '20').concat('2A', '2B').slice(0, 30)
  assert.equal(trente.length, 30)
  assert.deepEqual(basculerSelection(trente, '75'), trente, 'au-delà de 30, rien n’est ajouté')
  assert.ok(!basculerSelection(trente, trente[0]).includes(trente[0]), 'mais on peut toujours retirer')
})

test('trois paliers de bulles et libellés', () => {
  assert.deepEqual([1, 4, 5, 19, 20, 400].map(palierBulle), [1, 1, 2, 2, 3, 3])
  assert.ok(rayonBulle(1) < rayonBulle(5) && rayonBulle(5) < rayonBulle(20))
  assert.equal(chiffreBulle(7), '7')
  assert.equal(chiffreBulle(240), '99+')
  assert.equal(libelleDepartement('Rhône', 12), 'Rhône, 12 avis')
  assert.equal(libelleDepartement('Rhône', 0), 'Rhône, aucun avis ouvert')
})

test('zoom et déplacement : le cadre garde ses proportions et reste dans le dessin', () => {
  const z = zoomer(PLEIN, 2, 0.5, 0.5, PLEIN)
  assert.ok(Math.abs(z.w - PLEIN.w / 2) < 1e-6)
  assert.ok(Math.abs(z.w / z.h - PLEIN.w / PLEIN.h) < 1e-6)
  assert.ok(estZoome(z, PLEIN) && !estZoome(PLEIN, PLEIN))
  assert.ok(z.x >= PLEIN.x && z.x + z.w <= PLEIN.x + PLEIN.w + 1e-6)
  const loin = zoomer(PLEIN, 100, 0.5, 0.5, PLEIN)
  assert.ok(Math.abs(loin.w - PLEIN.w / 8) < 1e-6, 'zoom borné à 8×')
  assert.deepEqual(zoomer(z, 0.01, 0.5, 0.5, PLEIN), PLEIN, 'dézoomer revient au dessin entier')
  const d = deplacer(z, 10_000, -10_000, PLEIN)
  assert.equal(d.x + d.w, PLEIN.x + PLEIN.w)
  assert.equal(d.y, PLEIN.y)
  // zoomer autour d'un coin garde ce coin en place
  const coin = zoomer(PLEIN, 2, 0, 0, PLEIN)
  assert.equal(coin.x, PLEIN.x)
  assert.equal(coin.y, PLEIN.y)
})

test('les flèches du clavier mènent au département voisin dans la bonne direction', () => {
  const points = DEPARTEMENTS
  assert.equal(voisinDansLaDirection(points, '69', 'haut') !== null, true)
  const ouest = voisinDansLaDirection(points, '69', 'gauche')!
  assert.ok(dep(ouest).cx < dep('69').cx, 'à gauche du Rhône')
  const est = voisinDansLaDirection(points, '69', 'droite')!
  assert.ok(dep(est).cx > dep('69').cx, 'à droite du Rhône')
  const sud = voisinDansLaDirection(points, '69', 'bas')!
  assert.ok(dep(sud).cy > dep('69').cy)
  assert.equal(voisinDansLaDirection(points, 'xx', 'haut'), null)
})

test('en nuit, le département qui compte des avis reste assez sombre pour que la bulle y garde 3:1 (mesuré : 3,13)', () => {
  const css = lire('src/components/veille/carte-france.css')
  assert.match(css, /\[data-theme="dark"\] \.cf \{[^}]*--cf-actif: color-mix\(in srgb, var\(--accent-tint\) 45%, var\(--surface-2\)\)/)
})

test('la carte ne contient aucune couleur écrite en dur (jetons seulement)', () => {
  const css = lire('src/components/veille/carte-france.css').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'pas de couleur hexadécimale')
  assert.doesNotMatch(css, /rgba?\(/, 'pas de rgb()')
  const code = sansCommentaires(lire('src/components/veille/CarteFrance.tsx'))
  assert.doesNotMatch(code, /#[0-9a-fA-F]{6}\b/)
})
