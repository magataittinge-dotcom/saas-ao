// Décision du 3/11 : un seul lot (ou un marché unique) ne passe plus par l'écran Lots ; l'écran de dépôt affiche une carte
// « Ce dossier a un seul lot : … » avec « Lire ce dossier (1 unité) ». Aucune lecture ne part sans le clic. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { lotUniqueDuDossier } from '@/lib/lotUnique'
import { actionEtape } from '@/lib/intelligence/action'
import CarteLotUnique from '@/components/depot/CarteLotUnique'
import { lire, sansCommentaires } from './outils/sources'

const LOT = { id: 'lot3', nom: 'Lot 3 — Menuiseries (démo)', sources: ['rc_table'] }

test('un seul lot : sa désignation ; un nom donné par le patron l’emporte', () => {
  assert.deepEqual(lotUniqueDuDossier({ name: 'AO démo', lots_detectes: [LOT] }), { id: 'lot3', designation: 'Lot 3 — Menuiseries (démo)', marcheUnique: false })
  assert.equal(lotUniqueDuDossier({ name: 'AO démo', lots_detectes: [{ ...LOT, user_label: 'Menuiseries extérieures' }] })?.designation, 'Menuiseries extérieures')
})

test('marché unique (détection faite, aucun lot) : l’objet du marché, sans identifiant de lot', () => {
  assert.deepEqual(lotUniqueDuDossier({ name: 'Réhabilitation d’une salle (démo)', lots_detectes: [] }), { id: null, designation: 'Réhabilitation d’une salle (démo)', marcheUnique: true })
  assert.equal(lotUniqueDuDossier({ name: '  ', lots_detectes: [] }), null)
})

test('plusieurs lots, détection pas faite ou en échec : pas de lot unique, l’écran Lots garde la main', () => {
  assert.equal(lotUniqueDuDossier({ name: 'x', lots_detectes: [LOT, { id: 'lot4', nom: 'Lot 4' }] }), null)
  assert.equal(lotUniqueDuDossier({ name: 'x', lots_detectes: null }), null)
  assert.equal(lotUniqueDuDossier({ name: 'x' }), null)
  assert.equal(lotUniqueDuDossier({ name: 'x', lots_detectes: [{ id: '!!', nom: 'Fichier protégé' }] }), null)
  assert.equal(lotUniqueDuDossier({ name: 'x', lots_detectes: [{ id: 'lot1', nom: 'Lot 1', sources: ['error'] }] }), null)
  // la réponse de la route des lots remplace ce que le projet a gardé
  assert.equal(lotUniqueDuDossier({ name: 'x', lots_detectes: [] }, [LOT, { id: 'lot4', nom: 'Lot 4' }]), null)
})

test('la prochaine action ne mène plus à l’écran Lots pour un lot unique ; plusieurs lots : inchangé', () => {
  const base = { status: 'en_cours' as const, current_step: 2, processing_status: 'ready', completed_steps: { '1': true } }
  assert.deepEqual(actionEtape({ ...base, name: 'AO démo', lots_detectes: [LOT] }), { verbe: 'Lire ce dossier', segment: 'upload' })
  assert.deepEqual(actionEtape({ ...base, name: 'AO démo', lots_detectes: [] }), { verbe: 'Lire ce dossier', segment: 'upload' })
  assert.deepEqual(actionEtape({ ...base, name: 'AO démo', lots_detectes: [LOT, { id: 'lot4', nom: 'Lot 4' }] }), { verbe: 'Choisir le lot', segment: 'lots' })
  assert.deepEqual(actionEtape(base), { verbe: 'Choisir le lot', segment: 'lots' })      // détection pas faite : comme avant
})

const carte = (props: Partial<Parameters<typeof CarteLotUnique>[0]> = {}) => renderToStaticMarkup(
  <CarteLotUnique lot={{ id: 'lot3', designation: 'Lot 3 — Menuiseries (démo)', marcheUnique: false }} ecartes={null} enCours={false} onLire={() => {}} onOuvrirLots={() => {}} {...props} />)

test('la carte : la désignation, « Lire ce dossier (1 unité) », un lien discret vers l’écran des lots', () => {
  const html = carte()
  assert.match(html, /Ce dossier a un seul lot : Lot 3 — Menuiseries \(démo\)/)
  assert.match(html, /Lire ce dossier \(1 unité\)/)
  assert.match(html, /Ouvrir l’écran des lots/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('marché unique : la carte le dit avec l’objet du marché ; lots cités non proposés : une ligne sobre', () => {
  const html = carte({ lot: { id: null, designation: 'Réhabilitation (démo)', marcheUnique: true }, ecartes: { hors_liste: 1, sans_intitule: 0 } })
  assert.match(html, /Ce dossier n’a pas de lots : Réhabilitation \(démo\)/)
  assert.match(html, /Lire ce dossier \(1 unité\)/)
  assert.match(html, /1 autre lot cité dans le dossier ne figure pas dans la liste du règlement/)
})

test('en cours de lecture : le bouton est désactivé', () => {
  assert.match(carte({ enCours: true }), /<button[^>]*disabled=""[^>]*>[^<]*(<[^>]*>)*[^<]*Lire ce dossier/)
})

test('l’écran de dépôt : aucune lecture ne part sans le clic ; le clic passe par le même geste que l’écran Lots', () => {
  const depot = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  // les seuls appels à lancer() sont dans un gestionnaire de clic
  const appels = depot.match(/lecture\.lancer\(/g) ?? []
  assert.equal(appels.length, 1)
  assert.match(depot, /const lireLeLotUnique = \(\) => \{[\s\S]*?lecture\.lancer\(/)
  assert.match(depot, /onLire=\{lireLeLotUnique\}/)
  assert.doesNotMatch(depot, /useEffect\([^)]*lancer/)
  const lecteur = sansCommentaires(lire('src/hooks/useLotsDuDepot.ts'))     // détecter les lots lit seulement : aucun appel d'écriture ni de lecture du dossier
  assert.doesNotMatch(lecteur, /\.(post|put|patch|delete)\(|lancer|analyze/)
  const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(lots, /lecture\.lancer\(selectedLotIds, selectedName\)/)
  const hook = sansCommentaires(lire('src/hooks/useLancerLecture.ts'))
  assert.match(hook, /`\/projects\/\$\{project\.id\}\/lots\/select`/)
  assert.match(hook, /`\/projects\/\$\{project\.id\}\/analyze`/)
  assert.match(hook, /err\.response\?\.status === 402/)          // la garde de quota du serveur ouvre la grille des offres
})

test('le résumé du dépôt : un seul lot se lit depuis la page, plusieurs lots se choisissent à l’étape suivante', async () => {
  const { cartesDepot } = await import('@/lib/depotDossier')
  const docs = [{ type: 'rc' as const, file_size: 1 }]
  assert.equal(cartesDepot(docs, { lots_detectes: [LOT] }).at(-1)?.detail, 'Un seul lot : la lecture se lance depuis cette page.')
  assert.equal(cartesDepot(docs, { lots_detectes: [LOT, { id: 'lot4', nom: 'Lot 4' }] }).at(-1)?.detail, 'À choisir à l’étape suivante.')
})
