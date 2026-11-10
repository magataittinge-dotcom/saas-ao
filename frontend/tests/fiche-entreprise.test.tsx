// Fiches « Mon entreprise » à télécharger : l'aperçu reproduit la structure du PDF et du Word (bandeau, identité, quatre
// tuiles, sections numérotées, tableau des références avec TOTAL, pied de page), le bordereau se modifie sur place,
// les libellés restent positifs, la palette suit le serveur. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CaseDefinition } from '@/lib/entreprise/depots'
import FichePreview from '@/components/fiche/FichePreview'
import FicheEntreprise from '@/routes/FicheEntreprise'
import { estThemee } from '@/components/layout/Layout'
import PhraseARenseigner from '@/components/fiche/PhraseARenseigner'
import ApercuPages from '@/components/fiche/ApercuPages'
import ZoneBordereau from '@/components/fiche/ZoneBordereau'
import { LignesLibres } from '@/components/fiche/ZoneContenu'
import { RAISON_PDF_INDISPONIBLE } from '@/routes/FicheEntreprise'
import { ETAT_INITIAL, MESSAGE_INDISPONIBLE, type EtatApercu } from '@/lib/apercuFiche'
import { A_QUOI_SERT, contenuDeLaFiche, sectionPrete } from '@/lib/fichePage'
import { CHAMPS, CHAMP_DE_SECTION, champDepuisRecherche, intituleCorrespond, lienSection } from '@/lib/entreprise/champsFiche'
import {
  bordereauModifie, lignesDeSection, pageEstimee, paletteFiche, phraseARenseigner, tuilesAffichees, variablesFiche,
  type FicheBordereau, type FicheDonnees, type FicheReponse, type FicheSection,
  estAbrege,
} from '@/lib/fiche'
import { lire, sansCommentaires } from './outils/sources'

const NBSP = ' '
const section = (id: string, titre: string, lignes: [string, string][], over: Partial<FicheSection> = {}): FicheSection => ({
  id, titre, lignes: lignes.map(([libelle, valeur]) => ({ libelle, valeur })), texte: '', vide: lignes.length === 0,
  disposition: 'large', ...over,
})

const bordereau = (over: Partial<FicheBordereau> = {}): FicheBordereau => ({
  titre: "MOYENS DE L'ENTREPRISE", sous_titre: 'Dossier entreprise · novembre 2026',
  contact: 'contact@lambert.example · 03 26 00 00 00', couleur: '#008cf8', lignes_libres: [], enregistre: false,
  logo_url: null, logo_origine: null, ...over,
})

const societe = { nom: 'Lambert Maçonnerie', siret: '12345678900019', forme: 'SAS', adresse: '12 avenue du Port, 51100 Reims', contact: '' }

const moyens: FicheDonnees = {
  rubrique: 'moyens', societe,
  identite_ligne: [{ libelle: 'Société', valeur: 'Lambert Maçonnerie' }, { libelle: 'SIRET', valeur: '12345678900019' }, { libelle: 'Siège', valeur: '12 avenue du Port, 51100 Reims' }],
  tuiles: [{ valeur: '12', libelle: 'personnes' }, { valeur: '4', libelle: "chefs d'équipe" }, { valeur: '4', libelle: 'véhicules' }, { valeur: '9', libelle: 'matériels' }],
  lignes_cles: [{ libelle: 'Activités', valeur: 'Gros œuvre et rénovation' }, { libelle: "Zone d'intervention", valeur: 'Marne et Aube' }],
  sections: [
    section('01', 'Moyens humains', [['2', 'Encadrement'], ['3', "Chefs d'équipe — Maçonnerie"]], { disposition: 'etroit' }),
    section('02', 'Moyens informatiques', [], { texte: 'Tablettes de chantier et logiciel de métrés.', vide: false }),
    section('03', 'Matériel', [['700 m²', 'Échafaudage de façade']]),
    section('04', 'Véhicules', []),
    section('05', 'Sécurité et premiers secours', [['4', 'Sauveteurs secouristes du travail (SST)']]),
    section('06', 'Qualité et environnement', [['Qualité', 'Autocontrôles à chaque étape']]),
    section('07', 'Documents sur demande', [['Extrait Kbis', 'disponible — valable jusqu\'au 30/01/2027']]),
  ],
  references: null, pied: 'Lambert Maçonnerie · SAS · SIRET 12345678900019 · 12 avenue du Port, 51100 Reims', pages: 1,
}

const certifications: FicheDonnees = {
  ...moyens, rubrique: 'certifications',
  tuiles: [{ valeur: '3', libelle: 'chantiers' }, { valeur: `250${NBSP}000${NBSP}€${NBSP}HT`, libelle: 'montant cumulé' }, { valeur: '1', libelle: 'en sous-traitance' }, { valeur: '3', libelle: "donneurs d'ordre" }],
  lignes_cles: [],
  sections: [section('01', 'Qualifications et labels', [['Qualibat', "valable jusqu'au 06/12/2027"]], { disposition: 'empile' })],
  references: {
    lignes: [
      { numero: 1, client: 'Ville de Reims', client_adresse: '', particulier: false, intervention: 'direct', chantier: 'Groupe scolaire Jean Moulin', lieu: 'Reims · 2025', travaux: 'Gros œuvre', montant: `120${NBSP}000${NBSP}€${NBSP}HT` },
      { numero: 2, client: 'Mme Dubois', client_adresse: '4 rue des Roses, 51100 Reims', particulier: true, intervention: 'sous_traitance', chantier: 'Extension', lieu: 'Reims · 2024', travaux: '', montant: `90${NBSP}000${NBSP}€${NBSP}HT` },
      { numero: 3, client: 'Habitat Marne', client_adresse: '', particulier: false, intervention: 'cotraitance', chantier: 'Résidence Les Lilas', lieu: 'Épernay · 2023', travaux: 'Façades', montant: `40${NBSP}000${NBSP}€${NBSP}HT` },
    ],
    total: { chantiers: 3, montant: `250${NBSP}000${NBSP}€${NBSP}HT`, sous_traitance: 1, donneurs_ordre: 3 },
    note: 'Montants exprimés en euros hors taxes.',
  },
  pages: 1,
}

const rendre = (donnees: FicheDonnees, b = bordereau(), edition = false) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <FichePreview
        donnees={donnees} bordereau={b} palette={paletteFiche(b.couleur)} logoSrc={null}
        edition={edition ? { onChange: () => {}, onLogo: () => {}, onRetirerLogo: () => {} } : undefined}
      />
    </MemoryRouter>)

test('aperçu Moyens : bandeau, ligne d\'identité, quatre tuiles, lignes clés, sept sections numérotées, pied', () => {
  const html = rendre(moyens)
  assert.match(html, /<h2[^>]*>MOYENS DE L&#x27;ENTREPRISE<\/h2>/)
  assert.ok(html.includes('Dossier entreprise · novembre 2026') && html.includes('contact@lambert.example'))
  assert.ok(html.includes('Lambert Maçonnerie</span>'), 'sans logo : le nom de l\'entreprise')
  assert.equal((html.match(/data-tuiles/g) ?? []).length, 1)
  assert.equal((html.match(/<li class="border-l-\[3px\]/g) ?? []).length, 4)
  for (const t of ['12', '4', '9', 'personnes', "chefs d&#x27;équipe", 'véhicules', 'matériels']) assert.ok(html.includes(t), t)
  assert.ok(html.includes('Activités') && html.includes("Zone d&#x27;intervention") && html.includes('Marne et Aube'))
  for (const id of ['01', '02', '03', '04', '05', '06', '07']) assert.ok(html.includes(`data-section="${id}"`), id)
  assert.ok(html.includes('Tablettes de chantier et logiciel de métrés.'))
  assert.ok(html.includes('Précisions sur demande'), 'section sans donnée : phrase neutre')
  assert.ok(html.includes('Lambert Maçonnerie · SAS · SIRET 12345678900019 · 12 avenue du Port, 51100 Reims'))
  assert.ok(html.includes('Page 1 / 1'))
  assert.ok(!html.includes('data-references'), 'pas de tableau de références sur la fiche Moyens')
})

test('aperçu Références : tableau, pastilles, total, note, particulier avec son adresse', () => {
  const html = rendre(certifications, bordereau({ titre: 'RÉFÉRENCES ET CERTIFICATIONS' }))
  assert.ok(html.includes('data-tableau-references'))
  assert.equal((html.match(/data-ligne-reference/g) ?? []).length, 3)
  for (const h of ['N°', "Client / donneur d&#x27;ordre", 'Intervention', 'Chantier et travaux réalisés', 'Montant HT']) assert.ok(html.includes(h), h)
  for (const p of ['En direct', 'Sous-traitance', 'Cotraitance']) assert.ok(html.includes(p), p)
  assert.ok(html.includes('Particulier') && html.includes('4 rue des Roses, 51100 Reims'))
  assert.match(html, /data-total-references[^>]*>[\s\S]*Total[\s\S]*3 chantiers[\s\S]*dont 1 en sous-traitance[\s\S]*250[\s\S]*€[\s\S]*HT/)
  assert.ok(html.includes('Montants exprimés en euros hors taxes.'))
  assert.ok(html.includes('data-cartes-references'), 'téléphone : une carte par chantier')
  assert.ok(html.includes('Qualibat') && html.includes('data-section="01"'))
})

test('texte abrégé par le serveur (« … ») : infobulle du système « Texte abrégé, modifiable dans Mon entreprise » (jamais un title natif), rien sur les autres', () => {
  const abrege = { ...moyens, lignes_cles: [{ libelle: 'Activités', valeur: 'Gros œuvre, rénovation et façades de bâtiments anciens …' }], sections: moyens.sections.map((s, i) => i === 1 ? { ...s, texte: 'Tablettes et logiciel …' } : s) }
  const html = rendre(abrege)
  assert.equal((html.match(/data-abrege=""/g) ?? []).length, 2, 'les deux textes abrégés, et seulement eux')
  assert.ok(!html.includes('title="'), 'aucune infobulle native')
  assert.equal((html.match(/<span[^>]*tabindex="0"[^>]*data-abrege=""/g) ?? []).length, 2, 'atteignable au clavier')
  assert.match(sansCommentaires(lire('src/components/fiche/FichePreview.tsx')), /<Infobulle texte=\{INFOBULLE_ABREGE\}>/)
  assert.ok(html.includes('anciens …</span>'))
  const refs = rendre({ ...certifications, references: { ...certifications.references!, lignes: [{ ...certifications.references!.lignes[0], travaux: 'Gros œuvre …' }] } })
  assert.equal((refs.match(/data-abrege=""/g) ?? []).length, 2, 'tableau (ordinateur) et carte (téléphone) de la même référence')
  assert.equal((rendre(moyens).match(/data-abrege/g) ?? []).length, 0)
  assert.ok(estAbrege('fin …') && !estAbrege('fin.') && !estAbrege(''))
})

test('sans référence : un message pour l\'aperçu, ni tableau ni total', () => {
  const html = rendre({ ...certifications, references: { ...certifications.references!, lignes: [], total: { chantiers: 0, montant: '', sous_traitance: 0, donneurs_ordre: 0 } } })
  assert.ok(html.includes('data-references-vide') && html.includes('Ajouter une référence'))
  assert.ok(!html.includes('data-total-references'))
})

test('lignes libres : visibles dans leur section en aperçu, jamais dans une autre', () => {
  const b = bordereau({ lignes_libres: [{ section: '03', libelle: '1', valeur: 'Grue mobile de 30 tonnes' }] })
  const html = rendre(moyens, b)
  const sec3 = html.split('data-section="03"')[1].split('data-section="04"')[0]
  assert.ok(sec3.includes('Grue mobile de 30 tonnes'))
  assert.ok(!html.split('data-section="04"')[1].includes('Grue mobile'))
  assert.deepEqual(lignesDeSection(moyens.sections[2], b.lignes_libres).map((l) => l.valeur), ['Échafaudage de façade', 'Grue mobile de 30 tonnes'])
})

test('mode édition : titre, sous-titre, contact, couleur, logo et lignes libres se modifient sur place', () => {
  const html = rendre(moyens, bordereau({ lignes_libres: [{ section: '03', libelle: 'Grue', valeur: '1' }] }), true)
  for (const nom of ['Titre de la fiche', 'Sous-titre', 'Contact', "Couleur d&#x27;accent", 'Libellé de la ligne libre 1', 'Valeur de la ligne libre 1', 'Retirer la ligne libre 1']) {
    assert.ok(html.includes(`aria-label="${nom}"`), nom)
  }
  assert.ok(html.includes('type="color"') && html.includes('value="#008cf8"'))
  assert.ok(html.includes('type="file"') && html.includes('accept="image/png,image/jpeg"'))
  assert.ok(html.includes('Ajouter un logo'))
  assert.equal((html.match(/Ajouter une ligne/g) ?? []).length, 7, 'un bouton par section')
  assert.ok(!html.includes('<h2'), 'en édition, le titre est un champ')
})

test('le logo s\'affiche à gauche du bandeau quand il existe, avec « Changer le logo » en édition', () => {
  const b = bordereau()
  const html = renderToStaticMarkup(
    <MemoryRouter><FichePreview donnees={moyens} bordereau={b} palette={paletteFiche(b.couleur)} logoSrc="/api/files/view/x.webp?sig=1"
      edition={{ onChange: () => {}, onLogo: () => {}, onRetirerLogo: () => {} }} /></MemoryRouter>)
  assert.ok(html.includes('src="/api/files/view/x.webp?sig=1"') && html.includes('alt="Logo de Lambert Maçonnerie"'))
  assert.ok(html.includes('Changer le logo') && html.includes('Retirer'))
})

test('la palette suit le serveur valeur pour valeur (services/fiches_donnees.palette)', () => {
  // Valeurs relevées sur le serveur pour ces trois couleurs.
  assert.deepEqual(paletteFiche('#008cf8'), { accent: '#008cf8', accent_texte: '#0077d2', bandeau: '#002745', bandeau_texte: '#ffffff', accent_pale: '#f0f7fc', accent_clair: '#dbecf9', encre: '#0b1220', texte: '#2b3543', discret: '#5d6a79', filet: '#c9d1db' })
  assert.deepEqual(paletteFiche('#AA3300'), { accent: '#aa3300', accent_texte: '#aa3300', bandeau: '#300e00', bandeau_texte: '#ffffff', accent_pale: '#faf3f0', accent_clair: '#f3e2db', encre: '#0b1220', texte: '#2b3543', discret: '#5d6a79', filet: '#c9d1db' })
  const jaune = paletteFiche('#ffee00')
  assert.equal(jaune.accent_texte, '#796f00', 'un jaune est assombri jusqu\'à 4,5:1 sur blanc')
  assert.equal(jaune.bandeau, '#474300')
  assert.equal(paletteFiche('rouge').accent, '#008cf8', 'couleur invalide : l\'accent du thème')
  assert.ok(variablesFiche(paletteFiche(null))['--f-accent'] === '#008cf8')
})

test('l\'aperçu ne contient aucune couleur écrite en dur : variables de la feuille seulement', () => {
  const code = sansCommentaires(lire('src/components/fiche/FichePreview.tsx'))
  assert.doesNotMatch(code, /#[0-9A-Fa-f]{3,8}\b/)
  assert.doesNotMatch(code, /\b(?:rgb|hsl)a?\(/)
})

test('libellés positifs : jamais « manquant », « incomplet » ni « absent »', () => {
  for (const f of ['src/components/fiche/FichePreview.tsx', 'src/routes/FicheEntreprise.tsx', 'src/lib/fiche.ts']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /manquant|incomplet|absent/i, f)
  }
  assert.doesNotMatch(rendre(moyens) + rendre(certifications), /manquant|incomplet|absent/i)
})

test('bordereauModifie ignore la casse de la couleur et repère un changement de ligne libre', () => {
  const a = bordereau()
  assert.equal(bordereauModifie(a, bordereau({ couleur: '#008CF8' })), false)
  assert.equal(bordereauModifie(a, bordereau({ titre: 'Autre' })), true)
  assert.equal(bordereauModifie(a, bordereau({ lignes_libres: [{ section: '01', libelle: 'a', valeur: '' }] })), true)
  assert.equal(pageEstimee({ ...moyens, pages: 3 }), 'Page 1 / 3')
})

// ── L'écran ─────────────────────────────────────────────────────

const reponse = (donnees: FicheDonnees, b = bordereau()): FicheReponse => ({
  rubrique: donnees.rubrique, libelle: donnees.rubrique === 'moyens' ? 'Moyens humains et matériels' : 'Certifications et références',
  bordereau: b, valeurs_par_defaut: { titre: b.titre, sous_titre: b.sous_titre, contact: b.contact, couleur: '#008cf8' },
  sections_libres: ['01', '02', '03', '04', '05', '06', '07'], palette: paletteFiche(b.couleur), donnees,
})

function caseDepot(id: string, rubrique: CaseDefinition['rubrique'], nom: string): CaseDefinition {
  return { id, rubrique, nom, contenu: 'Un document inventé.', usage: 'Synorix le lit et propose.', formats: ['pdf'], plafond_mo: 20, plusieurs_fichiers: true, max_fichiers: 10 }
}

function ecran(donnees: FicheDonnees, cases?: CaseDefinition[]) {
  const client = new QueryClient()
  client.setQueryData(['fiche-entreprise', donnees.rubrique], reponse(donnees))
  if (cases) client.setQueryData(['depots', 'cases'], cases)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/entreprise/fiche/${donnees.rubrique}`]}>
        <Routes><Route path="/entreprise/fiche/:rubrique" element={<FicheEntreprise />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>)
}

test('l\'écran : un seul h1 (« Fiche à télécharger », une fois), les trois fiches, le choix PDF / Word / Excel et le téléchargement', () => {
  const html = ecran(moyens)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.match(html, /<h1[^>]*>Fiche à télécharger<\/h1>/)
  assert.equal((html.match(/Fiche à télécharger/g) ?? []).length, 1, 'le titre n\'est pas répété')
  assert.match(html, /data-page="large"/, 'le conteneur et l\'en-tête de page du système')
  for (const t of ['Identité', 'Moyens', 'Références']) assert.ok(html.includes(`>${t}</a>`), t)
  assert.match(html, /<a(?=[^>]*aria-current="page")(?=[^>]*href="\/entreprise\/fiche\/moyens")[^>]*>/)
  assert.ok(html.includes('href="/entreprise/fiche/certifications"') && html.includes('href="/entreprise/fiche/identite"'))
  assert.match(html, /role="radiogroup" aria-label="Format du fichier"/)
  assert.ok(['pdf', 'docx', 'xlsx'].every((v) => new RegExp(`<input[^>]*type="radio"[^>]*value="${v}"`).test(html)))
  assert.match(html, /<input(?=[^>]*value="pdf")(?=[^>]*checked)[^>]*>/)
  assert.ok(html.includes('>PDF<') && html.includes('>Word<') && html.includes('>Excel<'))
  assert.ok(html.includes('Télécharger la fiche') && !html.includes('Modifier le bordereau') && !html.includes('Enregistrer le bordereau'))
  // le retour vers Mon entreprise : le fil de la barre du haut (coquille), pas un second lien au-dessus du titre
  assert.ok(!html.includes('href="/company"'))
  assert.match(lire('src/components/layout/Header.tsx'), /'\/entreprise\/fiche': \{ parent: 'Mon entreprise', parentTo: '\/company'/)
})

test('l\'écran : deux colonnes à l\'ordinateur, une au téléphone ; l\'ordre du DOM est l\'ordre de lecture : aperçu → téléchargement → contenu', () => {
  const html = ecran(moyens)
  const zones = ['data-zone="apercu"', 'data-zone="bordereau"', 'data-zone="contenu"'].map((z) => html.indexOf(z))
  assert.ok(zones.every((i) => i > 0) && zones[0] < zones[1] && zones[1] < zones[2], 'aperçu, téléchargement, contenu')
  assert.ok(html.includes('>Aperçu</h2>') && html.includes('>Téléchargement</h2>') && html.includes('>Ce qu&#x27;il y a dans la fiche</h2>'))
  assert.match(html, /<section[^>]*aria-labelledby="zone-contenu"/)
  assert.match(html, /class="[^"]*lg:grid-cols-\[minmax\(0,1fr\)_20rem\][^"]*"[^>]*data-zones/, 'l\'aperçu au large, les réglages à côté')
  assert.ok(!/\border-[123]\b|lg:order-none/.test(html), 'plus de réordonnancement : le DOM suit la lecture aux deux largeurs')
  assert.match(html, /class="[^"]*lg:sticky[^"]*"[^>]*data-colonne-bordereau/, 'la colonne du téléchargement reste à l\'écran')
})

test('lecture de la fiche : chargement → erreur → contenu par le motif du système ; une panne dit son erreur et propose « Réessayer »', () => {
  const code = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.match(code, /<Page\b/)
  assert.match(code, /<EtatRequete\b[\s\S]*requete=\{\{ data, isLoading, isError, refetch, isFetching \}\}/)
  assert.match(code, /<EtatErreur\b[\s\S]*titre="La fiche n’a pas pu se charger"[\s\S]*onReessayer=/)
  assert.doesNotMatch(code, /EcranEnChargement|err\.message|error\.message/)
  // sans réponse du serveur : le titre et les trois fiches restent là, aucune zone n'est montée
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/entreprise/fiche/moyens']}>
        <Routes><Route path="/entreprise/fiche/:rubrique" element={<FicheEntreprise />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>)
  assert.match(html, /<h1[^>]*>Fiche à télécharger<\/h1>/)
  assert.ok(html.includes('aria-label="Fiches"') && html.includes('data-phase="chargement"') && html.includes('aria-busy="true"'))
  assert.ok(!html.includes('data-zone='))
})

test('zone 1 : une phrase par fiche, les sections avec « Prête » ou « À renseigner » et un lien vers le bon champ', () => {
  const html = ecran(moyens)
  assert.ok(html.includes('Les grandes entreprises demandent vos moyens et vos références avant de vous confier un chantier en sous-traitance. Cette fiche se remet telle quelle.'))
  assert.equal((html.match(/data-section="/g) ?? []).length, 7)
  // Moyens : « Véhicules » n'a aucune ligne, les six autres en ont
  assert.match(html, /data-section="04" data-etat="a_renseigner"/)
  assert.match(html, /data-section="01" data-etat="prete"/)
  assert.equal((html.match(/data-etat="a_renseigner"/g) ?? []).length, 1)
  assert.ok(html.includes('>Prête<') && html.includes('>À renseigner<'))
  assert.match(html, /href="\/company\?rubrique=moyens&amp;champ=materiel"/)
  assert.match(html, /href="\/company\?rubrique=moyens&amp;champ=effectifs"/)
  assert.match(html, /aria-label="Renseigner : Véhicules"/)
  assert.match(html, /aria-label="Modifier : Matériel"/)
  // la zone de dépôt (phase B) : les cases de la rubrique, branchées sous les sections ; la validation recharge la fiche
  const source = sansCommentaires(lire('src/components/fiche/ZoneContenu.tsx'))
  assert.match(source, /<CasesDepot rubrique=\{rubrique\} apresValidation=\{apresValidation\} disposition="colonne" \/>/)
  assert.ok(!lire('src/components/fiche/ZoneContenu.tsx').includes('ZONE-DEPOT'), 'plus d\'emplacement vide')
  assert.match(sansCommentaires(lire('src/routes/FicheEntreprise.tsx')), /apresValidation=\{\(\) => \{ void client\.invalidateQueries\(\{ queryKey: cleFiche\(rubrique\) \}\) \}\}/)
  const avecCases = ecran(moyens, [
    caseDepot('materiel', 'moyens', 'Liste du matériel ou inventaire'), caseDepot('personnel', 'moyens', 'Organigramme ou liste du personnel'),
    caseDepot('fiche_moyens', 'moyens', 'Fiche des moyens déjà faite (PDF ou Word)'), caseDepot('kbis', 'identite', 'Extrait Kbis'),
  ])
  const zone1 = avecCases.slice(avecCases.indexOf('data-zone="contenu"'))
  assert.match(zone1, /data-depots="moyens"/, 'les cases de dépôt sont dans la zone 1')
  assert.ok(zone1.indexOf('data-sections-fiche') < zone1.indexOf('data-depots="moyens"'), 'sous la liste des sections')
  for (const nom of ['Liste du matériel ou inventaire', 'Organigramme ou liste du personnel', 'Fiche des moyens déjà faite (PDF ou Word)']) assert.ok(zone1.includes(nom), nom)
  assert.ok(!zone1.includes('Extrait Kbis'), 'seulement les cases de la rubrique de la fiche')
  const grille = zone1.match(/<div data-disposition="colonne" class="([^"]*)"/)
  assert.ok(grille && !/grid-cols/.test(grille[1]), 'zone étroite : une case sous l\'autre à toutes les largeurs')
  // une phrase, ton sobre, pour chacune des trois fiches
  for (const r of ['identite', 'moyens', 'certifications'] as const) assert.ok(A_QUOI_SERT[r].length > 60 && !/!|manquant|incomplet|absent/i.test(A_QUOI_SERT[r]))
  assert.equal(new Set(Object.values(A_QUOI_SERT)).size, 3)
})

test('zone 1 : une ligne libre rend une section « Prête » ; le tableau des références compte pour la fiche Références', () => {
  const vide = section('04', 'Véhicules', [])
  assert.equal(sectionPrete(vide, []), false)
  assert.equal(sectionPrete(vide, [{ section: '04', libelle: 'Camion', valeur: 'Benne 3,5 t' }]), true)
  assert.equal(sectionPrete(vide, [{ section: '03', libelle: 'Camion', valeur: 'Benne' }]), false)
  assert.equal(sectionPrete(vide, [{ section: '04', libelle: 'Camion', valeur: ' ' }]), false)
  assert.equal(sectionPrete({ ...vide, texte: 'Un texte', vide: false }, []), true)
  const lignes = contenuDeLaFiche('certifications', certifications, [])
  assert.deepEqual(lignes.map((l) => [l.cle, l.etat]), [['references', 'prete'], ['01', 'prete']])
  assert.equal(lignes[0].lien, '/company?rubrique=certifications&champ=references')
  const sans = contenuDeLaFiche('certifications', { ...certifications, references: { ...certifications.references!, lignes: [] } }, [])
  assert.equal(sans[0].etat, 'a_renseigner')
})

test('liens « champ » : chaque section de chaque fiche mène à un champ connu, dans la bonne rubrique', () => {
  for (const r of ['identite', 'moyens', 'certifications'] as const) {
    for (const [numero, champ] of Object.entries(CHAMP_DE_SECTION[r])) {
      assert.ok(champ in CHAMPS, `${r} ${numero} : champ « ${champ} » inconnu`)
      const lien = lienSection(r, numero)
      assert.match(lien, new RegExp(`^/company\\?rubrique=${CHAMPS[champ].rubrique}&champ=${champ}$`))
      assert.equal(champDepuisRecherche(lien.slice(lien.indexOf('?'))), champ)
    }
  }
  assert.equal(lienSection('moyens', '99'), '/company?rubrique=moyens')          // section sans champ connu : la rubrique
  assert.equal(champDepuisRecherche('?rubrique=identite&champ=materiel'), null)    // champ d'une autre rubrique
  assert.equal(champDepuisRecherche('?rubrique=moyens&champ=inconnu'), null)
  assert.equal(champDepuisRecherche('?rubrique=moyens'), null)
})

test('liens « champ » : Mon entreprise donne le focus au champ demandé (étiquette ou titre de groupe, sans toucher aux formulaires)', () => {
  const company = sansCommentaires(lire('src/routes/Company.tsx'))
  assert.match(company, /useFocusChamp\(champDepuisRecherche\(search\), rubrique, donnees\.profilCharge, mouvementReduit\)/)
  const hook = sansCommentaires(lire('src/components/entreprise/useFocusChamp.ts'))
  assert.match(hook, /scrollIntoView/)
  assert.match(hook, /\.focus\(\{ preventScroll: true \}\)/)
  // les intitulés visés existent bien dans les formulaires (si un libellé change, ce test le dit)
  const formulaires = ['FormIdentite', 'FormMoyens', 'FormCertifications'].map((f) => lire(`src/components/entreprise/${f}.tsx`)).join('\n')
  for (const [id, c] of Object.entries(CHAMPS)) {
    const intitule = c.label ?? c.groupe!
    assert.ok(formulaires.includes(`"${intitule}`) || formulaires.includes(`'${intitule}`) || formulaires.includes(`${intitule}`), `${id} : « ${intitule} » introuvable dans les formulaires`)
  }
  assert.equal(intituleCorrespond('Nom du dirigeant ', CHAMPS.dirigeant, 'label'), true)
  assert.equal(intituleCorrespond('Chiffres demandés dans la DC2', CHAMPS.chiffres, 'groupe'), true)
  assert.equal(intituleCorrespond('Équipe : le détail', CHAMPS.effectifs, 'groupe'), true)      // l'ordre du DOM fait gagner le premier
  assert.equal(intituleCorrespond('Équipe : le détail', CHAMPS.habilitations, 'groupe'), true)
  assert.equal(intituleCorrespond('Équipe', CHAMPS.habilitations, 'groupe'), false)
})

test('colonne « Téléchargement » : d\'abord le format expliqué et le bouton, puis le bordereau (titre, sous-titre, contact, logo, couleur) ; les lignes libres sont avec le contenu ; aucun contrôle natif visible', () => {
  const html = ecran(moyens)
  assert.ok(html.includes('à envoyer tel quel') && html.includes('pour modifier avant d’envoyer') && html.includes('le tableau, pour trier ou compléter'))
  assert.match(html, /<button[^>]*data-telecharger[^>]*>[\s\S]*?Télécharger la fiche[\s\S]*?· PDF/)
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 1, 'une seule action pleine sur l\'écran')
  assert.ok(html.indexOf('data-formats') < html.indexOf('data-telecharger') && html.indexOf('data-telecharger') < html.indexOf('Personnaliser le bordereau'), 'le geste de l\'écran d\'abord')
  // le bordereau : champs du système, chacun avec son étiquette reliée
  for (const l of ['Titre', 'Sous-titre', 'Contact']) {
    const id = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${l}</label>`))?.[1]
    assert.ok(id && html.includes(`id="${id}"`), l)
  }
  // logo et couleur : un bouton du système ouvre le sélecteur du navigateur ; le contrôle natif ne se voit pas
  assert.match(html, /data-depot-logo/)
  assert.ok(html.includes('>Choisir un logo</button>') && html.includes('PNG ou JPEG, 2 Mo au plus'))
  assert.match(html, /<input(?=[^>]*type="file")(?=[^>]*accept="image\/png,image\/jpeg")(?=[^>]*aria-hidden="true")(?=[^>]* hidden="")[^>]*>/)
  assert.ok(html.includes('Couleur d’accent') && html.includes('aria-label="Changer la couleur d’accent (#008cf8)"'))
  assert.match(html, /<input(?=[^>]*type="color")(?=[^>]*value="#008cf8")(?=[^>]*aria-hidden="true")(?=[^>]*sr-only)(?=[^>]*size-px)[^>]*>/, 'le nuancier masqué ne garde aucune largeur')
  assert.ok(!/border-dashed/.test(html), 'aucune zone en pointillés au repos')
  // les lignes libres sont du contenu : sous la liste des sections, avant les dépôts, plus dans la colonne de droite
  assert.match(html, /<h3[^>]*>Lignes libres<\/h3>/)
  const contenu = html.slice(html.indexOf('data-zone="contenu"'))
  assert.ok(contenu.indexOf('data-sections-fiche') < contenu.indexOf('data-lignes-libres') && contenu.includes('Ajouter une ligne'))
  assert.ok(!html.slice(html.indexOf('data-zone="bordereau"'), html.indexOf('data-zone="contenu"')).includes('data-lignes-libres'))
  const avecLigne = renderToStaticMarkup(<LignesLibres libres={[{ section: '03', libelle: 'Grue', valeur: '1' }]} sections={[{ id: '03', titre: 'Matériel' }]} onChange={() => {}} />)
  for (const nom of ['Section de la ligne libre 1', 'Libellé de la ligne libre 1', 'Valeur de la ligne libre 1', 'Retirer la ligne libre 1']) assert.ok(avecLigne.includes(`aria-label="${nom}"`), nom)
  assert.match(avecLigne, /<button[^>]*role="combobox"[^>]*aria-label="Section de la ligne libre 1"/, 'la section se choisit dans la liste déroulante du système')
  for (const [fichier, composants] of [['ZoneBordereau', ['<GroupeRadio', '<Champ', '<Bouton']], ['ZoneContenu', ['<ListeDeroulante', '<Champ', '<BoutonIcone', '<PastilleEtat']]] as const) {
    const source = sansCommentaires(lire(`src/components/fiche/${fichier}.tsx`))
    assert.doesNotMatch(source, /<select\b|type="radio"|<button\b|<input\b|animate-spin/, `${fichier} : composants du système seulement`)
    for (const composant of composants) assert.ok(source.includes(composant), `${fichier} ${composant}`)
  }
})

test('le PDF n\'est plus offert, avec sa raison, quand le rendu exact est indisponible ; Word et Excel restent offerts', () => {
  const html = renderToStaticMarkup(
    <ZoneBordereau
      bordereau={bordereau()} onChange={() => {}} logoSrc={null} logoEnCours={false} onLogo={() => {}} onRetirerLogo={() => {}}
      format="docx" onFormat={() => {}}
      pdfIndisponible={RAISON_PDF_INDISPONIBLE} onTelecharger={() => {}} enTelechargement={false}
    />)
  assert.doesNotMatch(html, /<input[^>]*value="pdf"/, 'le PDF ne peut pas être choisi')
  assert.match(html, /data-pdf-indisponible[^>]*>PDF · /)
  assert.ok(html.includes(RAISON_PDF_INDISPONIBLE))
  assert.match(html, /<input(?=[^>]*value="docx")(?=[^>]*checked)[^>]*>/)
  assert.match(html, /<input[^>]*value="xlsx"/)
  assert.doesNotMatch(html, /<input(?=[^>]*value="(?:docx|xlsx)")(?=[^>]*disabled)[^>]*>/)
  assert.ok(html.includes('· Word'))
})

test('R21 : pendant la génération, le bouton est désactivé et dit « Préparation de la fiche… » (annoncé aux lecteurs d’écran)', () => {
  const html = renderToStaticMarkup(
    <ZoneBordereau
      bordereau={bordereau()} onChange={() => {}} logoSrc={null} logoEnCours={false} onLogo={() => {}} onRetirerLogo={() => {}}
      format="pdf" onFormat={() => {}}
      pdfIndisponible={null} onTelecharger={() => {}} enTelechargement
    />)
  assert.match(html, /<button(?=[^>]*data-telecharger)(?=[^>]*disabled)(?=[^>]*aria-busy="true")[^>]*>[\s\S]*?Préparation de la fiche…/)
  assert.ok(!html.includes('Télécharger la fiche'))
})

test('aperçu : pages en images (alt « Page n sur N de la fiche », lazy à partir de la page 2), anciennes pages voilées pendant la mise à jour', () => {
  const pret: EtatApercu = { phase: 'pret', empreinte: 'a'.repeat(64), pages: 2, message: '', empreinteAffichee: 'a'.repeat(64) }
  const pages = [{ numero: 1, src: 'blob:p1' }, { numero: 2, src: 'blob:p2' }]
  const rendreApercu = (etat: EtatApercu, enRetard = false) => renderToStaticMarkup(
    <MemoryRouter><ApercuPages etat={etat} pages={pages} enRetard={enRetard} donnees={moyens} bordereau={bordereau()} palette={paletteFiche('#008cf8')} logoSrc={null} /></MemoryRouter>)
  const html = rendreApercu(pret)
  assert.match(html, /<img[^>]*src="blob:p1"[^>]*alt="Page 1 sur 2 de la fiche"/)
  assert.match(html, /alt="Page 2 sur 2 de la fiche"/)
  assert.match(html, /<img(?=[^>]*alt="Page 2 sur 2)(?=[^>]*loading="lazy")[^>]*>/)
  assert.match(html, /<img(?=[^>]*alt="Page 1 sur 2)(?=[^>]*loading="eager")[^>]*>/)
  assert.ok(!html.includes('Mise à jour de l&#x27;aperçu') && !html.includes('opacity-50'))
  // mise à jour : les pages restent là, voilées, avec la mention
  const maj = rendreApercu({ ...pret, phase: 'maj' })
  assert.ok(maj.includes('alt="Page 1 sur 2 de la fiche"') && maj.includes('opacity-50') && maj.includes('Mise à jour de l&#x27;aperçu…') && maj.includes('aria-busy="true"'))
  assert.ok(rendreApercu(pret, true).includes('opacity-50'), 'un enregistrement en attente voile aussi')
  // le statut annoncé aux lecteurs d'écran est dans la zone Aperçu (aria-live), pas dans le voile
  assert.match(ecran(moyens), /aria-live="polite" data-statut-apercu/)
})

test('aperçu : sans rendu exact, l\'aperçu HTML simplifié et sa ligne d\'explication', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><ApercuPages etat={{ ...ETAT_INITIAL, phase: 'indisponible', message: MESSAGE_INDISPONIBLE }} pages={[]} enRetard={false} donnees={moyens} bordereau={bordereau()} palette={paletteFiche('#008cf8')} logoSrc={null} /></MemoryRouter>)
  assert.ok(html.includes('Aperçu simplifié : le rendu exact est indisponible pour le moment.'))
  assert.ok(html.includes('aria-label="Aperçu de la fiche"') && html.includes('MOYENS DE L&#x27;ENTREPRISE'))
  const erreur = renderToStaticMarkup(
    <MemoryRouter><ApercuPages etat={{ ...ETAT_INITIAL, phase: 'erreur', message: 'La conversion tarde.' }} pages={[]} enRetard={false} donnees={moyens} bordereau={bordereau()} palette={paletteFiche('#008cf8')} logoSrc={null} /></MemoryRouter>)
  assert.ok(erreur.includes('Aperçu simplifié') && erreur.includes('La conversion tarde.'))
})

test('aucune occurrence de « manquant », « incomplet » ou « absent » dans la page de fiche', () => {
  for (const f of ['src/routes/FicheEntreprise.tsx', 'src/components/fiche/ZoneContenu.tsx', 'src/components/fiche/ZoneBordereau.tsx',
    'src/components/fiche/ApercuPages.tsx', 'src/lib/fichePage.ts', 'src/lib/apercuFiche.ts', 'src/lib/entreprise/champsFiche.ts']) {
    assert.doesNotMatch(lire(f), /manquant|incomplet|absent/i, f)
  }
  assert.doesNotMatch(ecran(moyens) + ecran(certifications) + ecran({ ...moyens, rubrique: 'identite' }), /manquant|incomplet|absent/i)
})

test('l\'aperçu et le téléchargement partent de l\'état enregistré : enregistrement automatique à 800 ms, le fichier attend l\'enregistrement', () => {
  const code = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.match(code, /DELAI_ENREGISTREMENT_MS = 800/)
  assert.match(code, /setTimeout\(\(\) => \{ dernierEnvoye\.current = cle; enregistrement\.mutate\(brouillon\) \}, DELAI_ENREGISTREMENT_MS\)/)
  assert.match(code, /await enregistrement\.mutateAsync\(brouillon\)/)
  assert.ok(code.indexOf('mutateAsync(brouillon)') < code.indexOf('/generer'))
  assert.doesNotMatch(code, /Enregistrer le bordereau|Modifier le bordereau/)
  assert.match(code, /planifier\(format, premier\.current \? 0 : undefined\)/)
})

test('l\'écran suit le thème clair / nuit et sa route est déclarée (lazy)', () => {
  assert.equal(estThemee('/entreprise/fiche/moyens'), true)
  assert.equal(estThemee('/entreprise/fiche/certifications'), true)
  assert.equal(estThemee('/entreprise/fiche'), false)
  const app = sansCommentaires(lire('src/App.tsx'))
  assert.match(app, /const FicheEntreprise = lazy\(\(\) => import\('@\/routes\/FicheEntreprise'\)\)/)
  assert.match(app, /<Route path="\/entreprise\/fiche\/:rubrique" element=\{<FicheEntreprise \/>\} \/>/)
})

test('les actions passent par l\'API : enregistrement, logo et génération (blob), sans contourner le serveur', () => {
  const code = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.match(code, /api\.put<FicheReponse>\(`\/entreprise\/fiches\/\$\{rubrique\}`/)
  assert.match(code, /`\/entreprise\/fiches\/\$\{rubrique\}\/logo`/)
  assert.match(code, /`\/entreprise\/fiches\/\$\{rubrique\}\/generer`[\s\S]*responseType: 'blob'/)
  assert.match(code, /params: \{ format \}/)
})


// ── Une fiche sans trous (T3) ───────────────────────────────────

test('aperçu : une ligne sans valeur n\'est pas imprimée, une tuile sans valeur disparaît, aucun tiret seul', () => {
  const creux: FicheDonnees = {
    ...moyens,
    tuiles: [{ valeur: '12', libelle: 'personnes' }, { valeur: '—', libelle: 'véhicules' }, { valeur: '', libelle: 'matériels' }],
    sections: [
      section('01', 'Moyens humains', [['Forme juridique', ''], ['Capital', '  '], ['Effectif', '12']]),
      section('02', 'Matériel', [['Libellé seul', '']]),
    ],
  }
  const html = rendre(creux, bordereau({ lignes_libres: [{ section: '01', libelle: 'Libre sans valeur', valeur: ' ' }, { section: '01', libelle: 'Libre', valeur: 'Valeur inventée' }] }))
  assert.equal((html.match(/<li class="border-l-\[3px\]/g) ?? []).length, 1, 'seule la tuile à valeur reste')
  assert.ok(!html.includes('véhicules') && !html.includes('matériels'))
  for (const t of ['Forme juridique', 'Capital', 'Libellé seul', 'Libre sans valeur']) assert.ok(!html.includes(t), `${t} n'est pas imprimé`)
  assert.ok(html.includes('Effectif') && html.includes('Valeur inventée'))
  assert.ok(html.includes('Précisions sur demande'), 'une section sans aucune ligne garde sa phrase neutre')
  assert.ok(!/>—</.test(html) && !html.includes('À renseigner'), 'ni tiret seul ni « À renseigner » sur la feuille')
  assert.deepEqual(tuilesAffichees(creux.tuiles).map((t) => t.libelle), ['personnes'])
  // aucune tuile : le bloc n'existe pas
  assert.ok(!rendre({ ...creux, tuiles: [{ valeur: '—', libelle: 'x' }] }).includes('data-tuiles'))
  // le tableau des références n'imprime pas de tiret pour un client ou un montant vide
  const refs = rendre({ ...certifications, references: { ...certifications.references!, lignes: [{ ...certifications.references!.lignes[0], client: '', montant: '' }], total: { ...certifications.references!.total, chantiers: 1, montant: '' } } })
  assert.ok(!/>—</.test(refs))
})

test('phrase « N informations à renseigner dans Mon entreprise pour compléter cette fiche » : lien vers la rubrique, absente à 0', () => {
  assert.equal(phraseARenseigner(0), null)
  assert.equal(phraseARenseigner(-2), null)
  assert.deepEqual(phraseARenseigner(1), { avant: '1 information à renseigner dans ', lien: 'Mon entreprise', apres: ' pour compléter cette fiche' })
  const html = renderToStaticMarkup(<MemoryRouter><PhraseARenseigner n={3} rubrique="moyens" /></MemoryRouter>)
  assert.match(html, /3 informations à renseigner dans <a[^>]*href="\/company\?rubrique=moyens"[^>]*>Mon entreprise<\/a> pour compléter cette fiche/)
  assert.equal(renderToStaticMarkup(<MemoryRouter><PhraseARenseigner n={0} rubrique="identite" /></MemoryRouter>), '')
  assert.ok(!/manquant|incomplet|absent/i.test(html))
  // elle est dans l'écran, au-dessus de l'aperçu, et nulle part dans le fichier (c'est le serveur qui imprime)
  const code = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.ok(code.indexOf('<PhraseARenseigner') > 0 && code.indexOf('<PhraseARenseigner') < code.indexOf('<ApercuPages'))
  assert.doesNotMatch(sansCommentaires(lire('src/components/fiche/FichePreview.tsx')), /PhraseARenseigner|à renseigner/)
})

test('l\'écran : le compte est celui des cartes de Mon entreprise (informations indispensables encore à saisir)', () => {
  const client = new QueryClient()
  client.setQueryData(['fiche-entreprise', 'moyens'], reponse(moyens))
  client.setQueryData(['memoire-config'], { id: 'c1', organization_id: 'o1', gestion_securite: 'PPSPS inventé' })
  for (const cle of ['team', 'references', 'documents', 'qualifications']) client.setQueryData([cle], [])
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/entreprise/fiche/moyens']}>
        <Routes><Route path="/entreprise/fiche/:rubrique" element={<FicheEntreprise />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>)
  assert.match(html, /8 informations à renseigner dans <a[^>]*href="\/company\?rubrique=moyens"[^>]*>Mon entreprise<\/a> pour compléter cette fiche/)
})
