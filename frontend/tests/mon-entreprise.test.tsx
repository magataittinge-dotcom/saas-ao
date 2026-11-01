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
import { INFORMATIONS, RUBRIQUES, aRenseigner, avancement, etatPiece, libelleAvancement, referenceRenseignee, type DonneesEntreprise } from '@/lib/entreprise/avancement'
import { CHAMPS_ORGANISATION, CHAMPS_PROFIL, brouillonDepuis, chargeUtile } from '@/lib/entreprise/charges'
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
  assert.deepEqual(avancement(DONNEES, 'identite'), { rempli: 8, total: 8 })
  assert.deepEqual(avancement({ ...DONNEES, profil: { ...CONFIG, activites: '  ' } }, 'identite'), { rempli: 7, total: 8 })
  assert.deepEqual(avancement({}, 'identite'), { rempli: 0, total: 8 })
  assert.equal(libelleAvancement({ rempli: 11, total: 14 }), '11 informations sur 14')
  assert.equal(libelleAvancement({ rempli: 1, total: 14 }), '1 information sur 14')
  assert.equal(libelleAvancement({ rempli: 0, total: 14 }), '0 information sur 14')
})

test('avancement : les pièces du coffre comptent tant qu\'elles ne sont pas à renouveler ; une référence prête a ses champs principaux', () => {
  assert.equal(etatPiece(DONNEES.documents, ['kbis']), 'au_coffre')
  assert.equal(etatPiece(DONNEES.documents, ['urssaf']), 'a_renouveler')
  assert.equal(etatPiece(DONNEES.documents, ['fiscal']), 'a_joindre')
  assert.equal(avancement(DONNEES, 'certifications').rempli, 2, 'Kbis + une référence')
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
  assert.ok(html.includes('2 informations sur 5') || html.includes('informations sur'), 'avancement affiché')
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

test('chaque rubrique : un seul formulaire, un seul bouton ; Certifications : pièces et références, rien à enregistrer', () => {
  const client = new QueryClient()
  const enveloppe = (el: React.ReactElement) => rendre(<QueryClientProvider client={client}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>, true)
  for (const el of [<FormIdentite donnees={DONNEES} />, <FormMoyens donnees={DONNEES} />]) {
    const html = enveloppe(el)
    assert.equal(compte(html, /<form/g), 1)
    assert.equal(compte(html, /type="submit"/g), 1)
    assert.equal(compte(html, />Enregistrer</g), 1)
  }
  const certifs = enveloppe(<FormCertifications donnees={DONNEES} />)
  assert.equal(compte(certifs, /type="submit"/g), 0)
  assert.ok(certifs.includes('Au coffre-fort') && certifs.includes('À renouveler') && certifs.includes('À joindre'))
  assert.ok(certifs.includes('1 référence, dont 1 prête à citer'))
  assert.ok(certifs.includes('href="/vault"') && certifs.includes('href="/references"'))
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
  assert.deepEqual(c.organisation, { name: ORG.name, address: ORG.address, presentation: ORG.presentation })
  assert.deepEqual(Object.keys(c.profil!).sort(), [...CHAMPS_PROFIL.identite, 'nom_entreprise'].sort())
  assert.equal(c.profil!.gerant_nom, 'Camille Démo')
  assert.deepEqual(c.profil!.chiffre_affaires, CONFIG.chiffre_affaires)
  // Moyens : le profil seulement (PUT /memoire-config), rien pour l'organisation
  const m = chargeUtile('moyens', brouillonDepuis('moyens', DONNEES), DONNEES)
  assert.equal(m.organisation, null)
  assert.deepEqual(Object.keys(m.profil!).sort(), [...CHAMPS_PROFIL.moyens].sort())
  assert.deepEqual(m.profil!.postes_cles, CONFIG.postes_cles)
  assert.equal(m.profil!.materiel, 'Échafaudages')
  // Certifications : rien à écrire
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
