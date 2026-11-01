// Mon entreprise (T2, T3) — trois rubriques (colonnes à l'ordinateur, onglets au téléphone), avancement calculé depuis
// les données chargées, un seul formulaire et un seul « Enregistrer » par rubrique, charge utile identique à l'ancienne.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Company from '@/routes/Company'
import FormIdentite from '@/components/entreprise/FormIdentite'
import FormMoyens from '@/components/entreprise/FormMoyens'
import FormCertifications from '@/components/entreprise/FormCertifications'
import RubriquesEntreprise, { gabaritColonnes, lienFiche } from '@/components/entreprise/RubriquesEntreprise'
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
const panneaux = { identite: <i>identité</i>, moyens: <i>moyens</i>, certifications: <i>certifs</i> }

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
  assert.deepEqual(avancement(DONNEES, 'identite'), { rempli: 8, total: 12 })
  assert.deepEqual(avancement({ ...DONNEES, profil: { ...CONFIG, activites: '  ' } }, 'identite'), { rempli: 7, total: 12 })
  assert.deepEqual(avancement({}, 'identite'), { rempli: 0, total: 12 })
  assert.deepEqual([avancement({}, 'moyens').total, avancement({}, 'certifications').total], [9, 13], '12 + 9 + 13 = 34 informations indispensables (étude § 1)')
  assert.equal(INFORMATIONS.filter((i) => i.niveau === 'indispensable').length, 34, 'la jauge compte les 34 indispensables de l\'étude')
  assert.equal(libelleAvancement({ rempli: 11, total: 14 }), '11 informations sur 14')
  assert.equal(libelleAvancement({ rempli: 1, total: 14 }), '1 information sur 14')
  assert.equal(libelleAvancement({ rempli: 0, total: 14 }), '0 information sur 14')
})

test('avancement : les pièces du coffre comptent tant qu\'elles ne sont pas à renouveler ; une référence prête a ses champs principaux', () => {
  assert.equal(etatPiece(DONNEES.documents, ['kbis']), 'au_coffre')
  assert.equal(etatPiece(DONNEES.documents, ['urssaf']), 'a_renouveler')
  assert.equal(etatPiece(DONNEES.documents, ['fiscal']), 'a_joindre')
  assert.equal(avancement(DONNEES, 'certifications').rempli, 6, 'Kbis + intitulé, maître d\'ouvrage, lieu, montant et année de la référence (ni nature des travaux ni mode d\'intervention)')
  assert.deepEqual(aRenseigner(DONNEES, 'certifications').filter((l) => l.startsWith('Référence')), ['Référence : nature des travaux', "Référence : mode d'intervention"])
  assert.equal(avancement({ ...DONNEES, references: [{ ...DONNEES.references![0], description: 'Façades', mode_intervention: 'direct' }] }, 'certifications').rempli, 8)
  assert.equal(avancement({ ...DONNEES, references: [] }, 'certifications').rempli, 1, 'sans référence, aucune des sept informations n\'est comptée')
  const declare = { ...DONNEES, qualifications: [{ famille: 'assurance' as const, intitule: 'Décennale' }, { famille: 'assurance' as const, intitule: 'Responsabilité civile' }, { famille: 'qualification' as const, intitule: 'Qualibat 7112' }] }
  assert.equal(avancement(declare, 'certifications').rempli, 9, 'qualification et assurances déclarées comptent comme les pièces du coffre')
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

test('ordinateur : trois colonnes, la choisie s\'élargit, les autres se resserrent et gardent titre, avancement et « Fiche »', () => {
  assert.equal(gabaritColonnes('identite'), '2.3fr 0.85fr 0.85fr')
  assert.equal(gabaritColonnes('moyens'), '0.85fr 2.3fr 0.85fr')
  assert.equal(gabaritColonnes('certifications'), '0.85fr 0.85fr 2.3fr')
  const html = rendre(<MemoryRouter><RubriquesEntreprise donnees={DONNEES} rubrique="moyens" onChoisir={() => {}} panneaux={panneaux} /></MemoryRouter>, true)
  assert.match(html, /grid-template-columns:0\.85fr 2\.3fr 0\.85fr/)
  assert.equal(compte(html, /<h2/g), 3)
  assert.equal(compte(html, /aria-expanded="true"/g), 1)
  assert.equal(compte(html, /aria-expanded="false"/g), 2)
  assert.match(html, /<h2[^>]*><button[^>]*aria-expanded="true"[^>]*>Moyens humains et matériels<\/button><\/h2>/)
  for (const r of RUBRIQUES) assert.ok(html.includes(`href="/entreprise/fiche/${r.id}"`), `lien Fiche ${r.id}`)
  assert.equal(lienFiche('certifications'), '/entreprise/fiche/certifications')
  assert.ok(html.includes('informations sur 9'), 'avancement affiché')
  assert.equal(compte(html, /<i>moyens<\/i>/g), 1, 'seul le formulaire de la rubrique choisie est monté')
  assert.equal(compte(html, /<i>identité<\/i>/g), 0)
  assert.match(html, /motion-safe:transition-\[grid-template-columns\]/, 'mouvement réduit : pas d\'animation de largeur')
})

test('téléphone : des onglets (rôle tablist), un seul panneau monté', () => {
  const html = rendre(<MemoryRouter><RubriquesEntreprise donnees={DONNEES} rubrique="identite" onChoisir={() => {}} panneaux={panneaux} /></MemoryRouter>, false)
  assert.match(html, /role="tablist"/)
  assert.equal(compte(html, /role="tab"/g), 3)
  assert.equal(compte(html, /<i>identité<\/i>/g), 1)
  assert.equal(compte(html, /<i>moyens<\/i>/g), 0)
  assert.ok(html.includes('/entreprise/fiche/identite'), 'la Fiche de la rubrique choisie')
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
  for (const t of ['Qualifications professionnelles', 'Assurances', 'Références de chantiers', 'Ajouter une qualification', 'Ajouter une assurance', 'Ajouter une référence', 'Assureur inventé']) assert.ok(html.includes(t), t)
  assert.ok(html.includes('École (exemple)') && html.includes('Nature des travaux réalisés') && html.includes('Montant HT'))
  assert.ok(!/manquant|incomplet|absent/i.test(html))
  assert.ok(!html.includes('Afficher le nom complet'), 'client public : pas de case « nom complet »')
})

test('Certifications : un client particulier n\'est nommé que par ses initiales, sauf case cochée (RGPD, 0031)', () => {
  const particulier = { ...DONNEES, references: [{ id: 'r2', intitule: 'Extension (exemple)', maitre_ouvrage: 'Mme Dubois', client_type: 'particulier' as const }] }
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormCertifications donnees={particulier} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('Afficher le nom complet du client sur les fiches et dans le mémoire'))
  assert.ok(html.includes('initiales (Mme D.)'), 'aperçu des initiales que le serveur écrira')
  assert.ok(!/checked/.test(html), 'décochée par défaut')
  assert.equal(initialesClient('Jean-Pierre Martin'), 'J.-P. M.')
  assert.equal(initialesClient('M. Ali Ben Salah'), 'M. A. B. S.')
  assert.equal(initialesClient(''), '')
})

test('Identité : étiquettes associées aux champs, SIRET en lecture seule, le reste à la demande (« Afficher plus »)', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  assert.ok(html.includes('value="Entreprise de démonstration"'), 'le nom vient de l\'organisation')
  assert.ok(!html.includes('Ancien nom'), 'le nom du profil n\'est pas montré')
  for (const label of ['Nom de l&#x27;entreprise', 'SIRET', 'Adresse du siège', 'Nom du dirigeant', 'Fonction du dirigeant', 'Activités principales']) {
    assert.ok(html.includes(label), label)
  }
  assert.match(html, /readOnly=""|readonly=""/)
  assert.match(html, /aria-expanded="false"[^>]*>Afficher plus/)
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
  assert.deepEqual(c.profil!.chiffre_affaires, CONFIG.chiffre_affaires)
  // Moyens : le profil seulement (PUT /memoire-config), rien pour l'organisation
  const m = chargeUtile('moyens', brouillonDepuis('moyens', DONNEES), DONNEES)
  assert.equal(m.organisation, null)
  const anciens = CHAMPS_PROFIL.moyens.filter((k) => !['effectifs_par_categorie', 'habilitations', 'materiel_liste', 'vehicules_liste', 'sous_traitance_partenaires', 'sous_traitance_part_pct', 'sav_garantie'].includes(k))
  assert.deepEqual(Object.keys(m.profil!).sort(), [...anciens].sort(), 'un profil sans nouvelle information envoie exactement les anciens champs')
  assert.deepEqual(m.profil!.postes_cles, CONFIG.postes_cles)
  assert.equal(m.profil!.materiel, 'Échafaudages')
  // Certifications : ni organisation ni profil (qualifications et références ont leurs routes)
  assert.deepEqual(chargeUtile('certifications', brouillonDepuis('certifications', DONNEES), DONNEES), { organisation: null, profil: null })
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
  assert.equal(brouillonDepuis('identite', {}).profil.chiffre_affaires?.length, 3)
})

/* ── sources ─────────────────────────────────────────────────── */

test('le nom du profil (nom_entreprise) n\'est plus affiché : il n\'apparaît que dans la charge utile', () => {
  for (const f of ['FormIdentite', 'FormMoyens', 'FormCertifications', 'RubriquesEntreprise']) {
    assert.doesNotMatch(sansCommentaires(lire(`src/components/entreprise/${f}.tsx`)), /nom_entreprise/, f)
  }
})

test('la barre d\'enregistrement reste dans la zone de défilement (sticky), jamais fixed sous les onglets du téléphone', () => {
  const code = sansCommentaires(lire('src/components/entreprise/champs.tsx'))
  assert.match(code, /sticky bottom-0/)
  assert.doesNotMatch(code, /fixed bottom-0/)
})

test('/company suit le thème clair / nuit', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /PAGES_THEMEES = \[[^\]]*'\/company'/)
})

/* ── T4 : nouvelles informations ──────────────────────────────── */

test('charge utile : les nouveaux champs partent quand ils sont renseignés, les listes vides sont nettoyées', () => {
  const b = brouillonDepuis('identite', DONNEES)
  Object.assign(b.organisation, { forme_juridique: 'SARL', capital_social: '10000', telephone: '02 31 00 00 00', email_contact: 'a@exemple.fr' })
  b.profil.metiers = ['facade_ite']
  b.profil.chiffre_affaires = [{ annee: '2025', montant: '1 100 000 €', effectif_moyen: 9 }]
  const c = chargeUtile('identite', b, DONNEES)
  assert.equal(c.organisation!.forme_juridique, 'SARL')
  assert.equal(c.organisation!.capital_social, 10000, 'nombre, pas texte')
  assert.deepEqual(c.profil!.metiers, ['facade_ite'])
  assert.equal((c.profil!.chiffre_affaires as { effectif_moyen: number }[])[0].effectif_moyen, 9)

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

test('Identité : forme juridique, e-mail, téléphone et effectif moyen en tête, le reste replié', () => {
  const html = rendre(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FormIdentite donnees={DONNEES} /></MemoryRouter></QueryClientProvider>, true)
  for (const t of ['Forme juridique', 'E-mail de l&#x27;entreprise', 'Téléphone', 'Effectif moyen annuel', 'À renseigner']) assert.ok(html.includes(t), t)
  for (const t of ['Capital social', 'Métiers exercés', 'Ville du greffe']) assert.ok(!html.includes(t), `${t} replié`)
})
