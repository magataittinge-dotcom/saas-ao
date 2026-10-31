// Accueil (31/10) : la bande « Vos AO en cours », puis la veille (carte et liste, chargées à la demande) ;
// « Synorix Intelligence » est en haut de Mes AO. Le « Bonjour, … » reste le seul h1 de l'accueil.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from '@/routes/Dashboard'
import Projects from '@/routes/Projects'
import BandeAO, { aoDeLaBande } from '@/components/dashboard/BandeAO'
import VeilleAccueil from '@/components/veille/VeilleAccueil'
import { CLES_VEILLE } from '@/hooks/useVeille'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { PROJETS_DEMO, STATS_DEMO } from '@/lib/intelligence/demo'
import type { Project } from '@/types'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'
import { projet, remise } from './outils/projetsFactices'

// Rendu serveur : le magasin d'authentification donne son état initial (aucun utilisateur) → « vous ».
function client(projets: Project[]) {
  const c = new QueryClient()
  c.setQueryData(['projects'], projets)
  c.setQueryData(['dashboard-stats'], STATS_DEMO)
  c.setQueryData(['billing-quota'], { plan: 'pro', analyses: { used: 3, limit: 40 }, memoires: { used: 1, limit: 40 } })
  return c
}
function rendre(projets: Project[]) {
  return renderToStaticMarkup(<QueryClientProvider client={client(projets)}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
}

test('l\'accueil : un seul h1, la bande « Vos AO en cours » (trois au plus), plus de Synorix Intelligence', () => {
  const html = rendre(PROJETS_DEMO)
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'un seul h1')
  assert.ok(/<h1[^>]*>Bonjour, vous<\/h1>/.test(html), 'le « Bonjour » existant est le h1')
  assert.ok(html.includes('data-bande-ao'), 'la bande est rendue')
  assert.ok(/<h2[^>]*id="t-bande"[^>]*>Vos AO en cours/.test(html))
  const cartes = html.match(/data-ao="/g) ?? []
  assert.ok(cartes.length >= 1 && cartes.length <= 3, `${cartes.length} AO dans la bande`)
  assert.ok(html.includes('href="/projects"') && html.includes('Mes AO'), 'lien « Mes AO »')
  assert.ok(!html.includes('data-synorix-intelligence'), 'le visage a quitté l\'accueil')
  assert.ok(!html.includes('data-bulle="'), 'les six bulles aussi')
  // la bande précède la veille ; la veille précède le coffre-fort
  assert.ok(html.indexOf('data-bande-ao') < html.indexOf('id="t-coffre"'))
})

test('la bande garde trois AO au plus, la remise la plus proche d\'abord, et porte le bouton principal sur le plus urgent', () => {
  const sept = Array.from({ length: 7 }, (_, i) => projet(`b${i}`, { name: `AO ${i}`, ...remise(`2026-12-${String(20 - i).padStart(2, '0')}`), current_step: 2 }))
  const ordre = aoDeLaBande(sept).map((p) => p.id)
  assert.deepEqual(ordre, ['b6', 'b5', 'b4'], 'les trois remises les plus proches')
  const html = renderToStaticMarkup(<MemoryRouter><BandeAO projets={sept} total={7} onNouveau={() => {}} /></MemoryRouter>)
  assert.equal((html.match(/data-ao="/g) ?? []).length, 3)
  assert.ok(/<a[^>]*bg-accent-fill[^>]*>Choisir le lot/.test(html), 'bouton principal = prochaine action du plus urgent')
  assert.equal((html.match(/bg-accent-fill/g) ?? []).length, 1, 'un seul bouton principal')
  assert.ok(html.indexOf('data-ao="b6"') < html.indexOf('data-ao="b5"'))
  assert.ok(html.includes('>7<'), 'le total des AO en cours reste affiché')
  // les AO clos n'y figurent pas
  const clos = [projet('c', { status: 'soumis', current_step: 6, ...remise('2026-12-01') })]
  assert.deepEqual(aoDeLaBande(clos), [])
})

test("sans AO : la bande garde son texte, et le bouton « Nouvel appel d'offres » est présent", () => {
  const html = rendre([])
  assert.ok(html.includes('Aucun appel d&#x27;offres en cours'))
  assert.ok(/<button[^>]*>Nouvel appel d&#x27;offres<\/button>/.test(html))
  assert.ok(!/bg-encre|sur-encre/.test(html), 'plus d\'encre sombre écrite en dur')
})

test("le tableau de bord n'importe plus l'ancien Compagnon ni Synorix Intelligence ; la veille est chargée à la demande", () => {
  const code = sansCommentaires(lire('src/routes/Dashboard.tsx'))
  assert.doesNotMatch(code, /CompanionOrb|companionStore|SynorixIntelligence/)
  assert.match(code, /const VeilleAccueil = lazy\(\(\) => import\('@\/components\/veille\/VeilleAccueil'\)\)/)
  assert.match(code, /<Suspense fallback=\{<VeilleEnChargement \/>\}>\s*<VeilleAccueil \/>/)
})

test('la carte et ses données ne sont importées que par l\'accueil, en lazy (jamais par un autre écran, jamais en dur)', () => {
  const intrus: string[] = []
  for (const f of fichiersSource()) {
    if (f.startsWith('src/components/veille/') || f === 'src/lib/veille.ts' || f === 'src/lib/carteFrance.ts' || f === 'src/hooks/useVeille.ts' || f === 'src/services/veille.ts' || f === 'src/services/adresse.ts') continue
    const code = sansCommentaires(lire(f))
    if (/from '@\/(components\/veille|lib\/veille|lib\/carteFrance|hooks\/useVeille|services\/veille|services\/adresse)/.test(code)) intrus.push(f)
    if (/import\('@\/components\/veille\//.test(code) && f !== 'src/routes/Dashboard.tsx') intrus.push(f)
  }
  assert.deepEqual(intrus, [], 'importé en dur ou hors de l\'accueil')
})

test('la veille de l\'accueil : recherche de zone, carte, filtres et liste des avis', () => {
  const c = new QueryClient()
  const filtres = { metiers: [], delai_jours: null, procedures: [], mots_cles: '' }
  c.setQueryData(CLES_VEILLE.preferences, { departements: ['69', '01'], ville: null, filtres, tri: 'date_limite', derniere_visite: null })
  c.setQueryData(CLES_VEILLE.metiers, [{ code: 'cvc', libelle: 'CVC' }])
  c.setQueryData(CLES_VEILLE.comptes(filtres), { comptes: { '69': 12, '01': 3 }, total: 15, actualise_le: '2026-10-31T07:12:00Z', source: 'BOAMP – DILA, licence ouverte' })
  const item = { id: 'a1', id_boamp: 'SIM-1', objet: 'Réhabilitation d\'un groupe scolaire (exemple)', acheteur: 'Commune de Valmont-sur-Exemple', departements: ['69'],
    date_parution: '2026-10-30', date_limite: '2026-12-15', procedure: 'adaptee', procedure_libelle: 'Procédure adaptée', famille: 'Travaux', metiers: ['cvc'],
    url_avis: 'https://exemple.invalid/a', url_dossier: null, nouveau: true }
  c.setQueryData(CLES_VEILLE.avis(['69', '01'], filtres, 'date_limite'), { pages: [{ items: [item], curseur_suivant: 'suite', total: 15 }], pageParams: [null] })
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('data-veille'))
  assert.ok(html.includes('role="combobox"'), 'recherche de zone')
  assert.ok(html.includes('aria-label="Rhône, 12 avis"') && html.includes('aria-label="Ain, 3 avis"'), 'carte avec ses comptes')
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2, 'les deux départements de la zone sont choisis')
  assert.ok(html.includes('Réhabilitation d&#x27;un groupe scolaire (exemple)') && html.includes('>Nouveau<'), 'liste des avis')
  assert.ok(html.includes('Voir plus'), 'curseur suivant')
  assert.ok(html.includes('15 avis ouverts en France') && html.includes('Actualisé le'))
  assert.equal((html.match(/Source : BOAMP – DILA, licence ouverte/g) ?? []).length, 2, 'la source sous la carte et sous la liste')
  assert.ok(/<h2[^>]*>Appels d&#x27;offres ouverts<\/h2>/.test(html) && /<h3[^>]*>Avis ouverts<\/h3>/.test(html), 'niveaux de titre')
})

test('la veille sans zone : « Choisissez une zone sur la carte », la carte et la recherche sont là', () => {
  const c = new QueryClient()
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('Choisissez une zone sur la carte'))
  assert.ok(html.includes('role="combobox"'), 'recherche de zone')
  assert.ok(html.includes('cf-svg') && html.includes('Carte de France'), 'la carte')
})

test('Mes AO : Synorix Intelligence en haut, la liste des AO dessous', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={client(PROJETS_DEMO)}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('data-synorix-intelligence'), 'l\'intelligence est sur Mes AO')
  assert.ok(/<h2[^>]*id="syx-titre"[^>]*>À faire maintenant<\/h2>/.test(html))
  assert.ok((html.match(/Bonjour/g) ?? []).length <= 1, 'un seul « Bonjour » sur Mes AO (celui de l\'intelligence)')
  assert.ok(!/Bonjour/.test(sansCommentaires(lire('src/routes/Projects.tsx'))), 'l\'en-tête de Mes AO ne salue pas une seconde fois')
  assert.equal((html.match(/data-bulle="/g) ?? []).length, 6, 'six bulles')
  assert.ok(html.includes('src="/visage/tete-ouverte-poster.webp"'))
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1)
  assert.ok(html.indexOf('data-synorix-intelligence') < html.indexOf('data-project-id') || !html.includes('data-project-id'), 'l\'intelligence précède la liste')
  assert.ok(html.indexOf('Mes appels d&#x27;offres') < html.indexOf('data-synorix-intelligence'))
})

test("l'écran « premier DCE offert » (affiché sur le tableau de bord) : champ et bouton du socle, visage de public/visage", () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter><FirstAOWelcome /></MemoryRouter></QueryClientProvider>)
  assert.ok(/<h1[^>]*>Bienvenue<\/h1>/.test(html))
  assert.ok(html.includes('Votre SIRET — et c&#x27;est tout : le répertoire Sirene remplit le reste de votre profil.'))
  const champ = html.match(/<input[^>]*aria-label="Numéro SIRET"[^>]*>/)?.[0] ?? ''
  assert.ok(champ.includes('border-input'), 'champ du socle')
  const valider = html.match(/<button[^>]*>Valider<\/button>/)?.[0] ?? ''
  assert.ok(valider.includes('bg-accent-fill'), 'bouton du socle')
  assert.ok(html.includes('src="/visage/tete-ouverte-poster.webp"'), 'le visage est celui de public/visage')
  assert.ok(!/<video|tete-veille|\.webm/.test(html), 'plus de clip vidéo')
}) 
