// B4 — le fil des étapes à sept entrées, les cartes de l'écran Rédiger, et ce que montre l'écran Plan.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { StepProgress, STEPS, segmentDeEtape } from '@/components/project/StepProgress'
import { cartesPreparation, cartesRedaction, pagesEstimees } from '@/routes/project/StepMemoire'
import PartiePlanCarte from '@/components/plan/PartiePlanCarte'
import FichePartie from '@/components/plan/FichePartie'
import PartiesHabituelles from '@/components/plan/PartiesHabituelles'
import { demandePar } from '@/components/plan/demandePar'
import type { MemoireContent } from '@/types'
import type { PartiePlan, VuePlan } from '@/lib/planMemoire'
import { lire } from './outils/sources'

const fil = (chemin: string, courant: number, onStepClick = () => {}) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[chemin]}><StepProgress currentStep={courant} completedSteps={{ '4': true }} onStepClick={onStepClick} /></MemoryRouter>)

test('le fil compte sept étapes : Dépôt, Lots, Décider, Pièces, Plan, Rédiger, Export', () => {
  assert.deepEqual(STEPS.map((s) => s.label), ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'])
  assert.deepEqual(STEPS.map((s) => s.segment), ['upload', 'lots', 'analysis', 'verification', 'plan', 'memoire', 'export'])
  assert.equal(segmentDeEtape(5), 'plan')
  assert.equal(segmentDeEtape(7), 'export')
})

test('le numéro d’étape du serveur ne change pas : Plan et Rédiger se rangent derrière la 5, Export derrière la 6', () => {
  assert.deepEqual(STEPS.map((s) => s.serveur), [1, 2, 3, 4, 5, 5, 6])
})

test('serveur à l’étape 5 : Plan et Rédiger sont accessibles, Export non', () => {
  const html = fil('/projects/p1/plan', 5)
  const boutons = html.match(/<button[^>]*>/g) ?? []
  assert.equal(boutons.length, 7)
  const desactives = boutons.map((b) => /disabled=""/.test(b))
  assert.deepEqual(desactives, [false, false, false, false, false, false, true])
  assert.match(html, /aria-current="step"[^>]*aria-label="Plan"|aria-label="Plan"[^>]*aria-current="step"/)
})

test('serveur à l’étape 6 : Export est accessible, et Plan et Rédiger sont faits', () => {
  const html = fil('/projects/p1/export', 6)
  assert.doesNotMatch(html, /disabled=""/)
})

test('cartes de préparation : plan validé ou non, poids dans la note, une unité d’abonnement, aucun euro', () => {
  const plan = { resume: { parties: 22 }, valide: true } as unknown as VuePlan
  const c = cartesPreparation(plan, 60)
  assert.equal(c[0].valeur, '22 parties')
  assert.equal(c[0].etat, 'pret')
  assert.equal(cartesPreparation({ ...plan, valide: false } as VuePlan, 60)[0].etat, 'a-verifier')
  assert.equal(cartesPreparation(null, 0)[0].valeur, 'Plan du modèle')
  assert.equal(c[1].valeur, '60 %')
  assert.equal(c[2].valeur, '1 unité')
  assert.doesNotMatch(JSON.stringify(c), /€|euro/i)
})

test('cartes du mémoire rédigé : critères traités, parties à refaire, longueur face à la limite', () => {
  const rattachement = { sous_criteres: [{ traite: true }, { traite: false }], a_couvrir: [] } as never
  const c = cartesRedaction({ version: 2, completionPct: 96, rattachement, nbARefaire: 1, pages: 24, limite: 20 })
  assert.equal(c[1].valeur, '1 sur 2')
  assert.equal(c[1].etat, 'a-verifier')
  assert.equal(c[2].valeur, '1')
  assert.equal(c[3].etat, 'a-verifier')
  assert.equal(cartesRedaction({ version: 1, completionPct: 100, rattachement: undefined, nbARefaire: 0, pages: 18, limite: 20 })[3].etat, 'pret')
  assert.doesNotMatch(JSON.stringify(c), /€|euro/i)
})

test('pages estimées : environ 500 mots par page', () => {
  const contenu = { preambule: 'mot '.repeat(1000), partie_a: { x: 'mot '.repeat(1000) }, partie_b: {}, partie_c: {} } as unknown as MemoireContent
  assert.equal(pagesEstimees(contenu), 4)
  assert.equal(pagesEstimees(null), 0)
})

const partie = (extra: Partial<PartiePlan> = {}): PartiePlan => ({
  cle: 'partie_b.dechets', partie: 'partie_b', titre: 'Traitement des déchets', titre_modele: 'Traitement des déchets',
  retiree: false, attendue: null, fiche: { references: null, personnes: null, materiel: null, voulu: '' },
  sous_criteres: [{ critere: 'Valeur technique', nom: 'Gestion des déchets', poids: 30 }],
  attendues: [{ id: 'att_1234567890', libelle: 'Gestion des déchets', source: { document: 'RC.pdf', page: 7 } }],
  source: { document: 'RC.pdf', page: 7 },
  exigences: [{ id: 'e1', texte: 'Les déchets sont triés.', source: { type: 'exigence', id: 'e1', document: 'CCTP.pdf', page: 14 } }],
  propose: { references: [{ id: 'r1', libelle: 'ITE d’une école', detail: 'Ville X · 2024', coche: true }], personnes: [], materiel: [] },
  ...extra,
})
const rendre = (p: PartiePlan, ouverte = false) => renderToStaticMarkup(
  <PartiePlanCarte
    partie={p} numero={6} ouverte={ouverte} peutMonter peutDescendre seulementGardee={false}
    onBasculerFiche={() => {}} onRenommer={() => {}} onRetirer={() => {}} onSupprimer={() => {}} onMonter={() => {}}
    onDescendre={() => {}} onFiche={() => {}} onVoirSource={() => {}}
  />)

test('une partie : titre modifiable, sous-critères avec poids, source annoncée par le dossier, gestes nommés', () => {
  const html = rendre(partie())
  assert.match(html, /value="Traitement des déchets"/)
  assert.match(html, /Gestion des déchets · 30 %/)
  assert.match(html, /Demandé par le règlement de la consultation/)
  assert.match(html, /Source : RC\.pdf · page 7/)
  assert.match(html, /Voir dans le dossier/)
  // les gestes de la rangée : un menu « … » nommé, dont chaque élément est écrit en mots (plus trois icônes muettes)
  assert.match(html, /aria-label="Actions : Traitement des déchets"/)
  const code = lire('src/components/plan/PartiePlanCarte.tsx')
  for (const geste of ['Renommer', 'Monter', 'Descendre', 'Retirer du plan', 'Supprimer']) assert.ok(code.includes(geste), geste)
  assert.doesNotMatch(code, /<button\b/)
  assert.match(html, /aria-expanded="false"/)
})

test('une partie gardée dit pourquoi : sous-critère et poids, ou demandée par le dossier avec sa source, sinon partie habituelle', () => {
  assert.match(rendre(partie({ attendues: [], source: null })), /Gestion des déchets · 30 %/)
  const cctp = rendre(partie({ sous_criteres: [], attendues: [{ id: 'a', libelle: 'x', source: { document: '2-CCTP lot 5.pdf', page: 12 } }] }))
  assert.match(cctp, /Demandé par le cahier des clauses techniques \(CCTP\)/)
  assert.match(cctp, /Voir dans le dossier/)
  assert.match(rendre(partie({ sous_criteres: [], attendues: [] })), /Partie habituelle du mémoire/)
  assert.equal(demandePar({ document: 'document.pdf' }), 'Demandé par le dossier')
})

test('la section des parties habituelles : décochées, regroupées, un geste nommé pour chacune, rien quand il n’y en a pas', () => {
  const vide = renderToStaticMarkup(<PartiesHabituelles parties={[]} onAjouter={() => {}} />)
  assert.equal(vide, '')
  const html = renderToStaticMarkup(
    <PartiesHabituelles
      parties={[partie({ cle: 'partie_a.historique', partie: 'partie_a', titre: 'Historique', retiree: true, sous_criteres: [], attendues: [] }),
        partie({ cle: 'partie_c.delai', partie: 'partie_c', titre: 'Délai de travaux', retiree: true, sous_criteres: [], attendues: [] })]}
      onAjouter={() => {}}
    />)
  assert.match(html, /Parties habituelles, à ajouter si utile/)
  assert.doesNotMatch(html, /PARTIES HABITUELLES/)
  assert.match(html, /aria-label="Ajouter au plan : Historique"/)
  assert.match(html, /aria-label="Ajouter au plan : Délai de travaux"/)
  assert.match(html, /Partie A/)
  assert.match(html, /Partie C/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('une partie ajoutée se supprime, une partie du modèle se retire', () => {
  const code = lire('src/components/plan/PartiePlanCarte.tsx')
  assert.match(code, /onSelect=\{ajout \? onSupprimer : onRetirer\}/)
  assert.match(code, /\{ajout \? 'Supprimer' : 'Retirer du plan'\}/)
})

test('la fiche dépliée : exigences avec source, cases préremplies, ligne libre bornée à 1 000 caractères', () => {
  const html = rendre(partie(), true)
  assert.match(html, /data-fiche-partie="partie_b\.dechets"/)
  assert.match(html, /Les déchets sont triés\./)
  assert.match(html, /CCTP\.pdf · page 14/)
  assert.match(html, /Voir dans le dossier/)
  assert.match(html, /role="checkbox"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="checkbox"/)
  assert.match(html, /Ce que vous voulez dire/)
  assert.match(html, /maxLength="1000"/)
  assert.match(html, /jamais comme une consigne/)
})

test('la fiche sans rien : des phrases positives, aucun mot interdit', () => {
  const html = renderToStaticMarkup(
    <FichePartie partie={partie({ exigences: [], sous_criteres: [], propose: { references: [], personnes: [], materiel: [] } })} onChange={() => {}} onVoirSource={() => {}} />)
  assert.match(html, /Aucune exigence/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

// G8 (recette du 4/11) — « 1 unité » et « offre illimitée : non décompté » s'affichaient ensemble ; « environ 15 minutes »
// pour un mémoire mesuré à 169 s. Une seule phrase de coût selon l'offre ; durée mesurée.
import { ligneQuotaMemoire, DUREE_REDACTION } from '@/components/project/MemoirePreflight'

test('G8 : la carte Abonnement dit l’unité, pour toutes les offres (11/11/2026) ; la ligne du bouton ne parle plus de coût', () => {
  assert.equal(cartesPreparation(null, 0)[2].valeur, '1 unité')
  assert.doesNotMatch(JSON.stringify(cartesPreparation(null, 0)), /illimit/i)
  assert.match(ligneQuotaMemoire('business', { used: 5, limit: 70 }), /^5 sur 70 mémoires utilisés ce mois · Rédaction : environ 3 minutes$/)
  assert.match(ligneQuotaMemoire('pro', { used: 3, limit: 30 }), /^3 sur 30 mémoires utilisés ce mois · Rédaction : environ 3 minutes$/)
  assert.match(ligneQuotaMemoire('free', { used: 0, limit: 1 }), /sur votre essai/)
  assert.match(DUREE_REDACTION, /3 minutes/)
})

test('comptes uniques : la carte « Rédaction » dit la phrase de l’Export, avec le compte du serveur ; sans compte, la version', () => {
  const base = { version: 2, completionPct: 100, rattachement: undefined, nbARefaire: 0, pages: 46, limite: null }
  const avec = cartesRedaction({ ...base, passages: 136 })[0]
  assert.equal(avec.detail, '136 passages à compléter avant le dépôt')
  assert.equal(avec.etat, 'a-verifier')
  for (const passages of [0, null, undefined]) {
    const sans = cartesRedaction({ ...base, passages })[0]
    assert.equal(sans.detail, 'Version 2')
    assert.equal(sans.etat, undefined)
  }
  // une seule source : la lecture de l'Export, sous la même clé de cache ; l'enregistrement du texte la rafraîchit
  const code = lire('src/routes/project/StepMemoire.tsx')
  assert.match(code, /queryKey: \['export-detail', project\.id\],\s*queryFn: [^\n]*\/export\/detail/)
  assert.equal((code.match(/invalidateQueries\(\{ queryKey: \['export-detail', project\.id\] \}\)/g) ?? []).length, 2)
})
