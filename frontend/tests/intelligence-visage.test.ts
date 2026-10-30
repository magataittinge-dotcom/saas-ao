// Phase D, tranche 1 — le visage du Compagnon : fonctions pures (lecture des points, plafond d'images,
// choix du repli, palette) et fichiers servis. Le rendu WebGL lui-même est mesuré dans Chromium (hors npm test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { decoderPoints, estFichierPoints, NB_ANCRES } from '@/lib/intelligence/points'
import { boucleDoitTourner, doitCharger, faireRegulateur, IMAGES_PAR_SECONDE_MAX, raisonDuRepli } from '@/lib/intelligence/cadence'
import { estNuit, lireCouleur, paletteDepuisAccent } from '@/lib/intelligence/palette'
import { RACINE, fichiersSource, sansCommentaires, lire } from './outils/sources'

const fichierPoints = () => {
  const b = readFileSync(path.join(RACINE, 'public/visage/points.bin'))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/* ── points.bin ─────────────────────────────────────────────── */

test('points.bin : signature reconnue, tous les points décodés, aucune valeur invalide', () => {
  const buf = fichierPoints()
  assert.equal(estFichierPoints(buf), true)
  const d = decoderPoints(buf)
  assert.equal(d.n, d.nVisage + 420, 'visage + poussière générée')
  assert.ok(d.nVisage > 10_000 && d.nVisage < 12_000, `${d.nVisage} points de visage`)
  assert.equal(d.pos.length, d.n * 3)
  assert.equal(d.att.length, d.n * 4)
  assert.equal(d.ancres.length, NB_ANCRES * 3)
  assert.ok(d.pos.every(Number.isFinite), 'positions finies')
  assert.ok(d.ancres.every(Number.isFinite), 'ancres finies')
  // le visage tient dans une boîte de hauteur ~1 (normalisée par la hauteur de l'ellipse)
  let ymin = Infinity, ymax = -Infinity
  for (let k = 0; k < d.nVisage; k++) { ymin = Math.min(ymin, d.pos[k * 3 + 1]); ymax = Math.max(ymax, d.pos[k * 3 + 1]) }
  assert.ok(ymax - ymin > 1.2 && ymax - ymin < 2.6, `hauteur ${(ymax - ymin).toFixed(2)}`)
})

test('points.bin : décodage déterministe (deux lectures, mêmes octets)', () => {
  const a = decoderPoints(fichierPoints())
  const b = decoderPoints(fichierPoints())
  assert.deepEqual(Array.from(a.pos.slice(0, 600)), Array.from(b.pos.slice(0, 600)))
  assert.deepEqual(Array.from(a.att.slice(0, 600)), Array.from(b.att.slice(0, 600)))
})

test('points.bin : un fichier inconnu ou tronqué est refusé (le poster reste)', () => {
  assert.equal(estFichierPoints(new ArrayBuffer(10)), false)
  assert.throws(() => decoderPoints(new ArrayBuffer(200)), /inconnu/)
  const tronque = fichierPoints().slice(0, 4000)
  assert.throws(() => decoderPoints(tronque), /tronqué/)
})

test('les deux posters de repli sont servis : webp 640 × 640, de quelques dizaines de Ko', () => {
  for (const nom of ['tete-ouverte-poster.webp', 'tete-fermee-poster.webp']) {
    const b = readFileSync(path.join(RACINE, 'public/visage', nom))
    assert.equal(b.subarray(0, 4).toString('latin1'), 'RIFF')
    assert.equal(b.subarray(8, 12).toString('latin1'), 'WEBP')
    assert.equal(b.readUInt16LE(26) & 0x3fff, 640)
    assert.ok(b.length < 40_000, `${nom} : ${b.length} octets`)
  }
})

/* ── plafond d'images ───────────────────────────────────────── */

/** Images calculées sur `secondes` secondes pour un écran de `hz` Hz, avec un tremblement d'horloge. */
function compterImages(hz: number, secondes: number, ips?: number, tremblement = 0.6): number[] {
  const reguler = faireRegulateur(ips)
  const pas = 1000 / hz
  const instants: number[] = []
  let graine = 7
  const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647 }
  for (let t = 1000, i = 0; t < 1000 + secondes * 1000; i++, t = 1000 + i * pas + (alea() - 0.5) * 2 * tremblement) {
    if (reguler(t)) instants.push(t)
  }
  return instants
}

test('le plafond est de 30 images/s, sur tout écran, sur toute fenêtre d’une seconde', () => {
  assert.equal(IMAGES_PAR_SECONDE_MAX, 30)
  for (const hz of [30, 60, 75, 90, 120, 144, 240]) {
    const instants = compterImages(hz, 20)
    // sur n'importe quelle fenêtre glissante d'une seconde : 30 images, 31 au pire avec la tolérance d'horloge
    for (let i = 0; i < instants.length; i++) {
      const dans = instants.filter((t) => t >= instants[i] && t < instants[i] + 1000).length
      assert.ok(dans <= 31, `${hz} Hz : ${dans} images dans une seconde`)
    }
    assert.ok(instants.length <= 30 * 20 + 1, `${hz} Hz : ${instants.length} images en 20 s`)
  }
})

test('le plafond ne prive pas l’écran : ≥ 28 images/s à 60 Hz et plus, toutes les images à 24 Hz', () => {
  for (const hz of [60, 90, 120, 144]) {
    assert.ok(compterImages(hz, 20).length >= 28 * 20, `${hz} Hz`)
  }
  assert.equal(compterImages(24, 10, undefined, 0).length, 240)
})

test('demander plus de 30 images/s ne dépasse jamais 30 ; demander moins est respecté', () => {
  assert.ok(compterImages(144, 10, 60).length <= 301)
  assert.ok(compterImages(60, 10, 15).length <= 151)
  assert.ok(compterImages(60, 10, 15).length >= 140)
})

/* ── repli ──────────────────────────────────────────────────── */

test('le repli (poster) est choisi dans chaque cas où le visage ne doit pas tourner', () => {
  assert.equal(raisonDuRepli({ mouvementReduit: false }), null)
  assert.equal(raisonDuRepli({ mouvementReduit: true }), 'mouvement-reduit')
  assert.equal(raisonDuRepli({ mouvementReduit: false, webglIndisponible: true }), 'pas-de-webgl')
  assert.equal(raisonDuRepli({ mouvementReduit: false, renduLogiciel: true }), 'rendu-logiciel')
  assert.equal(raisonDuRepli({ mouvementReduit: false, contextePerdu: true }), 'contexte-perdu')
  assert.equal(raisonDuRepli({ mouvementReduit: false, pointsIllisibles: true }), 'points-illisibles')
  assert.equal(raisonDuRepli({ mouvementReduit: false, serveur: true }), 'serveur')
  // le mouvement réduit l'emporte sur tout : jamais d'animation, même si WebGL est parfait
  assert.equal(raisonDuRepli({ mouvementReduit: true, renduLogiciel: true }), 'mouvement-reduit')
})

test('en mouvement réduit, le module du visage n’est même pas téléchargé', () => {
  assert.equal(doitCharger({ mouvementReduit: true }), false)
  assert.equal(doitCharger({ mouvementReduit: false, serveur: true }), false)
  assert.equal(doitCharger({ mouvementReduit: false }), true)
})

test('la boucle ne tourne que visible à l’écran, onglet visible, mouvement permis', () => {
  const ok = { mouvementReduit: false, aLEcran: true, ongletVisible: true }
  assert.equal(boucleDoitTourner(ok), true)
  assert.equal(boucleDoitTourner({ ...ok, aLEcran: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, ongletVisible: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, mouvementReduit: true }), false)
})

/* ── palette : le bleu vient des variables CSS ─────────────── */

test('lecture des couleurs CSS : hex court/long, rgb', () => {
  assert.deepEqual(lireCouleur('#fff'), [1, 1, 1])
  const bleu = lireCouleur('#008cf8')!
  assert.deepEqual(bleu.map((v) => Math.round(v * 255)), [0, 140, 248])
  assert.deepEqual(lireCouleur('rgb(0, 140, 248)')!.map((v) => Math.round(v * 255)), [0, 140, 248])
  assert.equal(lireCouleur('oklch(0.6 0.2 251)'), null, 'oklch : résolu côté navigateur par un canvas')
  assert.equal(lireCouleur(''), null)
})

test('palette : nuit = points qui brillent (additif), clair = gravure à l’encre ; le bleu d’accent est le ton moyen', () => {
  const accent = lireCouleur('#008cf8')!
  const ambre = lireCouleur('#e7b357')!
  const nuit = paletteDepuisAccent(accent, ambre, true)
  const clair = paletteDepuisAccent(accent, ambre, false)
  assert.equal(nuit.additif, true)
  assert.equal(clair.additif, false)
  assert.deepEqual(nuit.mid, accent)
  assert.deepEqual(clair.mid, accent)
  // nuit : du sombre vers le clair ; clair : du clair vers l'encre sombre
  const lum = (c: number[]) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
  assert.ok(lum(nuit.deep) < lum(nuit.mid) && lum(nuit.mid) < lum(nuit.ice) && lum(nuit.ice) < lum(nuit.peak))
  assert.ok(lum(clair.deep) > lum(clair.mid) && lum(clair.mid) > lum(clair.ice) && lum(clair.ice) > lum(clair.peak))
  assert.match(nuit.fil, /^\d+,\d+,\d+$/)
})

test('le thème sombre se lit sur data-theme', () => {
  assert.equal(estNuit('nuit'), true)
  assert.equal(estNuit('dark'), true)
  assert.equal(estNuit('clair'), false)
  assert.equal(estNuit(null), false)
})

/* ── hygiène du code ────────────────────────────────────────── */

test('aucune couleur codée en dur dans le code du visage (seulement des variables CSS et leurs replis)', () => {
  const fichiers = fichiersSource('src/components/intelligence').concat(fichiersSource('src/lib/intelligence')).filter((f) => !/demo\.ts$/.test(f))
  for (const f of fichiers) {
    const code = sansCommentaires(lire(f))
    const brut = f.endsWith('palette.ts') ? code.replace(/BLEU_ACCENT_REPLI = '#[0-9a-f]{6}'|AMBRE_REPLI = '#[0-9a-f]{6}'/gi, '') : code
    assert.doesNotMatch(brut, /#[0-9a-fA-F]{3,8}\b/, `${f} : couleur en dur`)
  }
})

test('le moteur WebGL est chargé à la demande : jamais importé statiquement', () => {
  for (const f of fichiersSource('src')) {
    if (f.endsWith('moteurVisage.ts')) continue
    const code = sansCommentaires(lire(f))
    assert.doesNotMatch(code, /import\s+(?!type\b)[^;\n]*from ['"][^'"]*moteurVisage['"]/, `${f} : import statique du moteur`)
  }
  assert.match(sansCommentaires(lire('src/components/intelligence/Visage.tsx')), /import\('\.\/moteurVisage'\)/)
})

test('le nettoyage libère le contexte WebGL, les observateurs et les écouteurs', () => {
  const moteur = sansCommentaires(lire('src/components/intelligence/moteurVisage.ts'))
  for (const motif of [/WEBGL_lose_context/, /cancelAnimationFrame/, /io\?\.disconnect\(\)/, /ro\?\.disconnect\(\)/, /mo\.disconnect\(\)/, /removeEventListener\('visibilitychange'/, /removeEventListener\('webglcontextlost'/]) {
    assert.match(moteur, motif)
  }
})
