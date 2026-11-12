// Accueil (31/10) : la bande « Vos AO en cours », puis la veille (carte et liste, chargées à la demande) ;
// Mes AO a son propre écran (résumé, « À la une », une ligne par AO). Le « Bonjour, … » reste le seul h1 de l'accueil.
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

// Des AO dont la remise est loin devant (2099) ou loin derrière (2020) : les tests ne dépendent pas du jour où ils tournent.
const A_VENIR = [
  projet('v1', { name: 'AO à venir un', status: 'analyzed', current_step: 2, ...remise('2099-03-10') }),
  projet('v2', { name: 'AO à venir deux', status: 'en_cours', current_step: 2, ...remise('2099-02-01') }),
]
const PASSES = [
  projet('p1', { name: 'AO passé un', status: 'brouillon', current_step: 1, ...remise('2020-01-15') }),
  projet('p2', { name: 'AO passé deux', status: 'en_cours', current_step: 6, completed_steps: { 5: true }, ...remise('2020-02-15') }),
]

test('l’accueil : un seul h1, la bande des AO en cours (trois au plus), un visage au plus, plus de Synorix Intelligence', () => {
  const html = rendre([...A_VENIR, ...PASSES])
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'un seul h1')
  assert.ok(/<h1[^>]*>Bonjour<\/h1>/.test(html), 'le « Bonjour » (sans prénom connu) est le h1')
  assert.ok(html.includes('fil-aurore'), 'le fil d’aurore reste sous le « Bonjour »')
  assert.ok(html.includes('data-bande-ao'), 'la bande est rendue')
  assert.ok(/<h2[^>]*id="t-bande"[^>]*>Vos appels d’offres en cours/.test(html))
  assert.equal((html.match(/data-ao="/g) ?? []).length, 2, 'les deux AO en cours')
  assert.ok(html.includes('href="/projects"') && html.includes('Tous mes appels d’offres'), 'lien vers Mes AO')
  assert.ok(!html.includes('data-synorix-intelligence'), 'le visage animé a quitté l’accueil')
  assert.ok(!html.includes('data-bulle="'), 'les six bulles aussi')
  assert.ok((html.match(/data-visage=""/g) ?? []).length <= 1, 'un visage au plus, à côté d’une phrase de Synorix')
  assert.ok(!html.includes('data-visage-petit'), 'plus de visage en vignette (pastille de l’entreprise)')
  // la bande précède la veille ; la veille précède le suivi de l'entreprise
  assert.ok(html.indexOf('data-bande-ao') < html.indexOf('id="t-suivi"'))
})

test('« en cours » ne se contredit plus : une remise passée est « à mettre à jour », sa seule action est « Mettre à jour le statut », aucun statut brut', () => {
  const html = rendre([...A_VENIR, ...PASSES])
  // les deux remises passées sortent des AO en cours, et l'écran le dit (défaut 1 du fondateur)
  assert.equal((html.match(/data-remise-passee="/g) ?? []).length, 2)
  assert.ok(html.includes('2 appels d’offres ont dépassé leur date de remise'), 'Synorix le dit, une fois')
  const passe = html.split('data-remise-passee="p2"')[1].split('</li>')[0]
  assert.ok(passe.includes('Mettre à jour le statut'))
  assert.ok(!/Télécharger|Exporter|\/export/.test(passe), 'jamais « Télécharger le dossier » sur une remise passée')
  assert.ok(!/brouillon|analyzed|en_cours|>en cours</.test(html), 'les statuts ne s’écrivent plus tels que la base les donne')
  assert.ok(!html.includes('Aucun appel d’offres en cours'), 'jamais « aucun » au-dessus d’AO en cours')
  // que des remises passées : le titre de la bande le dit, pas « en cours »
  const quePasses = rendre(PASSES)
  assert.ok(/<h2[^>]*id="t-bande"[^>]*>À mettre à jour/.test(quePasses))
  assert.ok(!quePasses.includes('Vos appels d’offres en cours'))
})

test('la bande garde trois AO au plus, la remise la plus proche d’abord ; chaque AO a un bouton au verbe de sa prochaine action, un seul plein (la prochaine remise)', () => {
  const sept = Array.from({ length: 7 }, (_, i) => projet(`b${i}`, { name: `AO ${i}`, ...remise(`2099-12-${String(20 - i).padStart(2, '0')}`), current_step: 2 }))
  const ordre = aoDeLaBande(sept).map((p) => p.id)
  assert.deepEqual(ordre, ['b6', 'b5', 'b4'], 'les trois remises les plus proches')
  const html = renderToStaticMarkup(<MemoryRouter><BandeAO projets={sept} onNouveau={() => {}} /></MemoryRouter>)
  assert.equal((html.match(/data-ao="/g) ?? []).length, 3)
  assert.equal((html.match(/<a[^>]*data-variante="(principal|secondaire)"[^>]*>Choisir le lot/g) ?? []).length, 3, 'un bouton au verbe de la prochaine action')
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 1, 'un seul bouton plein : la prochaine remise')
  assert.ok(html.indexOf('data-variante="principal"') < html.indexOf('data-ao="b5"'), 'le bouton plein est sur le premier AO')
  assert.ok(!/>Reprendre</.test(html), 'jamais « Reprendre »')
  assert.ok(html.indexOf('data-ao="b6"') < html.indexOf('data-ao="b5"'))
  assert.ok(html.includes('>7<'), 'le total des AO en cours reste affiché')
  assert.ok(html.includes('Voir les 4 autres dans Mes AO'), 'le reste est dans Mes AO')
  // les AO clos n'y figurent pas
  const clos = [projet('c', { status: 'soumis', current_step: 6, ...remise('2099-12-01') })]
  assert.deepEqual(aoDeLaBande(clos), [])
})

test('500 AO à mettre à jour : l’accueil en montre trois et renvoie à Mes AO (plus de page de 12 000 px)', () => {
  const cinqCents = Array.from({ length: 500 }, (_, i) => projet(`m${i}`, { name: `AO ${i}`, ...remise('2020-03-01') }))
  const html = renderToStaticMarkup(<MemoryRouter><BandeAO projets={cinqCents} onNouveau={() => {}} /></MemoryRouter>)
  assert.equal((html.match(/data-remise-passee="/g) ?? []).length, 3)
  assert.ok(html.includes('Voir les 497 autres dans Mes AO'))
})

test("sans AO : la bande dit ce qui apparaîtra ici, et le bouton « Nouvel appel d’offres » est présent", () => {
  const html = rendre([])
  assert.ok(html.includes('Aucun appel d’offres en cours'))
  assert.ok(/<button[^>]*>Nouvel appel d’offres<\/button>/.test(html))
  assert.ok(!/bg-encre|sur-encre/.test(html), 'plus d’encre sombre écrite en dur')
})

test('une panne du serveur n’est jamais « vous n’avez rien » : l’Accueil et Mes AO disent leur erreur et proposent « Réessayer »', () => {
  const enPanne = () => {
    // retryOnMount: false : au rendu serveur, la requête en échec reste « en erreur » (sinon elle se dit « en chargement »)
    const c = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
    const q = c.getQueryCache().build(c, { queryKey: ['projects'] })
    q.setState({ ...q.state, status: 'error', error: new Error('500'), fetchStatus: 'idle', errorUpdateCount: 1, errorUpdatedAt: Date.now() })
    return c
  }
  const accueil = renderToStaticMarkup(<QueryClientProvider client={enPanne()}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
  assert.ok(accueil.includes('Vos appels d’offres n’ont pas pu se charger') && accueil.includes('Réessayer'))
  assert.ok(!accueil.includes('Aucun appel d’offres en cours'), 'pas le texte de l’état vide')
  const mesAO = renderToStaticMarkup(<QueryClientProvider client={enPanne()}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
  assert.ok(mesAO.includes('Vos appels d’offres n’ont pas pu se charger') && mesAO.includes('Réessayer'))
  assert.ok(!mesAO.includes('Votre premier dossier se prépare ici'), 'pas l’écran du premier dossier : le client croirait ses AO perdus')
  assert.equal((mesAO.match(/<h1[\s>]/g) ?? []).length, 1)
})

test("le tableau de bord n’importe plus l’ancien Compagnon ni Synorix Intelligence ; la veille est chargée à la demande", () => {
  const code = sansCommentaires(lire('src/routes/Dashboard.tsx'))
  assert.doesNotMatch(code, /CompanionOrb|companionStore|SynorixIntelligence/)
  assert.match(code, /const VeilleAccueil = lazy\(\(\) => import\('@\/components\/veille\/VeilleAccueil'\)\)/)
  assert.match(code, /<Suspense fallback=\{<VeilleEnChargement \/>\}>\s*<VeilleAccueil \/>/)
})

test('la carte et ses données ne sont importées que par l’accueil, en lazy (jamais par un autre écran, jamais en dur)', () => {
  const intrus: string[] = []
  for (const f of fichiersSource()) {
    if (f.startsWith('src/components/veille/') || f === 'src/lib/veille.ts' || f === 'src/lib/carteFrance.ts' || f === 'src/hooks/useVeille.ts' || f === 'src/services/veille.ts' || f === 'src/services/adresse.ts') continue
    const code = sansCommentaires(lire(f))
    if (/from '@\/(components\/veille|lib\/veille|lib\/carteFrance|hooks\/useVeille|services\/veille|services\/adresse)/.test(code)) intrus.push(f)
    // l'accueil, et l'écran vide de Mes AO (trois avis pour la zone enregistrée), les chargent à la demande
    if (/import\('@\/components\/veille\//.test(code) && f !== 'src/routes/Dashboard.tsx' && f !== 'src/components/mesao/VideMesAO.tsx') intrus.push(f)
  }
  assert.deepEqual(intrus, [], 'importé en dur ou hors de l’accueil')
})

test('la veille de l’accueil : recherche de zone, carte, filtres et liste des avis', () => {
  const c = new QueryClient()
  const filtres = { metiers: [], delai_jours: null, procedures: [], mots_cles: '' }
  c.setQueryData(CLES_VEILLE.preferences, { departements: ['69', '01'], ville: null, filtres, tri: 'date_limite', derniere_visite: null })
  c.setQueryData(CLES_VEILLE.metiers, [{ code: 'cvc', libelle: 'CVC' }])
  c.setQueryData(CLES_VEILLE.comptes(filtres), { comptes: { '69': 12, '01': 3 }, total: 15, actualise_le: '2026-10-31T07:12:00Z', source: 'BOAMP – DILA, licence ouverte' })
  const item = { id: 'a1', id_boamp: 'SIM-1', objet: 'Réhabilitation d’un groupe scolaire (exemple)', acheteur: 'Commune de Valmont-sur-Exemple', departements: ['69'],
    date_parution: '2026-10-30', date_limite: '2026-12-15', procedure: 'adaptee', procedure_libelle: 'Procédure adaptée', famille: 'Travaux', metiers: ['cvc'],
    url_avis: 'https://exemple.invalid/a', url_dossier: null, nouveau: true }
  c.setQueryData(CLES_VEILLE.avis(['69', '01'], filtres, 'date_limite'), { pages: [{ items: [item], curseur_suivant: 'suite', total: 15 }], pageParams: [null] })
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('data-veille'))
  assert.ok(html.includes('role="combobox"'), 'recherche de zone')
  assert.ok(html.includes('aria-label="Rhône, 12 avis"') && html.includes('aria-label="Ain, 3 avis"'), 'carte avec ses comptes')
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2, 'les deux départements de la zone sont choisis')
  assert.ok(html.includes('Réhabilitation d’un groupe scolaire (exemple)') && html.includes('>Nouveau<'), 'liste des avis')
  assert.ok(html.includes('Afficher plus'), 'curseur suivant')
  assert.ok(html.includes('15 avis ouverts en France') && html.includes('Dernier relevé du BOAMP'), 'un relevé ancien est dit une fois, dans la phrase de la veille')
  assert.equal((html.match(/Source : Avis officiels du BOAMP \(DILA\), licence ouverte/g) ?? []).length, 1, 'la source est écrite une fois, sous la liste')
  assert.ok(/<h2[^>]*id="titre-veille"[^>]*>.*Veille<\/h2>/.test(html) && /<h3[^>]*>Avis ouverts<\/h3>/.test(html), 'niveaux de titre')
})

test('la veille sans zone : « Choisissez une zone sur la carte », la carte et la recherche sont là ; pendant la lecture des préférences, le squelette', () => {
  const c = new QueryClient()
  // préférences pas encore lues : ni « Choisissez une zone » ni filtres, la liste est en attente
  const attente = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(!attente.includes('Choisissez une zone sur la carte') && attente.includes('Chargement des avis') && !attente.includes('data-filtres-colles'))
  c.setQueryData(CLES_VEILLE.preferences, { departements: [], ville: null, filtres: { metiers: [], delai_jours: null, procedures: [], mots_cles: '' }, tri: 'date_limite', derniere_visite: null })
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><VeilleAccueil /></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('Choisissez une zone sur la carte'))
  assert.ok(html.includes('role="combobox"'), 'recherche de zone')
  assert.ok(html.includes('cf-svg') && html.includes('Carte de France'), 'la carte')
})

test('Mes AO : on arrive sur du travail en cours — en-tête, résumé, « À la une » (la prochaine remise), une ligne par AO avec le verbe de la fonction d’état', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={client([...A_VENIR, ...PASSES])}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1)
  assert.ok(/role="group"[^>]*aria-label="Résumé de mes appels d’offres"/.test(html), 'la bande de résumé du système')
  assert.equal((html.match(/data-case-resume=""/g) ?? []).length, 3, 'trois cases de résumé : « À mettre à jour » est dit par sa section, une seule fois')
  // étiquette + gros chiffre seul : « En cours » puis « 2 », jamais « 2 en cours » ni « 2 en cours. » sous le titre
  assert.ok(/>En cours<\/p><\/div><p data-valeur="nombre"[^>]*><span class="chiffre-grand">2<\/span><\/p>/.test(html), 'En cours : le chiffre seul')
  assert.ok(!/2 en cours/.test(html), 'la sous-ligne ne redit pas la première case')
  assert.ok(html.includes('>Aucune<'), 'rien à compter : « Aucune » (remise sous 7 jours), jamais un gros 0')
  // « À la une » = la prochaine remise à venir (v2), sans visage ; le seul bouton plein de l'écran
  assert.ok(html.includes('data-a-la-une="v2"'), '« À la une » : la remise la plus proche parmi celles à venir')
  assert.ok(!html.includes('data-visage'), 'aucun visage en vignette d’un AO')
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 1)
  assert.ok(!html.includes('data-synorix-intelligence') && !html.includes('data-bulle='), 'plus de visage animé ni de bulles')
  assert.ok(!/>Continuer</.test(html), 'jamais « Continuer » : le bouton porte le verbe de la prochaine action')
  assert.ok(html.indexOf('À la une') < html.indexOf('data-ligne-ao'), '« À la une » précède la liste')
  // trois groupes : en cours, à mettre à jour (seule action : le statut), terminés
  assert.ok(/id="titre-en-cours"[^>]*>En cours/.test(html) && /id="titre-a-mettre-a-jour"[^>]*>À mettre à jour/.test(html))
  const passe = html.split('data-ligne-ao="p2"')[1].split('</tr>')[0]
  assert.ok(!passe.includes('Remise passée') && (passe.match(/<button/g) ?? []).length === 1 && html.includes('Ouvrez une ligne pour dire ce que le dossier est devenu'), 'ni pastille ni bouton répétés : la rangée entière est le geste')
  assert.ok(!/Télécharger le dossier|\/export/.test(passe), 'jamais « Télécharger le dossier » sur une remise passée')
  assert.ok(!/Bonjour/.test(sansCommentaires(lire('src/routes/Projects.tsx'))), 'l’en-tête de Mes AO ne salue pas')
})

test('Mes AO sans remise à venir : pas de bloc « À la une », aucun bouton plein', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={client(PASSES)}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
  assert.ok(!html.includes('À la une') && !html.includes('data-a-la-une'))
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 0)
  // jury, tour 1 : rien en cours, aucune remise proche : plus de cases, une ligne de faits
  assert.ok(html.includes('data-resume-ligne') && html.includes('Aucun appel d’offres en cours') && !html.includes('data-case-resume'), 'une ligne de faits, sans case')
})

test('Mes AO, 500 AO : des pages de 50 (« 1–50 sur 500 »), jamais 500 lignes d’un bloc', () => {
  const cinqCents = Array.from({ length: 500 }, (_, i) => projet(`m${i}`, { name: `AO ${i}`, ...remise('2020-03-01') }))
  const html = renderToStaticMarkup(<QueryClientProvider client={client(cinqCents)}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
  assert.equal((html.match(/data-ligne-ao="/g) ?? []).length, 50)
  assert.ok(html.includes('1–50 sur 500'))
})

test("l’écran du premier dossier (affiché sur le tableau de bord) : page, champ et bouton du socle, le visage à côté de la phrase de Synorix", () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter><FirstAOWelcome /></MemoryRouter></QueryClientProvider>)
  assert.ok(/<h1[^>]*>Bienvenue<\/h1>/.test(html))
  assert.equal((html.match(/<h1/g) ?? []).length, 1, 'un seul h1')
  assert.ok(html.includes('le répertoire Sirene remplit le reste de votre profil.'))
  const champ = html.match(/<input[^>]*aria-label="Numéro SIRET"[^>]*>/)?.[0] ?? ''
  assert.ok(champ.includes('border-bord-champ'), 'champ du socle')
  const valider = html.match(/<button[^>]*>Valider<\/button>/)?.[0] ?? ''
  assert.ok(valider.includes('bg-accent-fill'), 'bouton du socle')
  assert.equal((html.match(/bg-accent-fill/g) ?? []).length, 1, 'un seul aplat d’accent')
  // A6 : les sept étapes dans l'ordre, et le partage des rôles dit par Synorix (le visage, une fois)
  assert.ok(html.includes('Synorix lit et rédige ; vous décidez et vous déposez.'))
  const ordre = ['Dépôt', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'].map((e) => html.indexOf(`>${e}<`))
  assert.ok(ordre.every((p, i) => p > 0 && (i === 0 || p > ordre[i - 1])), 'les sept étapes, dans l’ordre')
  assert.equal((html.match(/data-synorix-parle/g) ?? []).length, 1, 'le visage une fois, à côté de la phrase')
  assert.ok(!/<video|tete-veille|\.webm/.test(html), 'plus de clip vidéo')
  assert.ok(!/[!—]/.test(html.replace(/<!--.*?-->/g, '')), 'ni point d’exclamation ni tiret long')
})

test('Mes AO : la recherche est le champ du système (pilule, 44 px, contour à 3:1), le tri la liste déroulante du système', () => {
  const src = sansCommentaires(lire('src/routes/Projects.tsx'))
  assert.match(src, /<ChampRecherche placeholder="Nom, acheteur, lot…"/)
  assert.match(src, /<ListeDeroulante libelle="Trier par"/)
  assert.doesNotMatch(src, /<input\b|<select\b|glass-input/)
  const champ = sansCommentaires(lire('src/components/ui/champ.tsx'))
  assert.match(champ, /border-bord-champ/)
  assert.match(champ, /placeholder:text-fg-3/)
})
