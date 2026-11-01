// Fiches « Mon entreprise » à télécharger : l'aperçu reproduit la structure du PDF et du Word (bandeau, identité, quatre
// tuiles, sections numérotées, tableau des références avec TOTAL, pied de page), le bordereau se modifie sur place,
// les libellés restent positifs, la palette suit le serveur. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FichePreview from '@/components/fiche/FichePreview'
import FicheEntreprise from '@/routes/FicheEntreprise'
import { estThemee } from '@/components/layout/Layout'
import PhraseARenseigner from '@/components/fiche/PhraseARenseigner'
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

test('texte abrégé par le serveur (« … ») : infobulle « Texte abrégé, modifiable dans Mon entreprise », rien sur les autres', () => {
  const abrege = { ...moyens, lignes_cles: [{ libelle: 'Activités', valeur: 'Gros œuvre, rénovation et façades de bâtiments anciens …' }], sections: moyens.sections.map((s, i) => i === 1 ? { ...s, texte: 'Tablettes et logiciel …' } : s) }
  const html = rendre(abrege)
  assert.equal((html.match(/data-abrege=""/g) ?? []).length, 2, 'les deux textes abrégés, et seulement eux')
  assert.equal((html.match(/title="Texte abrégé, modifiable dans Mon entreprise"/g) ?? []).length, 2)
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

function ecran(donnees: FicheDonnees) {
  const client = new QueryClient()
  client.setQueryData(['fiche-entreprise', donnees.rubrique], reponse(donnees))
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/entreprise/fiche/${donnees.rubrique}`]}>
        <Routes><Route path="/entreprise/fiche/:rubrique" element={<FicheEntreprise />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>)
}

test('l\'écran : un seul h1, les trois fiches, le choix PDF ou Word, l\'aperçu et le téléchargement', () => {
  const html = ecran(moyens)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.ok(html.includes('Fiche à télécharger — Moyens humains et matériels'))
  for (const t of ['Identité', 'Moyens', 'Références']) assert.ok(html.includes(`>${t}</a>`), t)
  assert.match(html, /<a(?=[^>]*aria-current="page")(?=[^>]*href="\/entreprise\/fiche\/moyens")[^>]*>/)
  assert.ok(html.includes('href="/entreprise/fiche/certifications"') && html.includes('href="/entreprise/fiche/identite"'))
  assert.ok(html.includes('name="format-fiche"') && html.includes('value="pdf"') && html.includes('value="docx"'))
  assert.match(html, /<input(?=[^>]*value="pdf")(?=[^>]*checked)[^>]*>/)
  assert.ok(html.includes('>PDF<') && html.includes('>Word<'))
  assert.ok(html.includes('Télécharger en PDF') && html.includes('Modifier le bordereau'))
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Bordereau enregistré/)
  assert.ok(html.includes('aria-label="Aperçu de la fiche"'))
  assert.ok(html.includes('href="/company"') && html.includes('Mon entreprise'))
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
  assert.ok(code.indexOf('<PhraseARenseigner') > 0 && code.indexOf('<PhraseARenseigner') < code.indexOf('<FichePreview'))
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
