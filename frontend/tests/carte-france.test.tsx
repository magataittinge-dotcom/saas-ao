// B2 — la carte de France : rendu avec des comptes, nom accessible, clic qui remonte le code,
// sélection multiple, zoom et déplacement du cadre, flèches du clavier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import CarteFrance, { DepartementCarteVue } from '@/components/veille/CarteFrance'
import { DEPARTEMENTS, VIEWBOX } from '@/components/veille/donnees/departements'
import {
  ZOOM_MAX, basculerSelection, cadreSurGroupe, chiffreBulle, cleGroupe, deplacer, estGroupe, libelleGroupe, rayonAffiche, regrouperBulles,
  type BulleDep,
   estZoome, libelleDepartement, palierBulle, rayonBulle, voisinDansLaDirection, zoomer,
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
  assert.ok(Math.abs(loin.w - PLEIN.w / ZOOM_MAX) < 1e-6, 'zoom borné à ZOOM_MAX')
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

/* ── Regroupement des bulles qui se chevauchent (petite couronne) ───────────────────────── */
const COMPTES_COURONNE = { '75': 40, '92': 25, '93': 30, '94': 20, '69': 71 }
const bullesDe = (comptes: Record<string, number>): BulleDep[] =>
  DEPARTEMENTS.filter((d) => (comptes[d.code] ?? 0) > 0).map((d) => ({ code: d.code, cx: d.cx, cy: d.cy, compte: comptes[d.code] }))
const echelle600 = 600 / VIEWBOX.w

test('regrouperBulles : la petite couronne ne fait qu’un groupe, Lyon reste seul', () => {
  const g = regrouperBulles(bullesDe(COMPTES_COURONNE), echelle600)
  assert.equal(g.length, 2)
  const couronne = g.find(estGroupe)!
  assert.deepEqual(couronne.codes, ['75', '92', '93', '94'], 'codes triés')
  assert.equal(couronne.compte, 115, 'somme des comptes')
  assert.equal(couronne.rayon, rayonAffiche(115), 'rayon du palier du total')
  const seul = g.find((x) => !estGroupe(x))!
  assert.deepEqual(seul.codes, ['69'])
  assert.equal(seul.cx, dep('69').cx)
})

test('regrouperBulles : le centre est le barycentre pondéré par les comptes', () => {
  const g = regrouperBulles([
    { code: 'A', cx: 0, cy: 0, compte: 30 },
    { code: 'B', cx: 10, cy: 20, compte: 10 },
  ], 1)
  assert.equal(g.length, 1)
  assert.equal(g[0].cx, 2.5)
  assert.equal(g[0].cy, 5)
  assert.equal(g[0].compte, 40)
})

test('regrouperBulles : transitif (A touche B, B touche C, mais A ne touche pas C → un seul groupe)', () => {
  // rayon 11 (1 à 4 avis) → deux bulles se touchent sous 22 + 4 = 26 px
  const abc: BulleDep[] = [
    { code: 'A', cx: 0, cy: 0, compte: 1 },
    { code: 'B', cx: 25, cy: 0, compte: 1 },
    { code: 'C', cx: 50, cy: 0, compte: 1 },
  ]
  const g = regrouperBulles(abc, 1)
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].codes, ['A', 'B', 'C'])
  // A et C seules ne se touchent pas
  assert.equal(regrouperBulles([abc[0], abc[2]], 1).length, 2)
})

test('regrouperBulles : le groupe, plus gros, peut en toucher un troisième (le rayon suit le total)', () => {
  // A et B (4 avis chacun) fusionnent en 8 avis (rayon 14,5) ; C (4 avis, rayon 11) est à 30,7 px de A et de B (ils ne se
  // touchent pas : 30,7 > 26) mais à 28 px du barycentre (12,5 ; 0) : 28 < 14,5 + 11 + 4 = 29,5, il touche le groupe.
  const g = regrouperBulles([
    { code: 'A', cx: 0, cy: 0, compte: 4 },
    { code: 'B', cx: 25, cy: 0, compte: 4 },
    { code: 'C', cx: 12.5, cy: 28, compte: 4 },
  ], 1)
  assert.equal(g.length, 1)
  assert.equal(g[0].compte, 12)
})

test('regrouperBulles : au zoom les groupes se défont ; à grande échelle, plus aucun groupe', () => {
  const bulles = bullesDe(COMPTES_COURONNE)
  const nb = (e: number) => regrouperBulles(bulles, e).length
  assert.equal(nb(echelle600), 2)
  assert.equal(nb(echelle600 * ZOOM_MAX), 5, 'au zoom maximal, cinq bulles')
  assert.equal(nb(100), 5)
  // la suite des nombres de groupes ne baisse jamais quand l'échelle grandit
  let avant = 0
  for (let e = 0.1; e < 12; e *= 1.15) { const n = nb(e); assert.ok(n >= avant, `échelle ${e}`); avant = n }
})

test('regrouperBulles : déterministe (ordre d’entrée sans effet), sans avis pas de bulle, un seul département reste ordinaire', () => {
  const bulles = bullesDe(COMPTES_COURONNE)
  const a = regrouperBulles(bulles, echelle600)
  const b = regrouperBulles([...bulles].reverse(), echelle600)
  assert.deepEqual(a, b)
  assert.deepEqual(regrouperBulles([{ code: '75', cx: 0, cy: 0, compte: 0 }, ...bulles], echelle600), a, 'compte 0 : ignoré')
  assert.deepEqual(regrouperBulles([], 1), [])
  const seul = regrouperBulles([{ code: '75', cx: 3, cy: 4, compte: 9 }], 0.1)
  assert.deepEqual(seul, [{ codes: ['75'], cx: 3, cy: 4, compte: 9, rayon: rayonAffiche(9) }])
  assert.ok(!estGroupe(seul[0]))
})

test('regrouperBulles : en mode compact, les rayons réduits ne touchent plus de la même façon', () => {
  const trois: BulleDep[] = [
    { code: 'A', cx: 0, cy: 0, compte: 1 },
    { code: 'B', cx: 22, cy: 0, compte: 1 },
  ]
  assert.equal(regrouperBulles(trois, 1).length, 1)                        // 22 < 11 + 11 + 4
  assert.equal(regrouperBulles(trois, 1, { compact: true }).length, 2)     // 22 > 8,58 × 2 + 4
  assert.equal(regrouperBulles(trois, 1, { compact: true })[0].rayon, rayonAffiche(1, true))
})

test('libelleGroupe et cleGroupe', () => {
  assert.equal(
    libelleGroupe(['Paris', 'Hauts-de-Seine', 'Seine-Saint-Denis', 'Val-de-Marne'], 115),
    '115 avis ouverts dans 4 départements : Paris, Hauts-de-Seine, Seine-Saint-Denis, Val-de-Marne',
  )
  assert.equal(cleGroupe(['75', '92']), '75+92')
})

test('cadreSurGroupe : le cadre montre tout le groupe et défait ses bulles, sans dépasser le zoom maximal', () => {
  const bulles = bullesDe(COMPTES_COURONNE)
  const groupe = regrouperBulles(bulles, echelle600).find(estGroupe)!
  for (const largeur of [600, 1000]) {
    const cadre = cadreSurGroupe(bulles, groupe.codes, largeur, PLEIN)
    assert.ok(cadre.w < PLEIN.w && cadre.w >= PLEIN.w / ZOOM_MAX - 1e-6, `largeur ${largeur}`)
    assert.ok(Math.abs(cadre.w / cadre.h - PLEIN.w / PLEIN.h) < 1e-6, 'proportions du dessin')
    for (const c of groupe.codes) {
      const d = dep(c)
      assert.ok(d.cx >= cadre.x && d.cx <= cadre.x + cadre.w && d.cy >= cadre.y && d.cy <= cadre.y + cadre.h, `${c} dans le cadre`)
    }
    const apres = regrouperBulles(bulles, largeur / cadre.w)
    assert.equal(apres.length, 5, `à ${largeur} px, les cinq bulles sont individuelles après le zoom`)
  }
  // compact : mêmes garanties avec les rayons réduits
  const cadreC = cadreSurGroupe(bulles, groupe.codes, 340, PLEIN, { compact: true })
  assert.equal(regrouperBulles(bulles, 340 / cadreC.w, { compact: true }).length, 5)
  // groupe inconnu ou largeur inconnue : rien ne bouge
  assert.deepEqual(cadreSurGroupe(bulles, ['zz'], 600, PLEIN), PLEIN)
  assert.deepEqual(cadreSurGroupe(bulles, groupe.codes, 0, PLEIN), PLEIN)
})
