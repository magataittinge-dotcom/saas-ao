// Phase D, tranche 3 — les six bulles : fonctions pures, libellés positifs, sans conseil de prix ; rendu et marge basse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { calculerBulles, ORDRE_BULLES, type Bulle } from '@/lib/intelligence/bulles'
import BullesAttention from '@/components/intelligence/BullesAttention'
import type { DashboardStats } from '@/types'
import { MAINTENANT, projet, remise, textesFiche } from './outils/projetsFactices'
import { lire, sansCommentaires } from './outils/sources'

const STATS: DashboardStats = { projects_en_cours: 4, projects_soumis_ce_mois: 2, projects_gagnes: 5, taux_succes: 36, documents_expires: 1, documents_expirant_bientot: 2 }
const SANS_STATS: DashboardStats = { projects_en_cours: 0, projects_soumis_ce_mois: 0, projects_gagnes: 0, taux_succes: 0, documents_expires: 0, documents_expirant_bientot: 0 }

const jeu = () => [
  projet('export', { ...remise('2026-10-28'), current_step: 6, name: 'Bardage du gymnase' }),
  projet('memoire', { ...remise('2026-11-06'), current_step: 5, name: 'Ravalement des Tilleuls' }),
  projet('decision', { ...remise('2026-11-13'), current_step: 3, status: 'analyzed', name: 'Réhabilitation thermique' }),
  projet('lot', { ...remise('2026-11-20'), current_step: 2, name: 'Isolation des combles', lots_detectes: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] as never }),
]
const par = (b: Bulle[]) => Object.fromEntries(b.map((x) => [x.id, x]))

test('six bulles, toujours dans le même ordre (celui des ancres du visage)', () => {
  assert.equal(ORDRE_BULLES.length, 6)
  assert.deepEqual(calculerBulles(jeu(), STATS, MAINTENANT).map((b) => b.id), [...ORDRE_BULLES])
  assert.deepEqual(calculerBulles([], undefined, MAINTENANT).map((b) => b.id), [...ORDRE_BULLES])
})

test('chaque bulle compte ce que le tableau de bord reçoit déjà (AO en cours et compteurs du coffre-fort)', () => {
  const b = par(calculerBulles(jeu(), STATS, MAINTENANT))
  assert.deepEqual([b.decision.nombre, b.decision.libelle, b.decision.compte], [1, 'Décision à prendre', '1'])
  assert.deepEqual([b.remise.nombre, b.remise.libelle, b.remise.compte], [1, 'Remise dans 5 jours', 'J−5'])
  assert.deepEqual([b.lot.nombre, b.lot.libelle], [1, 'Lot à choisir'])
  assert.deepEqual([b.memoire.nombre, b.memoire.libelle], [1, 'Mémoire à rédiger'])
  assert.deepEqual([b.piece.nombre, b.piece.libelle], [1, 'Pièce à renouveler'])
  assert.deepEqual([b.expirent.nombre, b.expirent.libelle], [2, 'Expirent bientôt'])
  assert.equal(b.remise.ton, 'attention')
  assert.equal(b.piece.ton, 'attention')
  assert.equal(b.decision.ton, 'calme')
})

test('le pluriel suit le nombre', () => {
  const p = [projet('a', { current_step: 2 }), projet('b', { current_step: 2 }), projet('c', { current_step: 5 }), projet('d', { current_step: 5 })]
  const b = par(calculerBulles(p, { ...STATS, documents_expires: 3, documents_expirant_bientot: 1 }, MAINTENANT))
  assert.equal(b.lot.libelle, 'Lots à choisir')
  assert.equal(b.memoire.libelle, 'Mémoires à rédiger')
  assert.equal(b.piece.libelle, 'Pièces à renouveler')
  assert.equal(b.expirent.libelle, 'Expire bientôt')
})

test('la remise ne retient que les dates à moins de 7 jours, la plus proche d’abord', () => {
  const p = [projet('loin', remise('2026-11-30')), projet('p2', remise('2026-10-29')), projet('p1', remise('2026-10-26'))]
  const b = par(calculerBulles(p, SANS_STATS, MAINTENANT))
  assert.equal(b.remise.libelle, 'Remise dans 3 jours')
  assert.equal(b.remise.compte, 'J−3')
  assert.equal(b.remise.nombre, 2)
  assert.equal(b.remise.fiche.titre, 'AO p1')
  assert.match(b.remise.aria, /et 1 autre$/)
  // le jour même
  const auj = par(calculerBulles([projet('x', { echeance: { date: '2026-10-23', heure: '17h00' } })], SANS_STATS, MAINTENANT))
  assert.equal(auj.remise.libelle, 'Remise aujourd’hui')
})

test('les AO clos sortent des bulles (soumis, gagné, perdu, sans suite)', () => {
  const clos = (['soumis', 'gagné', 'perdu', 'sans_suite'] as const).map((s, i) => projet(`c${i}`, { status: s, current_step: 5, ...remise('2026-10-25') }))
  const b = par(calculerBulles(clos, SANS_STATS, MAINTENANT))
  for (const id of ['decision', 'remise', 'lot', 'memoire'] as const) assert.equal(b[id].nombre, 0, id)
})

test('rien à signaler : les six bulles restent, atténuées, avec un libellé et une fiche calmes', () => {
  const bulles = calculerBulles([], SANS_STATS, MAINTENANT)
  for (const b of bulles) {
    assert.equal(b.vide, true, b.id)
    assert.equal(b.ton, 'calme', b.id)
    assert.ok(b.aria.length > 5)
    assert.ok(b.fiche.cta, `${b.id} : un lien reste proposé`)
  }
  assert.equal(bulles[1].libelle, 'Aucune remise sous 7 jours')
})

test('les bulles du coffre-fort mènent au coffre-fort, celles des AO à l’écran de l’étape', () => {
  const b = par(calculerBulles(jeu(), STATS, MAINTENANT))
  assert.equal(b.piece.fiche.cta?.vers, '/vault')
  assert.equal(b.expirent.fiche.cta?.vers, '/vault')
  assert.equal(b.decision.fiche.cta?.vers, '/projects/decision/analysis')
  assert.equal(b.lot.fiche.cta?.vers, '/projects/lot/lots')
  assert.equal(b.memoire.fiche.cta?.vers, '/projects/memoire/memoire')
  assert.equal(b.remise.fiche.cta?.vers, '/projects/export/export')
  assert.equal(b.lot.fiche.meta, '4 lots repérés')
})

test('compteurs négatifs ou absents du serveur : jamais de « -1 » ni de NaN', () => {
  const b = par(calculerBulles([], { ...SANS_STATS, documents_expires: -2, documents_expirant_bientot: undefined as never }, MAINTENANT))
  assert.equal(b.piece.compte, '0')
  assert.equal(b.expirent.compte, '0')
})

test('ton : jamais « manquant / incomplet / absent », pas de point d’exclamation, aucun prix, aucun conseil de prix', () => {
  const interdits = [/manquant/i, /incompl[eè]t/i, /\babsente?s?\b/i, /!/, /\bprix\b/i, /€|euros?\b/i, /\btarif/i, /\bmontant/i, /\bchiffrage/i]
  for (const [p, s] of [[jeu(), STATS], [[], SANS_STATS], [jeu(), { ...STATS, documents_expires: 5, documents_expirant_bientot: 1 }]] as const) {
    for (const b of calculerBulles(p, s, MAINTENANT)) {
      for (const t of [b.libelle, b.compte, b.aria, ...textesFiche(b.fiche)]) for (const re of interdits) assert.doesNotMatch(t, re, `${b.id} : « ${t} »`)
    }
  }
})

test('rendu : un groupe de six boutons à bascule, chacun avec son nom accessible ; choisir deux fois revient en arrière', () => {
  const bulles = calculerBulles(jeu(), STATS, MAINTENANT)
  const html = renderToStaticMarkup(<MemoryRouter><BullesAttention bulles={bulles} choix="piece" onChoisir={() => {}} /></MemoryRouter>)
  assert.equal((html.match(/<button/g) ?? []).length, 6)
  assert.match(html, /role="group" aria-label="Ce qui demande votre attention"/)
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.match(html, /data-bulle="piece"[^>]*aria-pressed="true"/)
  assert.match(html, /aria-label="1 pièce à renouveler"/)
  assert.match(html, /data-ton="attention"/)
  // les pastilles décoratives (doublon du nom accessible) sont cachées aux lecteurs d'écran
  assert.match(html, /<span aria-hidden="true">Remise dans 5 jours<\/span>/)
})

test('téléphone : marge basse sous la grille, bulles 2 × 3 d’au moins 48 px, aucun défilement horizontal', () => {
  const css = sansCommentaires(lire('src/components/intelligence/intelligence.css'))
  const mobile = css.slice(css.indexOf('@media (max-width: 760px)'))
  assert.match(mobile, /\.syx-bulles\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(mobile, /\.syx-bulles\s*\{[^}]*margin:\s*10px 0 28px/, 'marge basse sous la grille')
  assert.match(mobile, /scroll-margin-bottom:\s*112px/, 'le bouton « + » (56 px + 16 px) ne masque pas la dernière rangée amenée en bas')
  assert.match(mobile, /\.syx-pastille\s*\{[^}]*min-height:\s*48px/)
  assert.match(css, /\.syx-bulle\s*\{[^}]*min-height:\s*44px/, 'cible tactile ≥ 44 px')
  assert.match(mobile, /\.syx-noeud\s*\{\s*display:\s*none/, 'les nœuds des fils disparaissent au téléphone')
})
