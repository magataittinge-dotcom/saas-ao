// « Voir dans le DCE » : logique pure de l'écran — position des rectangles avec rotation, loupe,
// aiguillage des niveaux et des formats, citation. Textes inventés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aiguiller, centreVertical, citationAffichee, couperContexte, defilementCentre, formatDe, libelleNiveau,
  rectsAffiches, rectsDansLoupe, tournerRectangle, urlExpiree, vueParDefaut, vuesDisponibles,
  type Ancre, type ReponseSource, type Rect,
} from '@/lib/ancre'

const proche = (a: readonly number[], b: readonly number[]) => {
  assert.equal(a.length, b.length)
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${a} ≠ ${b}`))
}

const ancre = (sur: Partial<Ancre> = {}): Ancre => ({
  version: 1, doc_id: 'd', page: 4, rotation: 0, rects: [[0.1, 0.2, 0.5, 0.25]],
  niveau: 'passage', citation: { avant: 'a', passage: 'p', apres: 'b' }, ...sur,
})
const reponse = (sur: Partial<ReponseSource> = {}): ReponseSource => ({
  ...ancre(), cadrage: null,
  document: { nom: 'cctp.pdf', url: '/api/files/view/x', origine: '/api/files/view/x', expire_dans: 900 },
  ...sur,
})

// ─── rotation (même table que backend/services/pdf_positions.py::tourner_rectangle) ───

test('rotation 0 : le rectangle ne bouge pas', () => {
  assert.deepEqual(tournerRectangle([0.1, 0.2, 0.5, 0.25], 0), [0.1, 0.2, 0.5, 0.25])
})

test('rotation 90, 180, 270 : le rectangle suit la page tournée', () => {
  const r: Rect = [0.1, 0.2, 0.5, 0.25]
  proche(tournerRectangle(r, 90), [0.75, 0.1, 0.8, 0.5])
  proche(tournerRectangle(r, 180), [0.5, 0.75, 0.9, 0.8])
  proche(tournerRectangle(r, 270), [0.2, 0.5, 0.25, 0.9])
})

test('quatre rotations de 90° ramènent au rectangle de départ ; 360 et -90 sont admis', () => {
  const r: Rect = [0.12, 0.3, 0.64, 0.41]
  let t = r
  for (let i = 0; i < 4; i++) t = tournerRectangle(t, 90)
  proche(t, r)
  proche(tournerRectangle(r, 360), r)
  proche(tournerRectangle(r, -90), tournerRectangle(r, 270))
})

test("la rotation garde l'aire du rectangle (tournée dans une page carrée)", () => {
  const r: Rect = [0.1, 0.2, 0.5, 0.25]
  for (const rot of [90, 180, 270]) {
    const t = tournerRectangle(r, rot)
    const aire = (q: Rect) => (q[2] - q[0]) * (q[3] - q[1])
    assert.ok(Math.abs(aire(t) - aire(r)) < 1e-9)
  }
})

test("rectsAffiches : la rotation de la page principale ou de la suite, rien hors niveau « passage »", () => {
  const a = ancre({ rotation: 90, suite: { page: 5, rotation: 180, rects: [[0, 0, 0.5, 0.1]] } })
  proche(rectsAffiches(a)[0], tournerRectangle([0.1, 0.2, 0.5, 0.25], 90))
  proche(rectsAffiches(a, 'suite')[0], tournerRectangle([0, 0, 0.5, 0.1], 180))
  assert.deepEqual(rectsAffiches(ancre()), [[0.1, 0.2, 0.5, 0.25]])
  assert.deepEqual(rectsAffiches(ancre({ suite: undefined }), 'suite'), [])
  assert.deepEqual(rectsAffiches(ancre({ niveau: 'page', rects: [] })), [])
  assert.deepEqual(rectsAffiches(ancre({ niveau: 'aucun', rects: [[0, 0, 1, 1]] })), [])
})

// ─── loupe ───

test('loupe : un rectangle est rapporté au cadre recadré', () => {
  const cadre: Rect = [0.0, 0.1, 0.5, 0.3]
  const [r] = rectsDansLoupe([[0.1, 0.2, 0.4, 0.25]], cadre)
  proche(r, [0.2, 0.5, 0.8, 0.75])
})

test('loupe : sans cadrage les rectangles restent ceux de la page ; hors cadre ils sont écartés ; bornés à [0, 1]', () => {
  assert.deepEqual(rectsDansLoupe([[0.1, 0.2, 0.4, 0.25]], null), [[0.1, 0.2, 0.4, 0.25]])
  assert.deepEqual(rectsDansLoupe([[0.1, 0.8, 0.4, 0.9]], [0, 0.1, 0.5, 0.3]), [])
  const [r] = rectsDansLoupe([[0.4, 0.05, 0.9, 0.2]], [0.0, 0.1, 0.5, 0.3])
  assert.ok(r.every((v) => v >= 0 && v <= 1))
  assert.equal(r[2], 1)
  assert.deepEqual(rectsDansLoupe([[0, 0, 1, 1]], [0.5, 0.5, 0.5, 0.6]), [])      // cadre sans largeur
})

test('centre du passage et position de défilement qui le centre', () => {
  assert.equal(centreVertical([]), null)
  assert.equal(centreVertical([[0, 0.2, 1, 0.3], [0, 0.4, 1, 0.5]]), 0.35)
  // page de 1000 px commençant à 20 px, fenêtre de 600 px : milieu à 0.35 → 370 px de page + 20 − 300
  assert.equal(defilementCentre(0.35, 1000, 20, 600), 70)
  assert.equal(defilementCentre(0.01, 1000, 0, 600), 0)                              // jamais négatif
})

// ─── niveaux et formats ───

test('aiguillage : PDF par défaut (format absent), tableur à part, niveau « aucun » sans page', () => {
  assert.equal(formatDe({}), 'pdf')
  assert.equal(aiguiller(reponse()), 'pdf')
  assert.equal(aiguiller(reponse({ niveau: 'page', rects: [] })), 'pdf')
  assert.equal(aiguiller(reponse({ niveau: 'aucun', rects: [] })), 'aucun')
  assert.equal(aiguiller(reponse({ format: 'tableur' })), 'tableur')
  assert.equal(aiguiller(reponse({ format: 'tableur', niveau: 'aucun' })), 'tableur')
  assert.equal(aiguiller(reponse({ format: 'rien-de-connu' })), 'format-inconnu')
})

test('vues : trois pour un PDF avec document, deux sans PDF (Word sans aperçu : aucune), Passage par défaut', () => {
  assert.deepEqual(vuesDisponibles(reponse()), ['passage', 'page', 'document'])
  assert.deepEqual(vuesDisponibles(reponse({ document: { nom: 'x', url: null, origine: 'o', expire_dans: 900 } })), ['passage', 'page'])
  assert.deepEqual(vuesDisponibles(reponse({ niveau: 'aucun', rects: [] })), [])
  assert.deepEqual(vuesDisponibles(reponse({ format: 'tableur' })), [])
  assert.equal(vueParDefaut(['passage', 'page', 'document']), 'passage')
  assert.equal(vueParDefaut(['document']), 'document')
  assert.equal(vueParDefaut([]), null)
})

test("source d'un champ du bandeau (sans images serveur) : Passage et Document seulement", () => {
  assert.deepEqual(vuesDisponibles(reponse({ niveau: 'page', rects: [] }), false), ['passage', 'document'])
  assert.deepEqual(vuesDisponibles(reponse({ niveau: 'aucun', rects: [] }), false), [])
})

test('libellés de situation : toujours positifs', () => {
  const textes = [
    libelleNiveau({ niveau: 'passage' }),
    libelleNiveau({ niveau: 'passage', suite: { page: 5, rotation: 0, rects: [] } }),
    libelleNiveau({ niveau: 'page' }),
    libelleNiveau({ niveau: 'aucun' }),
  ]
  assert.equal(textes[2], 'Page citée par l’analyse')
  for (const t of textes) {
    assert.ok(!/manquant|incompl|absent|!/i.test(t), t)
  }
})

test('libellés de situation d’un tableur : ligne et feuille, jamais « page »', () => {
  assert.equal(libelleNiveau({ niveau: 'passage', format: 'tableur' }), 'Ligne retrouvée dans la feuille')
  assert.equal(libelleNiveau({ niveau: 'page', format: 'tableur' }), 'Feuille citée par l’analyse')
  assert.equal(libelleNiveau({ niveau: 'aucun', format: 'tableur' }), 'Pièce citée par l’analyse')
})

// ─── citation ───

test('contexte coupé au mot : « avant » garde sa fin, « après » son début', () => {
  const texte = 'un deux trois quatre cinq six sept huit neuf dix'
  assert.equal(couperContexte(texte, 100, true), texte)
  assert.equal(couperContexte(texte, 20, true), '… sept huit neuf dix')
  assert.equal(couperContexte(texte, 20, false), 'un deux trois quatre …')
  assert.equal(couperContexte('', 20, true), '')
  assert.equal(couperContexte('  a \n b ', 20, true), 'a b')
})

test('citation : le passage reste entier, seul le contexte est raccourci', () => {
  const long = 'mot '.repeat(100)
  const c = citationAffichee({ avant: long, passage: '  Le  titulaire\nfournit  ', apres: long })
  assert.equal(c.passage, 'Le titulaire fournit')
  assert.ok(c.avant.startsWith('… ') && c.avant.length <= 165)
  assert.ok(c.apres.endsWith(' …') && c.apres.length <= 165)
})

test('URL signée : valable jusqu\'à une minute avant son expiration', () => {
  assert.equal(urlExpiree(0, 900, 839_000), false)
  assert.equal(urlExpiree(0, 900, 840_000), true)
})
