// Dépôt de documents par rubrique (D4) : trois cases pour l'identité et les moyens, deux pour les certifications, chacune avec son
// nom, ce qu'on y met et ce que Synorix en fera ; les états sous la case ; l'encart « Voici ce que j'ai compris » (cochés par défaut,
// source, extrait dépliable) ; rien n'est validé sans clic. Cases et propositions INVENTÉES, à l'image de ce que le serveur renvoie.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CasesDepot, { CaseDepotVue, EncartCompris, GrilleCases } from '@/components/entreprise/CasesDepot'
import {
  MESSAGE_ANCIEN_FORMAT, MESSAGE_FORMAT, basculer, casesDeLaRubrique, cochesParDefaut, cochesPresentes, groupesParLecture, lectureEnCours,
  libelleAConfirmer, libelleValider, ligneFormats, messageRefus, phraseBilan, sourceLisible, trierFichiers,
  type CaseDefinition, type CaseEtat, type Proposition,
} from '@/lib/entreprise/depots'
import { lire, sansCommentaires } from './outils/sources'

const def = (id: string, rubrique: CaseDefinition['rubrique'], nom: string): CaseDefinition => ({
  id, rubrique, nom, contenu: `Contenu inventé de « ${nom} ».`, usage: `Usage inventé de « ${nom} » : rangé au coffre-fort, lu, proposé.`,
  formats: ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png'], plafond_mo: 20, plusieurs_fichiers: true, max_fichiers: 10,
})
const CASES: CaseDefinition[] = [
  def('kbis', 'identite', 'Extrait Kbis'), def('decennale', 'identite', "Attestation d’assurance décennale"),
  def('rc', 'identite', 'Attestation de responsabilité civile'),
  def('materiel', 'moyens', 'Liste du matériel ou inventaire'), def('personnel', 'moyens', 'Organigramme ou liste du personnel'),
  def('fiche_moyens', 'moyens', 'Fiche des moyens déjà faite (PDF ou Word)'),
  def('certificat', 'certifications', 'Certificat Qualibat, RGE ou autre label'),
  def('references', 'certifications', 'Liste de références ou ancien mémoire technique'),
]
const etat = (c: CaseDefinition, e: Partial<CaseEtat>): CaseEtat => ({
  ...c, etat: 'vide', libelle_etat: null, vers_verifier: false, propositions: 0, note: null, plafond: null, fichiers: [], ...e,
})
const rendre = (rubrique: CaseDefinition['rubrique'], etats: CaseEtat[] = [], erreurs: Record<string, string | null> = {}, envoi: Record<string, boolean> = {}) =>
  renderToStaticMarkup(<GrilleCases rubrique={rubrique} cases={CASES} etats={etats} envoi={envoi} erreurs={erreurs} onFichiers={() => {}} onVerifier={() => {}} />)

test('trois cases pour l’identité, trois pour les moyens, deux pour les certifications, avec leurs trois textes', () => {
  for (const [rubrique, n] of [['identite', 3], ['moyens', 3], ['certifications', 2]] as const) {
    const html = rendre(rubrique)
    assert.equal((html.match(/data-case="/g) ?? []).length, n, rubrique)
    for (const c of casesDeLaRubrique(CASES, rubrique)) {
      assert.ok(html.includes(c.nom.replace(/'/g, '&#x27;')), `nom de ${c.id}`)
      assert.ok(html.includes(c.contenu.replace(/'/g, '&#x27;').replace(/«/g, '«')), `ce qu’on y met : ${c.id}`)
      assert.ok(html.includes(c.usage.replace(/'/g, '&#x27;')), `ce que Synorix en fera : ${c.id}`)
    }
    // une surface, une rangée par case : plus d'intitulés répétés, plus de zone en pointillés au repos
    assert.ok(!/Ce que vous y mettez|Ce que Synorix en fera/.test(html))
    assert.ok(!/border-dashed/.test(html), 'aucune zone en pointillés au repos')
    assert.equal((html.match(/<article/g) ?? []).length, n)
    assert.equal((html.match(/type="file"/g) ?? []).length, n)
    assert.equal((html.match(/ multiple=""/g) ?? []).length, n, 'plusieurs fichiers par case')
    assert.ok(html.includes('PDF, Word, Excel, JPEG, PNG · 20 Mo · plusieurs fichiers'))
    assert.ok(html.includes('accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"'))
  }
})

test('chaque case a son bouton « Déposer un fichier » du système, qui nomme la case ; cible d’au moins 44 px ; le champ de fichier est hors de la tabulation', () => {
  const html = rendre('identite')
  const boutons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>Déposer un fichier<span class="sr-only"> pour « ([^»]+) »<\/span>/g)]
  assert.equal(boutons.length, 3)
  for (const [, classes] of boutons) assert.ok(/min-h-11/.test(classes), 'bouton de dépôt : 44 px')
  assert.deepEqual(boutons.map((b) => b[2].replace(/&#x27;/g, "'")), ['Extrait Kbis', "Attestation d’assurance décennale", 'Attestation de responsabilité civile'])
  // le champ natif ne se voit pas et ne prend pas le focus : le bouton l'ouvre
  const champs = [...html.matchAll(/<input[^>]*type="file"[^>]*>/g)]
  assert.equal(champs.length, 3)
  // `hidden` : aucune boîte (un champ masqué en `sr-only` gardait la largeur de la page et faisait déborder l'écran)
  for (const [champ] of champs) assert.ok(/tabindex="-1"/.test(champ) && /aria-hidden="true"/.test(champ) && / hidden=""/.test(champ) && !/class=/.test(champ), champ)
})

test('états sous la case : lu et à vérifier, déposé, OCR, en lecture, envoi, refus lisible', () => {
  const kbis = CASES[0], decennale = CASES[1], rc = CASES[2]
  const html = rendre('identite', [
    etat(kbis, { etat: 'lu', libelle_etat: 'Lu · 6 informations proposées', vers_verifier: true, propositions: 6 }),
    etat(decennale, { etat: 'ocr_requis', libelle_etat: 'Déposé dans le coffre-fort · lisible seulement avec un OCR' }),
    etat(rc, { etat: 'en_lecture', libelle_etat: 'En lecture…' }),
  ])
  assert.ok(html.includes('Lu · 6 informations proposées') && html.includes('Vérifier'))
  assert.ok(html.includes('Déposé dans le coffre-fort · lisible seulement avec un OCR'))
  assert.ok(html.includes('En lecture…') && !html.includes('animate-spin'), 'la lecture en cours se dit en mots (pastille bleue), sans roue')
  assert.match(html, /bg-bleu-soft text-bleu-ink[^>]*>(?:<svg[\s\S]*?<\/svg>)?En lecture…/)
  assert.match(html, /bg-vert-soft text-vert-ink[^>]*>(?:<svg[\s\S]*?<\/svg>)?Lu · 6 informations proposées/)
  assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 3)
  const coffre = rendre('moyens', [etat(CASES[3], { etat: 'coffre_seul', libelle_etat: 'Déposé dans le coffre-fort' })])
  assert.ok(coffre.includes('Déposé dans le coffre-fort') && !coffre.includes('Vérifier'))
  assert.ok(rendre('identite', [], {}, { kbis: true }).includes('Envoi en cours…'))
  const refus = rendre('identite', [], { kbis: `scan.exe : ${MESSAGE_FORMAT}` })
  assert.ok(refus.includes('role="alert"') && refus.includes("Ce fichier n’est pas un PDF, un Word, un Excel ou une image JPEG/PNG."))
  const differee = rendre('identite', [etat(kbis, { etat: 'differee', libelle_etat: 'Déposé dans le coffre-fort · lecture automatique reprise demain' })])
  assert.ok(differee.includes('Déposé dans le coffre-fort · lecture automatique reprise demain') && !differee.includes('Vérifier'))
  assert.ok(!/text-(danger|red)/.test(differee), 'un plafond atteint n’est pas une erreur : aucun rouge')
  const plafond = rendre('certifications', [etat(CASES[7], { etat: 'lu', libelle_etat: 'Lu · 20 informations proposées', plafond: "Lu jusqu’à la page 40" })])
  assert.ok(plafond.includes('Lu jusqu’à la page 40'), 'le plafond de pages est affiché')
})

const PROPOSITIONS: Proposition[] = [
  { id: 'p1', lecture_id: 'l1', case: 'kbis', case_nom: 'Extrait Kbis', rubrique: 'identite', champ: 'organisation.capital_social', libelle: 'Capital social',
    affichage: '40 000 €', a_confirmer: false, remplace: null, source: { fichier: 'kbis.pdf', page: 1, lieu: 'page 1' }, extrait: 'Capital social : 40 000,00 Euros' },
  { id: 'p2', lecture_id: 'l1', case: 'kbis', case_nom: 'Extrait Kbis', rubrique: 'identite', champ: 'organisation.greffe_rcs', libelle: 'Greffe du RCS',
    affichage: 'REIMS', a_confirmer: true, remplace: 'CHALONS', source: { fichier: 'kbis.pdf', page: 1, lieu: 'page 1' }, extrait: null },
  { id: 'p3', lecture_id: 'l2', case: 'materiel', case_nom: 'Liste du matériel ou inventaire', rubrique: 'moyens', champ: 'profil.materiel_liste', libelle: 'Matériel',
    affichage: '2 × Nacelle ciseaux', a_confirmer: false, remplace: null, source: { fichier: 'inventaire.xlsx', page: null, lieu: 'feuille « Matériel »' }, extrait: 'Nacelle ciseaux | 2' },
]
const encart = (coches: Set<string>, extra: Partial<Parameters<typeof EncartCompris>[0]> = {}) => renderToStaticMarkup(
  <EncartCompris propositions={PROPOSITIONS} coches={coches} onBasculer={() => {}} onValider={() => {}} onTout={() => {}} enCours={false} bilan={null} erreur={null} {...extra} />)

test('l’encart « Voici ce que j’ai compris » : cochés par défaut, source fichier · page, extrait dépliable, À confirmer, Valider', () => {
  const html = encart(cochesParDefaut(PROPOSITIONS))
  assert.ok(html.includes('Voici ce que j’ai compris'))
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3)
  assert.equal((html.match(/checked=""/g) ?? []).length, 3, 'tout est coché au départ')
  assert.ok(html.includes('Source : kbis.pdf · page 1') && html.includes('Source : inventaire.xlsx · feuille « Matériel »'))
  assert.equal((html.match(/<details/g) ?? []).length, 2, 'extrait d’origine dépliable quand il existe')
  assert.ok(html.includes("Voir l’extrait d’origine") && html.includes('Capital social : 40 000,00 Euros'))
  assert.ok(html.includes('À confirmer : remplace « CHALONS »'))
  assert.ok(html.includes('Valider 3 informations') && html.includes('Ne rien garder'))
  assert.ok(html.includes('Rien n’est enregistré dans votre profil avant que vous validiez'))
  // un fichier = un groupe
  assert.deepEqual(groupesParLecture(PROPOSITIONS).map((g) => [g.case_nom, g.propositions.length]), [['Extrait Kbis', 2], ['Liste du matériel ou inventaire', 1]])
  assert.ok(html.indexOf('Extrait Kbis') < html.indexOf('Liste du matériel'))
})

test('rien n’est validé sans clic : valider seulement par le bouton, jamais à l’affichage ; rien de coché désactive Valider', () => {
  const vide = encart(new Set())
  assert.ok(vide.includes('disabled=""') && vide.includes('>Valider<'))
  assert.ok(encart(new Set(['p1'])).includes('Valider 1 information<'))
  const src = sansCommentaires(lire('src/components/entreprise/CasesDepot.tsx'))
  // « valider.mutate » n'apparaît que dans des gestionnaires de clic
  const appels = [...src.matchAll(/valider\.mutate\(/g)]
  assert.equal(appels.length, 2)
  for (const a of appels) assert.match(src.slice(Math.max(0, a.index! - 40), a.index), /on(Valider|Tout)=\{\(\) => $/)
  assert.ok(!/useEffect/.test(src), 'aucune écriture ne part d’un effet')
  assert.ok(!/propositions\/valider['"`]\s*,\s*\{\s*ids\s*:\s*liste/.test(src))
})

test('le rendu complet du composant (données déjà en cache) n’appelle ni dépôt ni validation', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['depots', 'cases'], CASES)
  client.setQueryData(['depots', 'etat', 'identite'], CASES.slice(0, 3).map((c) => etat(c, {})))
  client.setQueryData(['depots', 'propositions', 'identite'], PROPOSITIONS.slice(0, 2))
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><CasesDepot rubrique="identite" /></QueryClientProvider>)
  assert.equal((html.match(/data-case="/g) ?? []).length, 3)
  assert.ok(html.includes('Voici ce que j’ai compris') && html.includes('Valider 2 informations'))
})

test('une seule vue de case : nom, textes, bouton de dépôt, état', () => {
  const html = renderToStaticMarkup(<CaseDepotVue vue={{ definition: CASES[0], envoi: false, erreur: null }} onFichiers={() => {}} onVerifier={() => {}} />)
  assert.ok(html.includes('<h4') && html.includes('Extrait Kbis') && html.includes('Déposer un fichier') && !html.includes('Glisser un fichier ici'))
})

test('aucune occurrence de « manquant », « incomplet » ni « absent » dans le dépôt', () => {
  const sources = ['src/components/entreprise/CasesDepot.tsx', 'src/lib/entreprise/depots.ts'].map((f) => sansCommentaires(lire(f))).join('\n')
  const rendus = [rendre('identite'), rendre('moyens'), rendre('certifications'), encart(cochesParDefaut(PROPOSITIONS))].join('\n')
  for (const mot of [/manquant/i, /incomplet/i, /absent/i]) {
    assert.ok(!mot.test(sources), `source : ${mot}`)
    assert.ok(!mot.test(rendus), `rendu : ${mot}`)
  }
})

test('composant réutilisable tel quel : pour seule entrée la rubrique, rien qui suppose la page Mon entreprise', () => {
  const src = sansCommentaires(lire('src/components/entreprise/CasesDepot.tsx'))
  assert.match(src, /export default function CasesDepot\(\{ rubrique, apresValidation, disposition = 'grille' \}: \{\s*rubrique: RubriqueId\s*apresValidation\?: \(\) => void\s*disposition\?: DispositionCases\s*\}\)/)
  for (const interdit of ['routes/Company', 'useFormulaireRubrique', 'useDonneesEntreprise', 'ContexteVisage', 'react-router']) assert.ok(!src.includes(interdit), interdit)
})

test('branché sous « Décrire avec vos mots » dans chaque rubrique de Mon entreprise', () => {
  const src = sansCommentaires(lire('src/routes/Company.tsx'))
  for (const r of ['identite', 'moyens', 'certifications']) assert.ok(src.includes(`<DecrireEtDeposer rubrique="${r}" />`), r)
  assert.ok(src.indexOf('<ProfileFreeTextCard />') < src.indexOf('<CasesDepot rubrique={rubrique} />'), 'les cases sont sous « Décrire avec vos mots »')
})

// ── logique pure ─────────────────────────────────────────────────────────────

test('trierFichiers : format, taille, nombre — messages lisibles', () => {
  const regle = { formats: ['.pdf', '.png'], plafond_mo: 20, max_fichiers: 2 }
  const { acceptes, refus } = trierFichiers([
    { name: 'a.PDF', size: 10 }, { name: 'b.exe', size: 10 }, { name: 'c.svg', size: 5 },
    { name: 'gros.pdf', size: 21 * 1024 * 1024 }, { name: 'd.png', size: 10 }, { name: 'e.png', size: 10 },
    { name: 'ancien.doc', size: 10 }, { name: 'ancien.XLS', size: 10 },
  ], regle)
  assert.deepEqual(acceptes.map((f) => f.name), ['a.PDF', 'd.png'])
  assert.deepEqual(refus.map((r) => r.nom), ['b.exe', 'c.svg', 'gros.pdf', 'e.png', 'ancien.doc', 'ancien.XLS'])
  assert.equal(refus[0].message, MESSAGE_FORMAT)
  assert.equal(refus[2].message, 'Fichier trop volumineux (max 20 Mo).')
  assert.equal(refus[3].message, '2 fichiers au plus par envoi.')
  assert.equal(refus[4].message, MESSAGE_ANCIEN_FORMAT)
  assert.equal(MESSAGE_ANCIEN_FORMAT, 'Enregistrez le fichier au format .docx (ou .xlsx) puis redéposez-le.')
  assert.equal(MESSAGE_FORMAT, "Ce fichier n’est pas un PDF, un Word, un Excel ou une image JPEG/PNG.")
})

test('messageRefus, sourceLisible, libellés', () => {
  assert.equal(messageRefus(415, 'Type de fichier non autorisé : .svg'), MESSAGE_FORMAT)
  assert.equal(messageRefus(415, MESSAGE_ANCIEN_FORMAT), MESSAGE_ANCIEN_FORMAT)
  assert.equal(messageRefus(413, 'Fichier trop volumineux (max 20 Mo).'), 'Fichier trop volumineux (max 20 Mo).')
  assert.equal(messageRefus(429, undefined), 'Trop de dépôts à la suite : réessayez dans une minute.')
  assert.equal(sourceLisible({ fichier: 'k.pdf', page: 3, lieu: 'page 3' }), 'k.pdf · page 3')
  assert.equal(sourceLisible({ fichier: 'i.xlsx', page: null, lieu: 'feuille « Matériel »' }), 'i.xlsx · feuille « Matériel »')
  assert.equal(sourceLisible({ fichier: 'f.docx', page: null, lieu: 'document Word' }), 'f.docx')
  assert.equal(libelleAConfirmer({ a_confirmer: false, remplace: null }), null)
  assert.equal(libelleAConfirmer({ a_confirmer: true, remplace: 'CHALONS' }), 'À confirmer : remplace « CHALONS »')
  assert.equal(libelleValider(0), 'Valider')
  assert.equal(libelleValider(1), 'Valider 1 information')
  assert.equal(libelleValider(6), 'Valider 6 informations')
  assert.equal(ligneFormats({ plafond_mo: 20, plusieurs_fichiers: true }), 'PDF, Word, Excel, JPEG, PNG · 20 Mo · plusieurs fichiers')
})

test('cochés : par défaut tous, bascule, seuls les identifiants présents partent', () => {
  const tous = cochesParDefaut(PROPOSITIONS)
  assert.equal(tous.size, 3)
  const sans = basculer(tous, 'p2')
  assert.deepEqual(cochesPresentes(sans, PROPOSITIONS), ['p1', 'p3'])
  assert.deepEqual(cochesPresentes(new Set(['p1', 'disparue']), PROPOSITIONS), ['p1'])
  assert.equal(basculer(sans, 'p2').has('p2'), true)
  assert.equal(tous.has('p2'), true, 'la bascule ne modifie pas l’ensemble reçu')
})

test('bilan de validation en une phrase positive ; lecture en cours détectée', () => {
  assert.equal(phraseBilan({ validees: 0, ecartees: 3, erreurs: [] }), 'Aucune information ajoutée à votre profil')
  assert.equal(phraseBilan({ validees: 1, ecartees: 0, erreurs: [] }), '1 information ajoutée à votre profil')
  assert.equal(phraseBilan({ validees: 5, ecartees: 1, erreurs: [{ libelle: 'Capital social', message: 'valeur refusée' }] }), '5 informations ajoutées à votre profil · Capital social : valeur refusée')
  assert.equal(lectureEnCours([{ etat: 'lu' }, { etat: 'en_lecture' }]), true)
  assert.equal(lectureEnCours([{ etat: 'lu' }, { etat: 'vide' }]), false)
})
