// Mon entreprise (T2, T3, refonte du 10/11) — trois rubriques en rangées d'une même surface, le formulaire de la rubrique ouverte en pleine largeur dessous, avancement
// calculé depuis les données chargées, un seul formulaire et un seul « Enregistrer » par rubrique, charge utile identique à l'ancienne.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Company from '@/routes/Company'
import FormIdentite from '@/components/entreprise/FormIdentite'
import FormMoyens from '@/components/entreprise/FormMoyens'
import FormCertifications from '@/components/entreprise/FormCertifications'
import RubriquesEntreprise from '@/components/entreprise/RubriquesEntreprise'
import { LIBELLE_FICHE, lienFiche } from '@/lib/fiche'
import { initialesClient } from '@/components/entreprise/EditeursCertifications'
import { INFORMATIONS, RUBRIQUES, aRenseigner, avancement, etatPiece, libelleAvancement, referenceRenseignee, type DonneesEntreprise } from '@/lib/entreprise/avancement'
import { CHAMPS_ORGANISATION, CHAMPS_PROFIL, brouillonDepuis, chargeUtile } from '@/lib/entreprise/charges'
import { lignesDepuis, planVide, planifier } from '@/lib/entreprise/liste'
import { lireDepartements } from '@/lib/entreprise/metiers'
import { useAuthStore } from '@/stores/authStore'
import { lire, sansCommentaires } from './outils/sources'

const ORG = { id: 'o1', name: 'Entreprise de démonstration', siret: '12345678900011', siret_verified: true, address: '12 rue des Exemples, 14000 Caen', presentation: 'Texte inventé', plan: 'pro' as const, created_at: '2026-01-01' }
const CONFIG = {
  id: 'c1', organization_id: 'o1', nom_entreprise: 'Ancien nom', gerant_nom: 'Camille Démo', gerant_titre: 'Gérante', activites: 'Ravalement (inventé)',
  zone_intervention: 'Calvados', chiffre_affaires: [{ annee: '2025', montant: '1 100 000 €' }, { annee: '', montant: '' }],
  postes_cles: [{ poste: 'Conducteur', nom: 'Alex Exemple', role: 'Suivi' }], materiel: 'Échafaudages', gestion_securite: 'PPSPS à chaque chantier',
}
const DONNEES: DonneesEntreprise = {
  organisation: ORG, profil: CONFIG, equipe: [],
  references: [{ id: 'r1', intitule: 'École (exemple)', maitre_ouvrage: 'Commune fictive', adresse: 'Caen', montant_ht: 180000, annee: 2025 }],
  documents: [{ type: 'kbis', status: 'valid' }, { type: 'urssaf', status: 'expired' }],
}

/** Rend avec ou sans « écran large » (useMedia lit window.matchMedia). */
function rendre(el: React.ReactElement, large: boolean): string {
  const g = globalThis as unknown as { window?: unknown }
  const avant = g.window
  g.window = { matchMedia: (q: string) => ({ matches: large && q.includes('min-width: 1024px'), addEventListener() {}, removeEventListener() {} }) }
  try { return renderToStaticMarkup(el) } finally { g.window = avant }
}

const compte = (html: string, motif: RegExp) => (html.match(motif) ?? []).length
const panneaux = { identite: () => <i>identité</i>, moyens: () => <i>moyens</i>, certifications: () => <i>certifs</i> }

function pageCompany(large: boolean): string {
  const client = new QueryClient()
  client.setQueryData(['memoire-config'], CONFIG)
  client.setQueryData(['team'], [])
  client.setQueryData(['references'], DONNEES.references)
  client.setQueryData(['documents'], DONNEES.documents)
  useAuthStore.setState({ organization: ORG })
  return rendre(<QueryClientProvider client={client}><MemoryRouter><Company /></MemoryRouter></QueryClientProvider>, large)
}

/* ── avancement ─────────────────────────────────────────────── */

test('avancement : calculé en fonction pure depuis les données chargées', () => {
  assert.deepEqual(avancement(DONNEES, 'identite'), { rempli: 7, total: 10 })
  assert.deepEqual(avancement({ ...DONNEES, profil: { ...CONFIG, activites: '  ' } }, 'identite'), { rempli: 6, total: 10 })
  assert.deepEqual(avancement({}, 'identite'), { rempli: 0, total: 10 })
  assert.deepEqual([avancement({}, 'moyens').total, avancement({}, 'certifications').total], [9, 15], '10 + 9 + 15 = 34 informations indispensables (étude § 1) : le chiffre d\'affaires et l\'effectif moyen (I20, I23) sont dans Certifications et références')
  assert.equal(INFORMATIONS.filter((i) => i.niveau === 'indispensable').length, 34, 'la jauge compte les 34 indispensables de l\'étude')
  assert.equal(libelleAvancement({ rempli: 11, total: 14 }), '11 informations sur 14')
  assert.equal(libelleAvancement({ rempli: 1, total: 14 }), '1 information sur 14')
  assert.equal(libelleAvancement({ rempli: 0, total: 14 }), '0 information sur 14')
})

test('avancement : les pièces du coffre comptent tant qu\'elles ne sont pas à renouveler ; une référence prête a ses champs principaux', () => {
  assert.equal(etatPiece(DONNEES.documents, ['kbis']), 'au_coffre')
  assert.equal(etatPiece(DONNEES.documents, ['urssaf']), 'a_renouveler')
  assert.equal(etatPiece(DONNEES.documents, ['fiscal']), 'a_joindre')
  assert.equal(avancement(DONNEES, 'certifications').rempli, 7, 'Kbis + intitulé, maître d\'ouvrage, lieu, montant et année de la référence (ni nature des travaux ni mode d\'intervention)')
  assert.deepEqual(aRenseigner(DONNEES, 'certifications').filter((l) => l.startsWith('Référence')), ['Référence : nature des travaux', "Référence : mode d'intervention"])
  assert.equal(avancement({ ...DONNEES, references: [{ ...DONNEES.references![0], description: 'Façades', mode_intervention: 'direct' }] }, 'certifications').rempli, 9)
  assert.equal(avancement({ ...DONNEES, references: [] }, 'certifications').rempli, 2, 'sans référence, aucune des sept informations n\'est comptée')
  const declare = { ...DONNEES, qualifications: [{ famille: 'assurance' as const, intitule: 'Décennale' }, { famille: 'assurance' as const, intitule: 'Responsabilité civile' }, { famille: 'qualification' as const, intitule: 'Qualibat 7112' }] }
  assert.equal(avancement(declare, 'certifications').rempli, 10, 'qualification et assurances déclarées comptent comme les pièces du coffre')
  assert.equal(referenceRenseignee({ intitule: 'x' }), false)
  assert.ok(aRenseigner(DONNEES, 'certifications').includes('Attestation de régularité fiscale'))
  assert.ok(!aRenseigner(DONNEES, 'certifications').includes('Extrait Kbis'))
})

test('avancement : chaque information a une rubrique connue et un identifiant unique', () => {
  const ids = INFORMATIONS.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const i of INFORMATIONS) assert.ok(RUBRIQUES.some((r) => r.id === i.rubrique), i.id)
})

/* ── trois rubriques ─────────────────────────────────────────── */

test('trois rubriques : UNE surface, trois rangées (titre, avancement, jauge) ; l\'ouverte est marquée ; ni faits clés répétés, ni « À renseigner » ambre', () => {
  const html = rendre(<MemoryRouter><RubriquesEntreprise donnees={DONNEES} rubrique="moyens" onChoisir={() => {}} panneaux={panneaux} /></MemoryRouter>, true)
  assert.match(html, /role="tablist"/)
  assert.equal(compte(html, /role="tab"/g), 3)
  assert.equal(compte(html, /aria-selected="true"/g), 1)
  assert.equal(compte(html, /aria-selected="false"/g), 2)
  assert.match(html, /<div[^>]*role="tab"[^>]*data-rubrique="moyens"[^>]*aria-selected="true"[^>]*class="[^"]*bg-surface-1/, 'la rubrique ouverte : fond neutre')
  assert.equal(compte(html, /data-surface=""/g), 1, 'une seule surface pour les trois rubriques')
  assert.ok(!/md:grid-cols-3|grid-template-columns/.test(html), 'plus de trois cartes côte à côte')
  for (const r of RUBRIQUES) assert.ok(html.includes(`>${r.titre}</span>`), r.titre)
  assert.equal(lienFiche('certifications'), '/entreprise/fiche/certifications')
  assert.ok(html.includes('informations sur 9') && html.includes('informations sur 10') && html.includes('informations sur 15'), 'avancement affiché')
  assert.equal(compte(html, /<li /g), 0, 'plus de faits clés répétés dans chaque rubrique')
  assert.ok(!/À renseigner|text-ambre-ink/.test(html), 'un champ vide n\'est pas une alerte : aucun ambre ici')
  assert.ok(!/text-danger|border-danger|text-rouge/.test(html), 'jamais de rouge sur une rubrique')
  assert.equal(compte(html, /min-h-16/g), 3, 'rangées de 64 px : la cible dépasse 44 px')
  assert.equal(compte(html, /<i>moyens<\/i>/g), 1, 'seul le formulaire de la rubrique ouverte est monté')
  assert.equal(compte(html, /<i>identité<\/i>/g), 0)
  assert.ok(html.indexOf('role="tablist"') < html.indexOf('<i>moyens</i>'), 'le formulaire est sous les rubriques')
})

test('cartes : tabindex itinérant et clavier (flèches, Début, Fin) ; mêmes cartes au téléphone', () => {
  for (const large of [true, false]) {
    const html = rendre(<MemoryRouter><RubriquesEntreprise donnees={DONNEES} rubrique="identite" onChoisir={() => {}} panneaux={panneaux} /></MemoryRouter>, large)
    assert.equal(compte(html, /role="tab"/g), 3)
    assert.equal(compte(html, /tabindex="0"/g), 1, 'une seule carte dans l\'ordre de tabulation')
    assert.equal(compte(html, /tabindex="-1"/g), 2)
  }
  const code = sansCommentaires(lire('src/components/entreprise/RubriquesEntreprise.tsx'))
  for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(code.includes(`'${k}'`), k)
})

/* ── un seul formulaire, un seul Enregistrer ─────────────────── */

test('Identité : un seul champ « Nom de l\'entreprise » et un seul bouton « Enregistrer » dans toute la page', () => {
  for (const large of [true, false]) {
    const html = pageCompany(large)
    assert.equal(compte(html, /Nom de l&#x27;entreprise/g), 1, `nom (${large ? 'colonnes' : 'onglets'})`)
    assert.equal(compte(html, />Enregistrer</g), 1, 'un seul Enregistrer')
    assert.equal(compte(html, /<form/g), 1, 'un seul formulaire')
    assert.ok(!html.includes('Ancien nom'), 'nom_entreprise du profil n\'est plus montré')
  }
})

test('chaque rubrique : un seul formulaire et un seul bouton « Enregistrer »', () => {
  const client = new QueryClient()
  const enveloppe = (el: React.ReactElement) => rendre(<QueryClientProvider client={client}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>, true)
  for (const el of [<FormIdentite donnees={DONNEES} />, <FormMoyens donnees={DONNEES} />, <FormCertifications donnees={DONNEES} />]) {
    const html = enveloppe(el)
    assert.equal(compte(html, /<form/g), 1)
    assert.equal(compte(html, /type="submit"/g), 1)
    assert.equal(compte(html, />Enregistrer</g), 1)
  }
})

test('Certifications : pièces du coffre-fort en positif, qualifications et assurances à déclarer, références à renseigner', () => {
  const client = new QueryClient()
  const html = rendre(<QueryClientProvider client={client}><MemoryRouter><FormCertifications donnees={{ ...DONNEES, qualifications: [{ id: 'q1', famille: 'assurance', intitule: 'Décennale', organisme: 'Assureur inventé' }] }} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('Au coffre-fort') && html.includes('À renouveler') && html.includes('À joindre'))
  assert.ok(html.includes('href="/vault"'))
  for (const t of ['Qualifications', 'Assurances', 'Références', 'Chiffres demandés dans la', 'Ajouter une qualification', 'Ajouter une assurance', 'Ajouter une référence', 'Assureur inventé']) assert.ok(html.includes(t), t)
  assert.ok(html.includes('École (exemple)') && html.includes('Nature des travaux réalisés') && html.includes('Montant HT'))
  assert.ok(!/manquant|incomplet|absent/i.test(html))
  assert.ok(!html.includes('Afficher le nom complet'), 'client public : pas de case « nom complet »')
})

test('Certifications : un client particulier n\'est nommé que par ses initiales, sauf case cochée (RGPD, 0031)', () => {
  const particulier = { ...DONNEES, references: [{ id: 'r2', intitule: 'Extension (exemple)', maitre_ouvrage: 'Mme Dubois', client_type: 'particulier' as const }] }
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormCertifications donnees={particulier} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('Afficher le nom complet du client sur les fiches et dans le mémoire'))
  assert.ok(html.includes('initiales (Mme D.)'), 'aperçu des initiales que le serveur écrira')
  assert.ok(html.includes('role="checkbox"') && html.includes('aria-checked="false"') && !html.includes('aria-checked="true"'), 'case du système, décochée par défaut')
  assert.equal(initialesClient('Jean-Pierre Martin'), 'J.-P. M.')
  assert.equal(initialesClient('M. Ali Ben Salah'), 'M. A. B. S.')
  assert.equal(initialesClient(''), '')
})

test('« Enregistrer » vit dans l\'en-tête du formulaire ; la version collée apparaît seulement après avoir défilé sous l\'en-tête et ne masque jamais un champ', () => {
  const code = sansCommentaires(lire('src/components/entreprise/CadreFormulaire.tsx'))
  assert.match(code, /IntersectionObserver/)
  assert.match(code, /rootMargin: '100000px 0px -99% 0px'/, 'la zone observée est la bande au-dessus de <main>')
  assert.match(code, /setColle\(e\.isIntersecting && e\.intersectionRatio >= 0\.99\)/, 'collée seulement quand l\'en-tête est sorti par le haut')
  assert.match(code, /sticky top-0/, 'collée au bord haut de la zone de défilement (<main> n\'a plus de retrait : le conteneur est posé par la coquille)')
  assert.match(code, /closest\('main'\)/)
  assert.match(code, /scrollPaddingTop = `\$\{Math\.ceil\(barre\.current\.getBoundingClientRect\(\)\.height\) \+ 8\}px`/, 'scroll-padding-top de <main> à la hauteur de la barre')
  assert.match(code, /defilant\.style\.scrollPaddingTop = ''/, 'remis à zéro au démontage')
  assert.doesNotMatch(code, /fixed bottom-0|sticky bottom-0|scrollPaddingBottom/, 'plus de barre collée en bas')
  assert.doesNotMatch(sansCommentaires(lire('src/components/entreprise/champs.tsx')), /PiedEnregistrer|scrollPaddingBottom/)
  // au repos (rendu serveur), la barre collée n'existe pas : un seul « Enregistrer », dans l'en-tête
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(!html.includes('data-barre-collee'))
  assert.ok(html.indexOf('>Enregistrer<') < html.indexOf('Coordonnées légales'), 'les boutons sont au-dessus des champs')
  assert.match(html, /<button[^>]*type="submit"[^>]*form="[^"]+"/, 'le bouton de l\'en-tête soumet le formulaire en dessous')
  for (const f of ['FormIdentite', 'FormMoyens', 'FormCertifications']) {
    assert.match(sansCommentaires(lire(`src/components/entreprise/${f}.tsx`)), /<CadreFormulaire[\s\S]*<\/CadreFormulaire>/, f)
  }
})

test('formulaire pleine largeur : en-tête (titre, explication, « Fiche à télécharger », « Enregistrer »), puis « Décrire avec vos mots », puis les champs', () => {
  const html = pageCompany(true)
  assert.match(html, /<h2[^>]*>Identité<\/h2>/)
  assert.ok(html.includes('Qui vous êtes : ce que l&#x27;acheteur lit en premier'))
  assert.ok(html.indexOf('role="tablist"') < html.indexOf('<form'), 'le formulaire est sous les cartes dans le DOM')
  const iFiche = html.indexOf(LIBELLE_FICHE, html.indexOf('<h2'))
  const iEnreg = html.indexOf('>Enregistrer<')
  const iMots = html.indexOf('Décrire avec vos mots')
  const iForm = html.indexOf('<form')
  assert.ok(iFiche > 0 && iFiche < iEnreg && iEnreg < iMots && iMots < iForm, 'ordre : Fiche à télécharger, Enregistrer, Décrire avec vos mots, champs')
  assert.match(html, /role="tabpanel"/)
  assert.ok(!html.includes('animate-fade-in motion-reduce:animate-none"><div class="flex flex-col'), 'plus de colonne étroite')
})

test('« Fiche à télécharger » partout, jamais « Fiche » seul ; jamais « manquant », « incomplet » ni « absent »', () => {
  for (const rubrique of ['identite', 'moyens', 'certifications'] as const) {
    const client = new QueryClient()
    client.setQueryData(['memoire-config'], CONFIG); client.setQueryData(['team'], []); client.setQueryData(['references'], DONNEES.references); client.setQueryData(['documents'], DONNEES.documents)
    useAuthStore.setState({ organization: ORG })
    const html = rendre(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/company?rubrique=${rubrique}`]}><Company /></MemoryRouter></QueryClientProvider>, true)
    assert.equal(compte(html, new RegExp(LIBELLE_FICHE, 'g')), 1, `${rubrique} : une fois, dans l'en-tête du formulaire`)
    assert.ok(!/>Fiche\b(?! à télécharger)/.test(html), 'aucun « Fiche » seul')
    assert.ok(!/aria-label="Fiche /.test(html))
    assert.ok(!/manquant|incomplet|absent/i.test(html), rubrique)
  }
  const sources = ['src/components/entreprise/RubriquesEntreprise.tsx', 'src/components/entreprise/CadreFormulaire.tsx', 'src/components/entreprise/SceneVisage.tsx', 'src/routes/FicheEntreprise.tsx', 'src/components/layout/Header.tsx']
  for (const f of sources) assert.doesNotMatch(sansCommentaires(lire(f)), />\s*Fiche\s*(<|\{)|'Fiche'|"Fiche"/, f)
})

test('sous les champs : la source (Sirene) quand elle existe ; rien sous un champ vide (plus de « À renseigner » ambre), jamais de rouge', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('Prérempli depuis le répertoire Sirene'), 'nom et siège : la source Sirene')
  assert.ok(html.includes('Vérifié au répertoire Sirene'), 'SIRET vérifié')
  assert.ok(!/À renseigner|data-etat="a-renseigner"|>Renseigné</.test(html), 'ni pastille ni mention sous les champs')
  assert.ok(!/text-ambre-ink[^"]*"[^>]*>[^<]/.test(html), 'aucun texte ambre au repos')
  assert.ok(!/text-danger|text-red-|text-rouge-ink/.test(html), 'un champ vide n\'est pas une erreur')
  // un profil vide : des champs à remplir, sans alerte
  const vide = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormMoyens donnees={{}} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(!/À renseigner|text-ambre-ink[^"]*"[^>]*>[^<]/.test(vide))
  assert.ok(!/manquant|incomplet|absent/i.test(vide))
})

test('groupes : sous-titres en casse de phrase, champs en deux colonnes, indispensables d\'abord', () => {
  const rendu = (el: React.ReactElement) => rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>, true)
  const identite = rendu(<FormIdentite donnees={DONNEES} />)
  const moyens = rendu(<FormMoyens donnees={DONNEES} />)
  const certifs = rendu(<FormCertifications donnees={DONNEES} />)
  const ordre = (html: string, titres: string[]) => {
    const positions = titres.map((t) => html.indexOf(`>${t}</h3>`) > 0 ? html.indexOf(`>${t}</h3>`) : html.indexOf(`>${t}`))
    assert.ok(positions.every((p) => p > 0), `sous-titres présents : ${titres.join(', ')}`)
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'dans cet ordre')
  }
  ordre(identite, ['Coordonnées légales', 'Dirigeant et contacts', 'Activités et zone'])
  ordre(moyens, ['Équipe', 'Matériel et véhicules', 'Sécurité, qualité, environnement'])
  ordre(certifs, ['Qualifications', 'Références', 'Chiffres demandés dans la'])
  for (const html of [identite, moyens, certifs]) {
    assert.doesNotMatch(html, /uppercase/, 'sous-titres en casse de phrase, jamais en capitales forcées')
    assert.match(html, /md:grid-cols-2/, 'deux colonnes')
    assert.match(html, /aria-expanded="false"[^>]*>Afficher les informations utiles et en option/)
  }
  assert.ok(!identite.includes('Date de création') && !moyens.includes('Démarche qualité') && !certifs.includes('Certifications de management'), 'utile et option : repliés')
})

test('le chiffre d\'affaires et l\'effectif des exercices sont dans Certifications et références, plus dans Identité', () => {
  const rendu = (el: React.ReactElement) => rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>, true)
  const identite = rendu(<FormIdentite donnees={DONNEES} />)
  const certifs = rendu(<FormCertifications donnees={DONNEES} />)
  assert.ok(!identite.includes('Effectif moyen annuel') && !identite.includes('Ajouter une année'))
  assert.ok(certifs.includes('aria-label="Effectif moyen annuel"') && certifs.includes('Ajouter une année') && certifs.includes('value="1 100 000 €"'))
  assert.ok(INFORMATIONS.filter((i) => ['I20', 'I23'].includes(i.id)).every((i) => i.rubrique === 'certifications'))
})

test('Identité : étiquettes associées aux champs, SIRET saisissable (G7), le reste à la demande', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('value="Entreprise de démonstration"'), 'le nom vient de l\'organisation')
  assert.ok(!html.includes('Ancien nom'), 'le nom du profil n\'est pas montré')
  for (const label of ['Nom de l&#x27;entreprise', 'SIRET', 'Adresse du siège', 'Nom du dirigeant', 'Fonction du dirigeant', 'Activités principales']) {
    assert.ok(html.includes(label), label)
  }
  assert.ok(!/readOnly=""|readonly=""/.test(html), 'G7 : le SIRET se saisit, même sur un profil rempli')
  assert.match(html, /aria-expanded="false"[^>]*>Afficher les informations utiles et en option/)
  assert.ok(!html.includes('Historique et parcours'), 'replié tant qu\'on ne le demande pas')
  assert.equal(compte(html, /for="[^"]+"/g) >= 6, true)
})

/* ── charge utile ─────────────────────────────────────────────── */

test('charge utile : les champs existants partent vers les mêmes routes, avec les mêmes valeurs qu\'avant', () => {
  const b = brouillonDepuis('identite', DONNEES)
  const c = chargeUtile('identite', b, DONNEES)
  assert.deepEqual(c.organisation, { name: ORG.name, address: ORG.address, presentation: ORG.presentation }, 'les champs neufs vides ne partent pas')
  assert.deepEqual(Object.keys(c.profil!).sort(), [...CHAMPS_PROFIL.identite.filter((k) => !['metiers', 'departements_intervention'].includes(k)), 'nom_entreprise'].sort())
  assert.equal(c.profil!.gerant_nom, 'Camille Démo')
  assert.ok(!('chiffre_affaires' in c.profil!), 'le chiffre d\'affaires part avec Certifications et références')
  // Capital social : un nombre part tel quel ; vidé alors qu'il était renseigné, il part à null (la route efface) ; jamais saisi, il ne part pas
  const avecCapital = { ...DONNEES, organisation: { ...ORG, capital_social: 40000 } }
  assert.equal(chargeUtile('identite', brouillonDepuis('identite', avecCapital), avecCapital).organisation!.capital_social, 40000)
  assert.equal(chargeUtile('identite', { ...brouillonDepuis('identite', avecCapital), organisation: { ...brouillonDepuis('identite', avecCapital).organisation, capital_social: '' as unknown as number } }, avecCapital).organisation!.capital_social, null)
  assert.ok(!('capital_social' in chargeUtile('identite', brouillonDepuis('identite', DONNEES), DONNEES).organisation!))
  // Moyens : le profil seulement (PUT /memoire-config), rien pour l'organisation
  const m = chargeUtile('moyens', brouillonDepuis('moyens', DONNEES), DONNEES)
  assert.equal(m.organisation, null)
  const anciens = CHAMPS_PROFIL.moyens.filter((k) => !['effectifs_par_categorie', 'habilitations', 'materiel_liste', 'vehicules_liste', 'sous_traitance_partenaires', 'sous_traitance_part_pct', 'sav_garantie'].includes(k))
  assert.deepEqual(Object.keys(m.profil!).sort(), [...anciens].sort(), 'un profil sans nouvelle information envoie exactement les anciens champs')
  assert.deepEqual(m.profil!.postes_cles, CONFIG.postes_cles)
  assert.equal(m.profil!.materiel, 'Échafaudages')
  // Certifications : le chiffre d'affaires (profil) seulement ; qualifications et références ont leurs routes
  assert.deepEqual(chargeUtile('certifications', brouillonDepuis('certifications', DONNEES), DONNEES), { organisation: null, profil: { chiffre_affaires: CONFIG.chiffre_affaires } })
})

test('le nom est unique : la surcharge du profil suit le nom saisi ; un nom vide n\'est jamais envoyé', () => {
  const b = brouillonDepuis('identite', DONNEES)
  b.organisation.name = '  Nouveau nom  '
  assert.equal(chargeUtile('identite', b, DONNEES).profil!.nom_entreprise, 'Nouveau nom')
  assert.equal(chargeUtile('identite', b, { ...DONNEES, profil: { ...CONFIG, nom_entreprise: '' } }).profil!.nom_entreprise, undefined, 'pas de surcharge : rien à suivre')
  b.organisation.name = '   '
  assert.ok(!('name' in chargeUtile('identite', b, DONNEES).organisation!))
  assert.ok(!CHAMPS_PROFIL.identite.includes('nom_entreprise' as never) && !CHAMPS_ORGANISATION.moyens.length)
})

test('profil vide : les listes ont leurs lignes par défaut (3 années, 4 postes) comme avant', () => {
  const b = brouillonDepuis('moyens', { organisation: ORG, profil: {} })
  assert.equal(b.profil.postes_cles?.length, 4)
  assert.equal(brouillonDepuis('certifications', {}).profil.chiffre_affaires?.length, 3)
})

/* ── sources ─────────────────────────────────────────────────── */

test('le nom du profil (nom_entreprise) n\'est plus affiché : il n\'apparaît que dans la charge utile', () => {
  for (const f of ['FormIdentite', 'FormMoyens', 'FormCertifications', 'RubriquesEntreprise']) {
    assert.doesNotMatch(sansCommentaires(lire(`src/components/entreprise/${f}.tsx`)), /nom_entreprise/, f)
  }
})

test('/company suit le thème clair / nuit', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /PAGES_THEMEES = \[[^\]]*'\/company'/)
})

/* ── T4 : nouvelles informations ──────────────────────────────── */

test('charge utile : les nouveaux champs partent quand ils sont renseignés, les listes vides sont nettoyées', () => {
  const b = brouillonDepuis('identite', DONNEES)
  Object.assign(b.organisation, { forme_juridique: 'SARL', capital_social: '10000', telephone: '02 31 00 00 00', email_contact: 'a@exemple.fr' })
  b.profil.metiers = ['facade_ite']
  const ca = brouillonDepuis('certifications', DONNEES)
  ca.profil.chiffre_affaires = [{ annee: '2025', montant: '1 100 000 €', effectif_moyen: 9 }]
  const c = chargeUtile('identite', b, DONNEES)
  assert.equal(c.organisation!.forme_juridique, 'SARL')
  assert.equal(c.organisation!.capital_social, 10000, 'nombre, pas texte')
  assert.deepEqual(c.profil!.metiers, ['facade_ite'])
  assert.equal((chargeUtile('certifications', ca, DONNEES).profil!.chiffre_affaires as { effectif_moyen: number }[])[0].effectif_moyen, 9)

  const m = brouillonDepuis('moyens', DONNEES)
  m.profil.materiel_liste = [{ quantite: 2, designation: ' Échafaudage ' }, { quantite: 1, designation: '   ' }]
  m.profil.effectifs_par_categorie = [{ categorie: 'chef_equipe', specialite: '', effectif: 2 }, { categorie: 'chef_equipe', specialite: null, effectif: 5 }, { categorie: 'ouvrier', specialite: 'Maçons', effectif: 6 }]
  m.profil.habilitations = [{ type: 'sst', nombre: 3 }, { type: 'sst', nombre: 4 }, { type: 'autre', libelle: '  ', nombre: 1 }, { type: 'autre', libelle: 'Nacelle', nombre: 2, valide_jusqu: '' }]
  m.profil.sous_traitance_part_pct = 15
  const p = chargeUtile('moyens', m, DONNEES).profil!
  assert.deepEqual(p.materiel_liste, [{ quantite: 2, designation: 'Échafaudage' }], 'ligne vide retirée, désignation nettoyée')
  assert.deepEqual(p.effectifs_par_categorie, [{ categorie: 'chef_equipe', specialite: null, effectif: 2 }, { categorie: 'ouvrier', specialite: 'Maçons', effectif: 6 }], 'doublon écarté, spécialité vide = null')
  assert.deepEqual(p.habilitations, [{ type: 'sst', nombre: 3, libelle: null, valide_jusqu: null }, { type: 'autre', libelle: 'Nacelle', nombre: 2, valide_jusqu: null }])
  assert.equal(p.sous_traitance_part_pct, 15)
})

test('un champ de la migration 0029 déjà rempli sur le serveur peut être vidé', () => {
  const d = { ...DONNEES, profil: { ...CONFIG, sous_traitance_partenaires: 'Partenaires inventés', materiel_liste: [{ quantite: 1, designation: 'x' }] } }
  const b = brouillonDepuis('moyens', d)
  b.profil.sous_traitance_partenaires = ''
  b.profil.materiel_liste = []
  const p = chargeUtile('moyens', b, d).profil!
  assert.equal(p.sous_traitance_partenaires, '')
  assert.deepEqual(p.materiel_liste, [])
})

test('listes éditables : le plan crée les lignes neuves, ne modifie que ce qui change, supprime les lignes retirées', () => {
  const serveur = [
    { id: 'a', name: 'Alex Exemple', role: 'Chef', specialite: 'Façades' },
    { id: 'b', name: 'Sam Exemple', role: 'Conducteur', specialite: '' },
    { id: 'c', name: 'Robin Exemple', role: 'Chef', specialite: 'Gros œuvre' },
  ]
  const lignes = [
    { cle: 'a', id: 'a', valeurs: { ...serveur[0], specialite: 'Ravalement' } },
    { cle: 'b', id: 'b', valeurs: { ...serveur[1] } },
    { cle: 'neuf-1', valeurs: { name: 'Lou Exemple', role: 'Apprenti', specialite: '' } },
    { cle: 'neuf-2', valeurs: { name: '', role: '' } },
  ]
  const plan = planifier(serveur, lignes, ['name', 'role', 'specialite'], 'name')
  assert.deepEqual(plan.crees, [{ name: 'Lou Exemple', role: 'Apprenti' }], 'ligne vide ignorée, champ vide non envoyé')
  assert.deepEqual(plan.modifies, [{ id: 'a', changements: { specialite: 'Ravalement' } }])
  assert.deepEqual(plan.supprimes, ['c'])
  assert.ok(planVide(planifier(serveur, lignesDepuis(serveur), ['name', 'role', 'specialite'], 'name')), 'rien n\'a changé : rien à envoyer')
  // un champ vidé repart en chaîne vide (texte) ou null (nombre)
  const mixte = planifier([{ id: 'x', intitule: 'R', annee: 2024 as number | null }], [{ cle: 'x', id: 'x', valeurs: { intitule: 'R', annee: null } }], ['intitule', 'annee'], 'intitule')
  assert.deepEqual(mixte.modifies, [{ id: 'x', changements: { annee: null } }])
})

test('départements : codes séparés par des virgules ou des espaces, sans doublon', () => {
  assert.deepEqual(lireDepartements('14, 50  2a;14'), ['14', '50', '2A'])
  assert.deepEqual(lireDepartements(''), [])
})

test('Moyens : les listes, les effectifs et les personnes clés s\'affichent, sans nom de salarié demandé pour les effectifs', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormMoyens donnees={{ ...DONNEES, equipe: [{ id: 't1', name: 'Alex Exemple', role: 'Conducteur', specialite: 'Façades', experience_years: 12 }] }} /></MemoryRouter></QueryClientProvider>, true)
  for (const t of ['Personnes clés', 'Effectif d&#x27;encadrement', 'Secouristes du travail (SST) : nombre', 'Chefs d&#x27;équipe par spécialité', 'Matériel', 'Véhicules', 'Organisation de la sécurité', 'Gestion et traitement des déchets', 'Ajouter une personne clé']) {
    assert.ok(html.includes(t), t)
  }
  assert.ok(html.includes('value="Alex Exemple"'))
  assert.ok(html.includes('aucun nom de salarié n&#x27;est demandé'))
  assert.ok(!html.includes('Ouvriers et compagnons'), 'l\'utile est replié')
})

test('Identité : forme juridique, e-mail et téléphone en tête, le reste replié', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  for (const t of ['Forme juridique', 'E-mail de l&#x27;entreprise', 'Téléphone']) assert.ok(html.includes(t), t)
  for (const t of ['Capital social', 'Métiers exercés', 'Ville du greffe']) assert.ok(!html.includes(t), `${t} replié`)
})
