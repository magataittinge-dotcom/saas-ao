// Décision du 3/11 : un seul lot (ou un marché unique) ne passe plus par l'écran Lots ; l'écran de dépôt affiche une carte
// « Ce dossier a un seul lot : … » avec « Lire ce dossier (1 unité) ». Aucune lecture ne part sans le clic. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { lotUniqueDuDossier } from '@/lib/lotUnique'
import { actionEtape } from '@/lib/intelligence/action'
import { StepProgress, STEPS } from '@/components/project/StepProgress'
import { MemoryRouter } from 'react-router-dom'
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

test('le résumé du dépôt : « Lot unique : … » sans « À choisir » ; plusieurs lots : inchangé', async () => {
  const { cartesDepot } = await import('@/lib/depotDossier')
  const docs = [{ type: 'rc' as const, file_size: 1 }]
  const seul = lotUniqueDuDossier({ name: 'AO démo', lots_detectes: [LOT] })
  const carteSeul = cartesDepot(docs, { lots_detectes: [LOT] }, seul).at(-1)
  assert.equal(carteSeul?.libelle, 'Lots détectés')
  assert.equal(carteSeul?.valeur, 'Lot unique')                                     // en grand : deux mots ; la désignation passe en texte normal
  assert.equal(carteSeul?.designation, 'Lot 3 — Menuiseries (démo)')
  assert.equal(carteSeul?.detail, 'La lecture se lance depuis cette page.')
  assert.doesNotMatch(JSON.stringify(carteSeul), /À choisir/)
  const deux = [LOT, { id: 'lot4', nom: 'Lot 4' }]
  const carteDeux = cartesDepot(docs, { lots_detectes: deux }, lotUniqueDuDossier({ name: 'x', lots_detectes: deux })).at(-1)
  assert.deepEqual([carteDeux?.valeur, carteDeux?.detail], ['2', 'À choisir à l’étape suivante.'])
})

test('marché unique : la carte « Lots détectés » existe aussi (aucun lot repéré) : « Lot unique » en grand, l’objet du marché en texte normal', async () => {
  const { cartesDepot } = await import('@/lib/depotDossier')
  const docs = [{ type: 'rc' as const, file_size: 1 }]
  const unique = lotUniqueDuDossier({ name: 'Réhabilitation d’une salle (démo)', lots_detectes: [] })
  const carte = cartesDepot(docs, { lots_detectes: [] }, unique).at(-1)
  assert.deepEqual([carte?.valeur, carte?.designation], ['Lot unique', 'Réhabilitation d’une salle (démo)'])
  assert.equal(cartesDepot(docs, { lots_detectes: [] }, null).at(-1)?.libelle, 'À classer')      // pas de lot unique, pas de lot : pas de carte
})

const filLots = (lotUnique: Parameters<typeof StepProgress>[0]['lotUnique'], courant = 2, completes: Record<string, boolean> = { '1': true }) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/projects/p1/upload']}><StepProgress currentStep={courant} completedSteps={completes} lotUnique={lotUnique} /></MemoryRouter>)

test('la barre des étapes : un lot unique rend « Lots » fait, avec la coche et « 1 lot » sous le libellé ; le fil garde 7 étapes', () => {
  const html = filLots({ id: 'lot3', designation: 'Lot 3', marcheUnique: false }, 1, { '1': true })
  assert.equal(STEPS.length, 7)
  const boutonLots = html.match(/<button[^>]*aria-label="Lots[^"]*"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.match(boutonLots, /<svg/)                       // la coche (Lucide Check)
  assert.match(boutonLots, />1 lot</)
  assert.equal((html.match(/>1 lot</g) ?? []).length, 1)
  assert.equal((html.match(/<button/g) ?? []).length, 7)
})

test('le marché unique se compte aussi « 1 lot » ; plusieurs lots ou détection pas faite : « Lots » reste à faire', () => {
  assert.match(filLots({ id: null, designation: 'Objet', marcheUnique: true }, 1), />1 lot</)
  const sans = filLots(null, 1)
  assert.doesNotMatch(sans, />1 lot</)
  const boutonLots = sans.match(/<button[^>]*aria-label="Lots"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.doesNotMatch(boutonLots, /<svg/)
  assert.match(boutonLots, />2</)
})

test('Project.tsx passe le lot unique du projet à la barre des étapes', () => {
  const projet = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.match(projet, /lotUnique=\{lotUniqueDuDossier\(project\)\}/)
})

// ── 3/11 : aucun appel IA à la fin du dépôt ─────────────────────────────────────────────────────────────────────

test('l’écran de dépôt demande la lecture des lots SANS IA ; l’écran des lots, lui, ne passe pas le paramètre', () => {
  const lecteur = sansCommentaires(lire('src/hooks/useLotsDuDepot.ts'))
  assert.match(lecteur, /api\.get<[^`]*>\(`\/projects\/\$\{project\.id\}\/lots`, \{ params: \{ sans_ia: 1 \} \}\)/)
  const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.doesNotMatch(lots, /sans_ia/)
  assert.equal((lots.match(/`\/projects\/\$\{project\.id\}\/lots`\)/g) ?? []).length, 2)      // les deux lectures de l’écran des lots : sans paramètre
})

test('le dépôt a sa propre clé de lecture : un résultat « sans IA » n’est jamais servi à l’écran des lots', () => {
  const lecteur = sansCommentaires(lire('src/hooks/useLotsDuDepot.ts'))
  assert.match(lecteur, /queryKey: \['projects', project\.id, 'lots-depot'\]/)
  const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(lots, /queryKey: \['projects', project\.id, 'lots'\]/)
})

test('le filet IA reste à passer (ia_necessaire) : pas de carte « un seul lot », le parcours mène à l’écran des lots', () => {
  const lecteur = sansCommentaires(lire('src/hooks/useLotsDuDepot.ts'))
  assert.match(lecteur, /ia_necessaire/)
  assert.match(lecteur, /data\.iaNecessaire/)
})

test('plafond de lectures assistées atteint : l’écran des lots le dit d’une ligne sobre, sans conseil ni « manquant »', async () => {
  const { phraseLotsEcartes } = await import('@/lib/lotsSource')
  const jour = phraseLotsEcartes({ hors_liste: 0, sans_intitule: 0, ia_plafond: 'jour' })
  assert.match(jour ?? '', /plafond de lectures assistées du jour est atteint/)
  assert.match(jour ?? '', /ajouter un lot à la main/)
  assert.match(phraseLotsEcartes({ ia_plafond: 'mois' }) ?? '', /du mois est atteint/)
  assert.doesNotMatch(jour ?? '', /manquant|incomplet|absent|!/i)
  assert.equal(phraseLotsEcartes({ hors_liste: 0, sans_intitule: 0 }), null)
  assert.match(phraseLotsEcartes({ hors_liste: 2, sans_intitule: 0, ia_plafond: 'jour' }) ?? '', /2 autres lots cités[^]*plafond/)   // les deux phrases se suivent
})

// ── A2 (3/11) : la désignation d'un lot unique n'est plus la valeur en grand de la carte ──
import { BandeResume } from '@/components/etape'
import { cartesDepot } from '@/lib/depotDossier'

const LONGUE = 'Lot 3 — Menuiseries extérieures bois et aluminium, fourniture et pose de fenêtres, portes-fenêtres, volets roulants et occultations (désignation inventée)'
const bande = (designation: string) => renderToStaticMarkup(
  <BandeResume cartes={cartesDepot([{ type: 'rc' as const, file_size: 1 }], { lots_detectes: [{ id: 'lot3', nom: designation }] }, { id: 'lot3', designation, marcheUnique: false })} />)

test('la carte : « Lot unique » en grand, la désignation entière dans le texte, coupée à deux lignes par le style (jamais tronquée dans le texte)', () => {
  const html = bande(LONGUE)
  assert.match(html, /<p class="[^"]*font-display[^"]*">Lot unique<\/p>/)
  assert.ok(html.includes(LONGUE), 'le texte complet reste dans la page (lecteur d’écran, copie, impression)')
  assert.match(html, /line-clamp-2/)
  assert.doesNotMatch(html, /…|\.\.\./)
  assert.match(html, /La lecture se lance depuis cette page\./)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('la désignation est en texte normal de carte (text-sm), pas en grand ; le survol donne le texte complet', () => {
  const html = bande(LONGUE)
  const ligne = html.match(/<[a-z]+ [^>]*line-clamp-2[^>]*>/)?.[0] ?? ''
  assert.match(html, /text-sm/)
  assert.doesNotMatch(ligne, /font-display|text-h6/)
  assert.match(html, /title="Lot 3 — Menuiseries extérieures[^"]*\(désignation inventée\)"/)
})

test('au toucher : la ligne se déplie (aria-expanded), cible de 44 px sous pointer:coarse, cue décoratif masqué au lecteur d’écran', () => {
  const code = sansCommentaires(lire('src/components/etape/BandeResume.tsx'))
  assert.match(code, /aria-expanded=\{ouvert\}/)
  assert.match(code, /\[@media\(pointer:coarse\)\]:min-h-11/)
  assert.match(code, /aria-hidden="true"/)
  assert.match(code, /ResizeObserver/)              // la coupure est mesurée : pas de bouton sur une désignation courte
})
