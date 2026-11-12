// Mon entreprise, T1 — le visage de Synorix à la place du cerveau : la machine à états des quatre clips (pilotée par une
// fausse horloge), le mouvement réduit, le balisage (mp4 avant webm, pas de boucle), les six bulles depuis des données
// inventées, les fils et leur cadence, les fichiers servis. Le rendu réel (fondu, images/s, chargement) est mesuré dans
// Chromium, hors npm test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SceneVisage from '@/components/entreprise/SceneVisage'
import VisageAnime from '@/components/entreprise/VisageAnime'
import Company from '@/routes/Company'
import { useAuthStore } from '@/stores/authStore'
import {
  CLIP, DEMARRAGE_MAX_MS, DIMENSIONS_VISAGE, FONDU_MS, INACTIVITE_MS, PAUSE_APRES_FONDU_MS, POSTER_FERME, POSTER_OUVERT, REOUVERTURE_MS, REPOS_MAX_MS, REPOS_MIN_MS,
  creerMachineVisage, delaiRepos, doitJouer, sourcesClip, type ClipId, type IssueClip,
} from '@/lib/entreprise/visage'
import {
  IMAGES_ORDINATEUR, IMAGES_TACTILE, boucleDoitTourner, courbe, creerParticules, faireRegulateur, hexAlpha, hexVersRvb, imagesParSeconde, opaciteParticule, pointSurCourbe, positionParticule,
} from '@/lib/entreprise/fils'
import { A_RENSEIGNER, construireBulles, dateFr, euros, faitsCles, villeDepuisAdresse } from '@/lib/entreprise/synthese'
import { avancementTotal, type DonneesEntreprise } from '@/lib/entreprise/avancement'
import { voixSynorix } from '@/lib/entreprise/voix'
import { RACINE, lire, sansCommentaires } from './outils/sources'

/* ── une fausse horloge pour la machine ─────────────────────────── */

const vider = () => new Promise<void>((r) => setImmediate(r))

function banc(alea = 0) {
  let t = 0
  let numero = 0
  const minuteries = new Map<number, { a: number; fn: () => void }>()
  const joues: ClipId[] = []
  const attentes: Array<(i: IssueClip) => void> = []
  const compteurs = { pauses: 0, echecs: 0 }
  const machine = creerMachineVisage({
    jouer: (clip) => { joues.push(clip); return new Promise<IssueClip>((res) => attentes.push(res)) },
    pauser: () => { compteurs.pauses++ },
    surEchec: () => { compteurs.echecs++ },
    poserMinuterie: (fn, d) => { const id = ++numero; minuteries.set(id, { a: t + d, fn }); return id },
    annulerMinuterie: (id) => { minuteries.delete(id as number) },
    maintenant: () => t,
    alea: () => alea,
  })
  return {
    machine, joues, compteurs,
    get t() { return t },
    /** Fait avancer l'horloge de `ms`, en déclenchant les minuteries dans l'ordre. */
    async avancer(ms: number) {
      const fin = t + ms
      for (;;) {
        const prochaine = [...minuteries.entries()].filter(([, m]) => m.a <= fin).sort((x, y) => x[1].a - y[1].a || x[0] - y[0])[0]
        if (!prochaine) break
        minuteries.delete(prochaine[0])
        t = Math.max(t, prochaine[1].a)
        prochaine[1].fn()
        await vider()
      }
      t = fin
    },
    /** Avance par pas d'une demi-seconde en terminant chaque clip dès qu'il est lancé. */
    async passer(ms: number) {
      for (let fait = 0; fait < ms; fait += 500) {
        await this.avancer(500)
        while (attentes.length) await this.finir()
      }
    },
    /** Le clip en cours se termine (ou échoue). */
    async finir(issue: IssueClip = 'fini') { const r = attentes.pop(); assert.ok(r, 'aucun clip en cours'); r(issue); await vider() },
    get enAttente() { return attentes.length },
  }
}

test('machine : à l’arrivée, le clip 1 (il ouvre les yeux), puis plus rien ne joue avant 7 s', async () => {
  const b = banc()
  b.machine.reprendre()
  await vider()
  assert.deepEqual(b.joues, [1])
  assert.equal(b.machine.etat().yeux, 'fermes', 'les yeux ne sont ouverts qu’à la fin du clip')
  await b.finir()
  assert.equal(b.machine.etat().yeux, 'ouverts')
  await b.avancer(REPOS_MIN_MS - 1)
  assert.deepEqual(b.joues, [1])
})

test('machine : au repos, le clip 2 (neurones) revient toutes les 7 à 12 s, jamais en boucle', async () => {
  const bas = banc(0)
  bas.machine.reprendre(); await vider(); await bas.finir()
  await bas.avancer(REPOS_MIN_MS)
  assert.deepEqual(bas.joues, [1, 2], 'alea 0 : à 7 s')
  const haut = banc(0.999999)
  haut.machine.reprendre(); await vider(); await haut.finir()
  await haut.avancer(REPOS_MAX_MS - 1)
  assert.deepEqual(haut.joues, [1], 'pas avant 12 s')
  await haut.avancer(1)
  assert.deepEqual(haut.joues, [1, 2])
  assert.equal(delaiRepos(0), REPOS_MIN_MS)
  assert.equal(delaiRepos(1), REPOS_MAX_MS)
  assert.ok(delaiRepos(0.5) > REPOS_MIN_MS && delaiRepos(0.5) < REPOS_MAX_MS)
  assert.equal(delaiRepos(-3), REPOS_MIN_MS, 'borné')
  assert.equal(delaiRepos(9), REPOS_MAX_MS, 'borné')
  // un clip terminé, le suivant ne démarre qu'après un nouveau délai
  await haut.finir()
  await haut.avancer(REPOS_MAX_MS - 1)
  assert.deepEqual(haut.joues, [1, 2])
})

test('machine : une interaction joue le clip 3 (éclair) ; un clip déjà en cours le fait attendre', async () => {
  const b = banc()
  b.machine.reprendre(); await vider(); await b.finir()
  b.machine.interagir(); await vider()
  assert.deepEqual(b.joues, [1, 3], 'yeux ouverts : l’éclair directement')
  await b.finir()
  // pendant un clip de repos, l'éclair est mis en attente puis joué à la fin
  await b.avancer(REPOS_MIN_MS)
  assert.deepEqual(b.joues, [1, 3, 2])
  b.machine.interagir(); await vider()
  assert.deepEqual(b.joues, [1, 3, 2], 'pas de clip en parallèle')
  await b.finir()
  assert.deepEqual(b.joues, [1, 3, 2, 3])
})

test('machine : 30 s sans interaction → clip 4 (il ferme les yeux), puis clip 1 à 2,5 s', async () => {
  const b = banc(0.999999) // neurones à 12 s et 24 s
  b.machine.reprendre(); await vider(); await b.finir()
  await b.avancer(12000); await b.finir() // clip 2
  await b.avancer(12000); await b.finir() // clip 2
  assert.deepEqual(b.joues, [1, 2, 2])
  await b.avancer(INACTIVITE_MS - 24000)
  assert.deepEqual(b.joues, [1, 2, 2, 4], 'à 30 s')
  await b.finir()
  assert.equal(b.machine.etat().yeux, 'fermes')
  await b.avancer(REOUVERTURE_MS - 1)
  assert.equal(b.joues.at(-1), 4)
  await b.avancer(1)
  assert.deepEqual(b.joues.slice(-2), [4, 1], 'le clip 1 rouvre les yeux 2,5 s plus tard')
  await b.finir()
  assert.equal(b.machine.etat().yeux, 'ouverts')
})

test('machine : un geste repousse la fermeture des yeux ; une interaction yeux fermés rouvre d’abord les yeux', async () => {
  const b = banc(0.999999)
  b.machine.reprendre(); await vider(); await b.finir()
  await b.passer(20000)
  b.machine.activite()
  await b.passer(25000) // 45 s depuis l'arrivée, mais 25 s seulement depuis le geste
  assert.ok(!b.joues.includes(4), 'pas de clip 4')
  for (let i = 0; i < 40 && b.joues.at(-1) !== 4; i++) { await b.avancer(500); if (b.joues.at(-1) !== 4) while (b.enAttente) await b.finir() }
  assert.equal(b.joues.at(-1), 4, 'le clip 4 vient 30 s après le geste')
  assert.ok(b.t >= 49000 && b.t <= 51000, `à ${b.t} ms`)
  await b.finir()
  b.machine.interagir(); await vider()
  assert.deepEqual(b.joues.slice(-1), [1], 'yeux fermés : clip 1 d’abord')
  await b.finir()
  assert.deepEqual(b.joues.slice(-2), [1, 3], 'puis l’éclair')
})

test('machine : caché ou hors écran → pause, plus aucune minuterie, plus aucun clip ; au retour, reprise', async () => {
  const b = banc()
  b.machine.reprendre(); await vider(); await b.finir()
  b.machine.suspendre()
  assert.equal(b.compteurs.pauses, 1)
  await b.avancer(10 * 60 * 1000)
  assert.deepEqual(b.joues, [1], 'rien ne joue en arrière-plan')
  b.machine.interagir(); await vider()
  assert.deepEqual(b.joues, [1], 'ni sur une interaction')
  b.machine.reprendre(); await vider()
  assert.deepEqual(b.joues, [1], 'yeux ouverts : pas de nouvelle ouverture')
  await b.avancer(REPOS_MIN_MS)
  assert.deepEqual(b.joues, [1, 2], 'le repos reprend')
  // suspendu pendant l'ouverture des yeux : au retour, le clip 1 est rejoué
  const c = banc()
  c.machine.reprendre(); await vider()
  c.machine.suspendre()
  await c.finir() // la fin tardive du clip interrompu est ignorée
  assert.equal(c.machine.etat().yeux, 'fermes')
  c.machine.reprendre(); await vider()
  assert.deepEqual(c.joues, [1, 1])
})

test('machine : une vidéo qui ne peut pas être lue arrête tout (le poster yeux ouverts prend le relais)', async () => {
  const b = banc()
  b.machine.reprendre(); await vider()
  await b.finir('echec')
  assert.equal(b.compteurs.echecs, 1)
  assert.equal(b.machine.etat().arrete, true)
  await b.avancer(120000)
  b.machine.interagir(); await vider()
  b.machine.suspendre(); b.machine.reprendre(); await vider()
  assert.deepEqual(b.joues, [1])
})

test('conditions de lecture : mouvement réduit, hors écran et onglet caché coupent tout', () => {
  const ok = { mouvementReduit: false, aLEcran: true, ongletVisible: true }
  assert.equal(doitJouer(ok), true)
  assert.equal(doitJouer({ ...ok, mouvementReduit: true }), false)
  assert.equal(doitJouer({ ...ok, aLEcran: false }), false)
  assert.equal(doitJouer({ ...ok, ongletVisible: false }), false)
  assert.equal(FONDU_MS, 280)
  assert.equal(PAUSE_APRES_FONDU_MS, 320)
  assert.ok(DEMARRAGE_MAX_MS >= 5000)
  assert.deepEqual(DIMENSIONS_VISAGE, { ordinateur: { largeur: 300, hauteur: 420 }, telephone: { largeur: 240, hauteur: 336 } })
})

/* ── le balisage ─────────────────────────────────────────────────── */

/** Rend avec un `window` simulé : `large` = écran de bureau, `reduit` = mouvement réduit, `tactile` = écran tactile. */
function rendre(el: React.ReactElement, { large = false, reduit = false, tactile = false } = {}): string {
  const g = globalThis as unknown as { window?: unknown }
  const avant = g.window
  g.window = {
    matchMedia: (q: string) => ({
      matches: (large && q.includes('min-width : 1024px')) || (reduit && q.includes('prefers-reduced-motion')) || (tactile && q.includes('pointer : coarse')),
      addEventListener() {}, removeEventListener() {},
    }),
  }
  try { return renderToStaticMarkup(el) } finally { g.window = avant }
}

test('sources : mp4 d’abord, webm ensuite, quatre clips', () => {
  for (const n of [1, 2, 3, 4] as const) {
    const s = sourcesClip(n)
    assert.deepEqual(s.map((x) => x.type), ['video/mp4', 'video/webm'])
    assert.deepEqual(s.map((x) => x.src), [`/visage/visage-${n}.mp4`, `/visage/visage-${n}.webm`])
  }
  assert.deepEqual(CLIP, { ouvre: 1, neurones: 2, eclair: 3, ferme: 4 })
})

test('rendu serveur : poster yeux fermés, deux vidéos muettes sans boucle, clip 1 préchargé (mp4 avant webm), les autres à la demande', () => {
  const html = rendre(<VisageAnime actif={false} />)
  assert.ok(html.includes(`src="${POSTER_FERME}"`))
  assert.equal((html.match(/<video/g) ?? []).length, 2)
  assert.ok(!/\bloop\b/.test(html), 'jamais de boucle')
  assert.ok(html.indexOf('visage-1.mp4') > 0 && html.indexOf('visage-1.mp4') < html.indexOf('visage-1.webm'), 'mp4 avant webm')
  assert.ok(!/visage-[234]\./.test(html), 'les clips 2, 3 et 4 ne sont pas dans le balisage : chargés quand ils sont joués')
  assert.match(html, /<video[^>]*preload="auto"/)
  assert.match(html, /<video[^>]*preload="none"/)
  assert.ok(html.includes('aria-hidden="true"') && html.includes('alt="Le visage de Synorix"'))
  assert.match(html, /mix-blend-screen/, 'nuit : mélange écran')
})

test('mouvement réduit : le poster yeux ouverts seul, aucune <video>', () => {
  const html = rendre(<VisageAnime actif />, { reduit: true })
  assert.ok(html.includes(`src="${POSTER_OUVERT}"`))
  assert.ok(!html.includes('<video'), 'aucune vidéo')
  assert.ok(!html.includes('visage-1.') && !html.includes(POSTER_FERME))
  const scene = rendre(<MemoryRouter><SceneVisage donnees={DONNEES} onChoisir={() => {}} /></MemoryRouter>, { reduit: true, large: true })
  assert.ok(!scene.includes('<video'))
})

/* ── les bulles ──────────────────────────────────────────────────── */

const DONNEES: DonneesEntreprise = {
  organisation: { id: 'o1', name: 'Façades de démonstration', forme_juridique: 'SAS', siret: '12345678900011', address: '5 rue des Exemples, 51100 Reims', plan: 'pro', created_at: '2026-01-01' },
  profil: {
    effectifs_par_categorie: [{ categorie: 'chef_equipe', specialite: 'Enduit', effectif: 4 }, { categorie: 'ouvrier', specialite: null, effectif: 10 }],
    vehicules_liste: [{ quantite: 3, designation: 'Fourgon' }, { quantite: 1, designation: 'Camion benne' }],
    materiel_liste: [{ quantite: 700, designation: 'Échafaudage de façade', unite: 'm²' }, { quantite: 2, designation: 'Machine à projeter' }],
    gerant_nom: 'Camille Démo', zone_intervention: 'Marne et Aisne',
    chiffre_affaires: [{ annee: '2025', montant: '1 100 000 €' }, { annee: '2024', montant: '980 000 €' }, { annee: '2023', montant: '' }],
    gestion_securite: 'PPSPS à chaque chantier',
  },
  equipe: [],
  references: [
    { id: 'r1', intitule: 'École (exemple)', maitre_ouvrage: 'Commune fictive', montant_ht: 180000, annee: 2025, client_type: 'public' },
    { id: 'r2', intitule: 'Gymnase (exemple)', maitre_ouvrage: 'Communauté inventée', montant_ht: 240000.4, annee: 2024 },
    { id: 'r3', intitule: 'Extension (exemple)', maitre_ouvrage: 'Mme Dubois', montant_ht: 90000, annee: 2024, client_type: 'particulier' },
  ],
  documents: [{ type: 'kbis', status: 'valid' }],
  qualifications: [
    { id: 'q1', famille: 'qualification', intitule: 'Qualibat 7132', date_fin: '2027-06-30' },
    { id: 'q2', famille: 'rge', intitule: 'RGE', date_fin: '2026-12-31' },
    { id: 'q3', famille: 'assurance', intitule: 'Décennale', date_fin: '2026-12-31' },
    { id: 'q4', famille: 'assurance', intitule: 'Responsabilité civile professionnelle', date_fin: '2027-03-01' },
  ],
}
const JOUR = new Date(2026, 10, 1)

test('six bulles : trois à gauche, trois à droite, le contenu vient du profil', () => {
  const b = construireBulles(DONNEES, JOUR)
  assert.deepEqual(b.map((x) => x.id), ['identite', 'effectif', 'moyens', 'qualifications', 'references', 'assurances'])
  assert.deepEqual(b.map((x) => x.cote), ['gauche', 'gauche', 'gauche', 'droite', 'droite', 'droite'])
  const par = Object.fromEntries(b.map((x) => [x.id, x]))
  assert.equal(par.identite.valeur, 'Façades de démonstration · SAS')
  assert.equal(par.identite.detail, 'SIRET renseigné · Reims (51)')
  assert.equal(par.effectif.valeur, '14 salariés')
  assert.equal(par.effectif.detail, '4 chefs d’équipe')
  assert.equal(par.moyens.valeur, '4 véhicules · 700 m² d’échafaudage')
  assert.equal(par.moyens.detail, '2 machine à projeter')
  assert.equal(par.qualifications.valeur, 'Qualibat 7132 · RGE')
  assert.equal(par.qualifications.detail, 'Prochaine échéance : 31/12/2026')
  assert.match(par.references.valeur, /^3 chantiers · 510.000.€.HT$/)
  assert.equal(par.references.detail, 'Commune fictive · Communauté inventée', 'un client particulier ne se nomme pas')
  assert.equal(par.assurances.valeur, 'Décennale · Responsabilité civile')
  assert.equal(par.assurances.detail, 'Valables jusqu’au 31/12/2026')
  assert.ok(b.every((x) => x.renseignee))
  for (const x of b) assert.ok(x.ancre.x > 0 && x.ancre.x < 1 && x.ancre.y > 0 && x.ancre.y < 1)
  assert.deepEqual(b.map((x) => x.rubrique), ['identite', 'moyens', 'moyens', 'certifications', 'certifications', 'certifications'])
})

test('six bulles, profil vide : « À renseigner », jamais « manquant »', () => {
  const b = construireBulles({}, JOUR)
  assert.equal(b.length, 6)
  for (const x of b) {
    assert.equal(x.valeur, A_RENSEIGNER, x.id)
    assert.equal(x.renseignee, false)
    assert.ok(!/manquant|incomplet|absent/i.test(`${x.libelle} ${x.valeur} ${x.detail}`), x.id)
  }
  assert.equal(b[0].detail, 'SIRET à renseigner')
  // les textes sont aussi positifs avec des données partielles
  const part = construireBulles({ organisation: { ...DONNEES.organisation!, siret: undefined, address: undefined }, qualifications: [{ famille: 'qualification', intitule: 'Qualibat', date_fin: '2026-01-15' }] }, JOUR)
  assert.equal(part[0].detail, 'SIRET à renseigner')
  assert.equal(part[3].detail, 'À renouveler (échue le 15/01/2026)')
})

test('synthèse : ville, dates et montants', () => {
  assert.equal(villeDepuisAdresse('12 rue des Exemples, 14000 Caen'), 'Caen (14)')
  assert.equal(villeDepuisAdresse('1 rue X, 97400 Saint-Denis'), 'Saint-Denis (974)')
  assert.equal(villeDepuisAdresse('sans code postal'), '')
  assert.equal(villeDepuisAdresse(undefined), '')
  assert.equal(dateFr('2027-06-30'), '30/06/2027')
  assert.equal(dateFr(null), '')
  assert.match(euros(709941), /^709.941.€.HT$/)
})

test('faits clés : quatre par rubrique, « null » = à renseigner', () => {
  for (const r of ['identite', 'moyens', 'certifications'] as const) {
    assert.equal(faitsCles(DONNEES, r).length, 4)
    assert.equal(faitsCles({}, r).length, 4)
    assert.ok(faitsCles({}, r).every((f) => f.valeur === null), `${r} : tout est à renseigner sur un profil vide`)
  }
  assert.deepEqual(faitsCles(DONNEES, 'identite').map((f) => f.valeur), ['Façades de démonstration · SAS', 'Renseigné', 'Camille Démo', 'Marne et Aisne'])
  assert.deepEqual(faitsCles(DONNEES, 'moyens').map((f) => f.valeur), ['14 salariés', '4', '4', 'Renseignée'])
  assert.equal(faitsCles(DONNEES, 'certifications')[3].valeur, '2 exercices')
})

test('scène (rendu serveur) : le visage, une fois, à côté de la phrase de Synorix ; plus de bulles ni de fils autour', () => {
  const rendu = (opts: Parameters<typeof rendre>[1]) => rendre(<SceneVisage donnees={DONNEES} onChoisir={() => {}}><i>rubriques</i></SceneVisage>, opts)
  const voix = voixSynorix(DONNEES)
  for (const html of [rendu({ large: true }), rendu({})]) {
    assert.equal((html.match(/data-visage=""/g) ?? []).length, 1, 'le visage, une fois')
    assert.equal((html.match(/data-voix-synorix=""/g) ?? []).length, 1, 'une phrase de Synorix')
    assert.ok(html.includes(voix.phrase))
    assert.ok(!html.includes('data-bulle') && !html.includes('<canvas') && !html.includes('data-fils'), 'ni bulles ni fils')
    assert.ok(!/À renseigner|text-ambre-ink/.test(html), 'aucun ambre dans la scène')
    assert.ok(!/manquant|incomplet|absent/i.test(html))
    assert.match(html, /<div data-plan-visage=""><div data-visage/, 'le visage dans son calque de parallaxe')
    assert.ok(html.indexOf('data-visage') < html.indexOf('data-voix-synorix') && html.indexOf('data-voix-synorix') < html.indexOf('<i>rubriques</i>'), 'visage, phrase, rubriques')
    assert.match(html, /lg:grid-cols-\[300px_minmax\(0,1fr\)\]/, 'ordinateur : le visage à sa taille, la phrase à côté ; téléphone : l’un sous l’autre')
  }
  // la prochaine information utile ouvre sa rubrique (un lien du système)
  assert.ok(voix.prochaine, 'les données de démonstration laissent une information à renseigner')
  assert.match(rendu({ large: true }), /Prochaine information utile\s: «\s[^»]+\s»\.[\s\S]*?<button[^>]*>La renseigner<span/)
})

test('la phrase de Synorix : ce qu’il sait (décompte des rubriques), puis la première information indispensable encore à renseigner', () => {
  const { rempli, total } = avancementTotal(DONNEES)
  const voix = voixSynorix(DONNEES)
  assert.equal(voix.phrase, `Synorix connaît ${rempli} des ${total} informations que vos dossiers demandent le plus souvent.`)
  assert.ok(voix.prochaine && ['identite', 'moyens', 'certifications'].includes(voix.prochaine.rubrique) && voix.prochaine.titreRubrique.length > 0)
  const vide = voixSynorix({})
  assert.match(vide.phrase, /^Synorix ne sait encore rien de votre entreprise\./)
  assert.deepEqual(vide.prochaine, { libelle: 'Nom de l’entreprise', rubrique: 'identite', titreRubrique: 'Identité' })
  const une = voixSynorix({ organisation: { name: 'Entreprise inventée' } as never })
  assert.match(une.phrase, /^Synorix connaît 1 des \d+ informations/)
  for (const v of [voix, vide, une]) assert.ok(!/!|manquant|incomplet|absent/i.test(v.phrase))
})

/* ── les fils ────────────────────────────────────────────────────── */

test('fils : courbe, particules et cadence', () => {
  const c = courbe({ x: 0, y: 0 }, { x: 100, y: 50 })
  assert.deepEqual(pointSurCourbe(c, 0), { x: 0, y: 0 })
  assert.deepEqual(pointSurCourbe(c, 1), { x: 100, y: 50 })
  const milieu = pointSurCourbe(c, 0.5)
  assert.ok(milieu.x > 0 && milieu.x < 100 && milieu.y > 0 && milieu.y < 50)
  const p = creerParticules(2)
  assert.equal(p.length, 3, 'trois particules par fil')
  assert.deepEqual(p.map((x) => x.decalage.toFixed(2)), ['0.00', '0.33', '0.67'])
  assert.ok(p.every((x) => x.vitesse >= 0.05 && x.vitesse <= 0.08))
  assert.equal(positionParticule(p[1], 99999, true), p[1].decalage, 'scène immobile : position fixe')
  const t = positionParticule(p[0], 12345)
  assert.ok(t >= 0 && t < 1)
  assert.ok(opaciteParticule(0.5) > opaciteParticule(0) && opaciteParticule(0) >= 0.25)
  assert.deepEqual(hexVersRvb('#0078d6'), [0, 120, 214])
  assert.deepEqual(hexVersRvb('#07d'), [0, 119, 221])
  assert.equal(hexVersRvb('rgb(1,2,3)'), null)
  assert.equal(hexAlpha([0, 120, 214], 0.5), '#0078d680')
  assert.equal(hexAlpha([0, 120, 214], 1), '#0078d6ff')
  assert.equal(imagesParSeconde(false), IMAGES_ORDINATEUR)
  assert.equal(imagesParSeconde(true), IMAGES_TACTILE)
  assert.deepEqual([IMAGES_ORDINATEUR, IMAGES_TACTILE], [60, 30])
})

/** Nombre d'images calculées pendant `secondes` sur un écran de `hz` hertz. */
function images(ips: number, hz: number, secondes: number): number {
  const regul = faireRegulateur(ips)
  let n = 0
  for (let i = 0; (i * 1000) / hz < secondes * 1000; i++) if (regul((i * 1000) / hz)) n++
  return n
}

test('cadence : 60 images/s sur ordinateur, 30 au téléphone, quelle que soit la fréquence de l’écran', () => {
  for (const hz of [60, 120, 144]) assert.ok(Math.abs(images(60, hz, 10) - 600) <= 12, `60 i/s sur ${hz} Hz`)
  for (const hz of [60, 120]) assert.ok(Math.abs(images(30, hz, 10) - 300) <= 6, `30 i/s sur ${hz} Hz`)
})

test('boucle des fils : ni hors écran, ni onglet caché, ni mouvement réduit', () => {
  const ok = { mouvementReduit: false, aLEcran: true, ongletVisible: true }
  assert.equal(boucleDoitTourner(ok), true)
  assert.equal(boucleDoitTourner({ ...ok, aLEcran: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, ongletVisible: false }), false)
  assert.equal(boucleDoitTourner({ ...ok, mouvementReduit: true }), false)
})

/* ── la page et les fichiers ─────────────────────────────────────── */

test('la page : le visage remplace le cerveau (plus d’image sombre ni d’effets)', () => {
  const client = new QueryClient()
  client.setQueryData(['memoire-config'], DONNEES.profil)
  client.setQueryData(['team'], [])
  client.setQueryData(['references'], DONNEES.references)
  client.setQueryData(['documents'], DONNEES.documents)
  client.setQueryData(['qualifications'], DONNEES.qualifications)
  useAuthStore.setState({ organization: DONNEES.organisation as never })
  const html = rendre(<QueryClientProvider client={client}><MemoryRouter><Company /></MemoryRouter></QueryClientProvider>, { large: true })
  assert.match(html, /<h1[^>]*>Mon entreprise<\/h1>/)
  assert.ok(html.includes('data-visage') && html.includes('data-voix-synorix') && !html.includes('data-fils'))
  assert.equal((html.match(/data-visage=""/g) ?? []).length, 1, 'le visage une seule fois sur l’écran')
  assert.ok(!html.includes('cerveau') && !html.includes('data-cerveau'))
})

test('les clips et les posters sont servis tels que fournis (pas d’autre image ni vidéo)', () => {
  const dossier = path.join(RACINE, 'public/visage')
  const attendus: Record<string, [number, number]> = {
    'visage-1.mp4': [129776, 129776], 'visage-2.mp4': [408480, 408480], 'visage-3.mp4': [113706, 113706], 'visage-4.mp4': [102811, 102811],
    'visage-1.webm': [113187, 113187], 'visage-2.webm': [738055, 738055], 'visage-3.webm': [108106, 108106], 'visage-4.webm': [100763, 100763],
    'poster.webp': [35218, 35218], 'poster-ferme.webp': [33684, 33684],
  }
  for (const [nom, [min, max]] of Object.entries(attendus)) {
    const taille = statSync(path.join(dossier, nom)).size
    assert.ok(taille >= min && taille <= max, `${nom} : ${taille} octets`)
  }
  assert.equal(readFileSync(path.join(dossier, 'poster.webp')).subarray(8, 12).toString('latin1'), 'WEBP')
  assert.equal(readFileSync(path.join(dossier, 'visage-1.mp4')).subarray(4, 8).toString('latin1'), 'ftyp')
  const mp4 = Object.keys(attendus).filter((n) => n.endsWith('.mp4')).reduce((t, n) => t + attendus[n][0], 0)
  assert.ok(mp4 < 800_000, `quatre clips mp4 : ${mp4} octets`)
})

test('sources du visage : jamais de boucle, jamais de son, mix-blend en nuit, mp4 avant webm', () => {
  const code = sansCommentaires(lire('src/components/entreprise/VisageAnime.tsx'))
  assert.doesNotMatch(code, /\bloop\b/)
  assert.match(code, /\bmuted\b/)
  assert.match(code, /playsInline/)
  assert.match(code, /IntersectionObserver|actif/)
  assert.match(sansCommentaires(lire('src/components/entreprise/useVisibilite.ts')), /IntersectionObserver[\s\S]*visibilitychange/)
  assert.match(code, /dark:mix-blend-screen/)
  assert.match(code, /DEMARRAGE_MAX_MS/)
})
