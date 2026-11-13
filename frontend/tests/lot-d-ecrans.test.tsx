// Lot d — site public, tarifs, pages juridiques, adresse inconnue, erreur, hors ligne, premiers jours.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TableRoutes, ecranPourErreur, estMorceauIntrouvable, morceauxDeDemarrage } from '@/App'
import Landing from '@/routes/Landing'
import Pricing from '@/routes/Pricing'
import Legal from '@/routes/Legal'
import { Route, Routes } from 'react-router-dom'
import { AdresseInconnue, AOIntrouvable } from '@/components/public/EcransEtat'
import { ConnexionInterrompue, ErreurAppli, MorceauIntrouvable, accueilPour } from '@/components/public/EcransHorsRouteur'
import { VideMesAO } from '@/components/mesao/VideMesAO'
import { DOCUMENTS_JURIDIQUES, MENTION_EN_ATTENTE, champsACompleter, decouperDefinitions, mettreEnPage, preparerDocument, sansChampsACompleter, sommaireDe } from '@/lib/pagesJuridiques'
import { decouperTables } from '@/lib/tablesMarkdown'
import { OFFRES, prixLibelle } from '@/lib/offres'
import { RACINE, lire, sansCommentaires } from './outils/sources'

const NB = ' '
const rendre = (noeud: React.ReactNode, adresse = '/') =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[adresse]}>{noeud}</MemoryRouter></QueryClientProvider>)
const nb = (html: string, motif: RegExp) => (html.match(motif) ?? []).length

// ─── F-04 : les pages publiques n'attendent plus Clerk ───
test('F-04 : le site, les tarifs et les pages juridiques s’affichent sans Clerk (aucun ClerkProvider autour, rien de vide)', () => {
  for (const adresse of ['/', '/pricing', '/legal/cgu']) {
    const html = rendre(<TableRoutes />, adresse)
    assert.ok(html.length > 0, `${adresse} : la route rend quelque chose avant que Clerk soit prêt`)
  }
  const app = sansCommentaires(lire('src/App.tsx'))
  assert.doesNotMatch(app, /if \(!clerkReady\) return null/)
  assert.doesNotMatch(app, /data-theme="dark"/, 'le site n’est plus enfermé en nuit')
  for (const f of ['src/routes/Landing.tsx', 'src/routes/Pricing.tsx', 'src/routes/Legal.tsx', 'src/components/public/CoquillePublique.tsx']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /@clerk\//, `${f} ne lit pas Clerk`)
  }
})

// ─── Site public ───
test('site public : un h1, un seul aplat (l’offre telle que le code la donne), « Voir comment ça marche », les sept étapes', () => {
  const html = rendre(<Landing />)
  assert.equal(nb(html, /<h1/g), 1)
  assert.equal(nb(html, /bg-accent-fill/g), 1, 'un seul geste')
  assert.ok(html.includes(`Créer mon compte${NB}: 1 appel d’offres offert`))
  assert.ok(html.includes('Voir comment ça marche') && !html.includes('Voir la démo'), 'A8')
  const ordre = ['Dépôt', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'].map((e) => html.indexOf(`>${e}</p>`))
  assert.ok(ordre.every((p, i) => p > 0 && (i === 0 || p > ordre[i - 1])), 'les sept étapes, dans l’ordre')
  assert.equal(nb(html, /rounded-pilule border border-bord-2 bg-surface-0/g), 7, 'le fil est dessiné : un rond numéroté par étape (jury, tour 1)')
  assert.equal(nb(html, /<h2[^>]*>/g), 3)
  assert.match(html, /\[&amp;&gt;h2\]:text-xl|\[&>h2\]:text-xl/, 'titres de section à 22 px')
  assert.equal(nb(html, /lu dans le contrat/g), 0, 'la colonne des clauses porte une valeur d’exemple, plus quatre fois la même mention')
  assert.ok(html.includes(`Synorix lit et rédige${NB}; vous décidez et vous déposez.`))
  assert.equal(nb(html, /data-synorix-parle/g), 1, 'le visage une fois, à côté de la phrase')
  assert.ok(html.includes('href="/login"') && html.includes('href="/pricing"') && html.includes('href="/legal/mentions-legales"'))
})

test('site public : aucun chiffre ni promesse non sourcés, aucun point d’exclamation, aucune couleur en dur, plus de fausse fenêtre', () => {
  const html = rendre(<Landing />)
  const sansPrix = OFFRES.reduce((t, o) => t.split(prixLibelle(o)).join(''), html.replace(/<svg.*?<\/svg>/gs, ''))
  const texte = sansPrix.replace(/<[^>]+>/g, ' ')
  assert.doesNotMatch(texte, /\d+ ?%|\d+ ?×|\d+x plus|gagnés|soumis|témoign|Propulsé/i)
  assert.doesNotMatch(texte, /!/)
  const src = sansCommentaires(lire('src/routes/Landing.tsx'))
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{6}\b|style=\{\{|synorix\.tech\/dashboard|float-particle|Geist/)
  assert.ok(src.split('\n').length < 200, 'la page tient en moins de 200 lignes')
})

test('tarifs : la coquille du site (logo, page courante marquée dans l’en-tête, pied de page) et la grille du code, un seul aplat', () => {
  const html = rendre(<Pricing />)
  assert.equal(nb(html, /<h1/g), 1)
  assert.ok(/<h1[^>]*>Tarifs<\/h1>/.test(html))
  assert.equal(nb(html, /bg-accent-fill/g), 1)
  // jury, tour 1 : « Retour au site » faisait office de surtitre et l'en-tête perdait « Tarifs » sans dire qu'on y était
  assert.ok(!html.includes('Retour au site') && html.includes('data-coquille-publique') && html.includes('href="/legal/cgv"'))
  assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/pricing"|<a[^>]*href="\/pricing"[^>]*aria-current="page"/)
  assert.ok(html.includes('aria-label="Synorix, accueil du site"'), 'le logo ramène au site')
  for (const o of OFFRES) assert.ok(html.includes(prixLibelle(o)) && html.includes(`href="/register?plan=${o.id}"`), o.nom)
  assert.doesNotMatch(sansCommentaires(lire('src/routes/Pricing.tsx')), /\d+ ?€/, 'aucun prix écrit dans la page')
})

// ─── Pages juridiques ───
const juridique = (slug: string) => readFileSync(path.join(RACINE, 'public/legal', `${slug}.md`), 'utf8')

test('pages juridiques : « [À COMPLÉTER] » ne s’affiche plus tel quel, et rien n’est inventé à sa place', () => {
  assert.equal(sansChampsACompleter('- **SIRET :** [À COMPLÉTER]'), `- **SIRET :** ${MENTION_EN_ATTENTE}`)
  assert.equal(sansChampsACompleter('édité par [À COMPLÉTER] (cf. Mentions légales)'), `édité par ${MENTION_EN_ATTENTE.toLowerCase()} (cf. Mentions légales)`)
  assert.equal(sansChampsACompleter('ressort de [À COMPLÉTER : ville\ndu siège]'), `ressort de ${MENTION_EN_ATTENTE.toLowerCase()}`)
  let champs = 0
  for (const d of DOCUMENTS_JURIDIQUES) {
    const brut = juridique(d.slug)
    champs += champsACompleter(brut).length
    const { titre, corps } = preparerDocument(brut)
    assert.ok(titre && titre.length > 3, `${d.slug} : le titre du document devient le h1`)
    assert.doesNotMatch(corps, /À COMPLÉTER/, d.slug)
    assert.doesNotMatch(corps, /^# /m, `${d.slug} : un seul titre de premier niveau`)
  }
  assert.ok(champs > 0, 'la liste des champs à renseigner reste lisible dans les fichiers (rapport, D11)')
})

test('pages juridiques : les tableaux Markdown sont de vrais tableaux, dans une colonne de lecture', () => {
  for (const slug of ['cookies', 'politique-confidentialite']) {
    const client = new QueryClient()
    client.setQueryData(['page-juridique', slug], juridique(slug))
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/legal/${slug}`]}><Routes><Route path="/legal/:slug" element={<Legal />} /></Routes></MemoryRouter></QueryClientProvider>)
    assert.ok(decouperTables(preparerDocument(juridique(slug)).corps).some((s) => s.type === 'table'))
    assert.ok(html.includes('<table'), `${slug} : tableau rendu`)
    assert.doesNotMatch(html, /\|---|\| ?Nom ?\|/, `${slug} : plus de barres verticales à l’écran`)
    assert.equal(nb(html, /<h1/g), 1)
    assert.ok(html.includes('data-lecture') && html.includes('aria-current="page"'))
    assert.doesNotMatch(html, /À COMPLÉTER/)
  }
})

const rendreJuridique = (slug: string) => {
  const client = new QueryClient()
  client.setQueryData(['page-juridique', slug], juridique(slug))
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/legal/${slug}`]}><Routes><Route path="/legal/:slug" element={<Legal />} /></Routes></MemoryRouter></QueryClientProvider>)
}

test('pages juridiques (jury, tour 1) : un sommaire qui mène à chaque article, des titres d’article qui dominent, la date sous le titre', () => {
  for (const d of DOCUMENTS_JURIDIQUES) {
    const html = rendreJuridique(d.slug)
    const { corps, miseAJour } = mettreEnPage(preparerDocument(juridique(d.slug)).corps)
    const articles = sommaireDe(corps)
    assert.ok(articles.length >= 3, `${d.slug} : des articles`)
    assert.ok(html.includes('aria-label="Sommaire"'), `${d.slug} : sommaire`)
    for (const a of articles) assert.ok(html.includes(`href="#${a.ancre}"`) && html.includes(`id="${a.ancre}"`), `${d.slug} : ${a.titre} a son ancre`)
    assert.equal(new Set(articles.map((a) => a.ancre)).size, articles.length, `${d.slug} : ancres uniques`)
    assert.ok(new RegExp(`<h1[^>]*>${d.titre}</h1>`).test(html), `${d.slug} : le titre de la page, en casse de phrase`)
    assert.ok(miseAJour && html.includes(miseAJour) && !corps.includes('Dernière mise à jour'), `${d.slug} : la date est la sous-ligne du titre, plus un paragraphe en gras`)
    assert.match(html, /<h2 id="[^"]+" class="[^"]*text-xl/, 'titre d’article à 22 px')
    assert.doesNotMatch(html, />\/legal[^<]*<\/a>|>https?:\/\/[^<]*<\/a>/, `${d.slug} : un lien porte un nom, jamais une adresse brute`)
    assert.doesNotMatch(html, /\u26A0/, 'aucun pictogramme d’alerte en couleur')
  }
})

test('pages juridiques : la mention d’attente est dessinée comme un champ ; « libellé : valeur » devient une liste de définitions ; onglets sur une ligne', () => {
  const mentions = rendreJuridique('mentions-legales')
  assert.ok(nb(mentions, /data-en-attente/g) >= 4)
  assert.ok(mentions.includes('<dl') && /<dt[^>]*>SIRET<\/dt>/.test(mentions))
  assert.doesNotMatch(mentions, /flex-wrap gap-x-1/, 'les onglets ne cassent plus sur deux rangées')
  assert.match(mentions, /aria-label="Documents juridiques" class="[^"]*overflow-x-auto/)
  assert.deepEqual(decouperDefinitions('- **A :** 1\n- **B :** 2'), [{ type: 'texte', texte: '- **A :** 1\n- **B :** 2' }], 'deux lignes restent une liste')
  const cookies = rendreJuridique('cookies')
  assert.ok(cookies.includes('md:hidden'), 'au téléphone, chaque valeur du tableau garde le nom de sa colonne')
})

test('pages juridiques : une panne de lecture dit l’erreur et propose « Réessayer », jamais une page blanche', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  await client.prefetchQuery({ queryKey: ['page-juridique', 'cgu'], queryFn: () => Promise.reject(new Error('500')) })
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={['/legal/cgu']}><Routes><Route path="/legal/:slug" element={<Legal />} /></Routes></MemoryRouter></QueryClientProvider>)
  assert.ok(html.includes('Ce document n’a pas pu se charger') && html.includes('Réessayer'))
  assert.doesNotMatch(html, /500|Error/)
})

test('connexion : la carte Clerk dans la coquille du site, sans slogan ; session expirée (F-01) : la phrase, puis le retour à la page d’origine', () => {
  const ecran = sansCommentaires(lire('src/components/public/EcranCompte.tsx'))
  assert.match(ecran, /<CoquillePublique>/)
  for (const f of ['src/routes/Login.tsx', 'src/routes/Register.tsx']) {
    const src = sansCommentaires(lire(f))
    assert.match(src, /<EcranCompte /, f)
    assert.doesNotMatch(src, /10×|plus vite|#[0-9A-Fa-f]{6}\b|style=\{\{|appearance=/, `${f} : ni slogan chiffré, ni couleur en dur, ni second habillage de Clerk`)
  }
  // jamais une page blanche : la coquille tout de suite, un squelette à la place de la carte, l'échec de Clerk dit
  assert.match(ecran, /<AttenteClerk \/>/)
  const attente = sansCommentaires(lire('src/components/public/AttenteClerk.tsx'))
  assert.match(attente, /<ClerkLoading>[\s\S]*<Squelette/)
  assert.match(attente, /<ClerkFailed>[\s\S]*<EtatErreur[\s\S]*onReessayer/)
  assert.match(lire('src/App.tsx'), /return isLoaded && isSignedIn \? <Navigate to=\{apresConnexion\(\)\} replace \/> : <>\{children\}<\/>/)
  const connexion = sansCommentaires(lire('src/routes/Login.tsx'))
  assert.match(connexion, /PHRASE_SESSION_EXPIREE/)
  assert.match(connexion, /forceRedirectUrl=\{retour/)
})

// ─── Adresse inconnue, erreur, hors ligne ───
test('adresse inconnue : un écran, plus un renvoi muet ; connecté, on reste dans l’appli', () => {
  const visiteur = rendre(<AdresseInconnue connecte={false} />)
  const connecte = rendre(<AdresseInconnue connecte />)
  for (const html of [visiteur, connecte]) {
    assert.ok(/<h1[^>]*>Cette adresse n’existe pas<\/h1>/.test(html))
    assert.equal(nb(html, /bg-accent-fill/g), 1)
  }
  // jury, tour 1 : un visiteur n'a pas de dossier ; « Se connecter » est dans l'en-tête du site ; le bas de l'écran est composé
  assert.ok(visiteur.includes('href="/"') && !visiteur.includes('Vos dossiers') && connecte.includes('Vos dossiers ne sont pas touchés'))
  // jury, tour 3 : le slogan recollé sous un filet meublait, et « Voir comment ça marche » menait à la même page : un seul chemin, et le fil d'aurore
  assert.ok(!visiteur.includes('data-synorix-parle') && !visiteur.includes('href="/#comment"') && !connecte.includes('data-synorix-parle'))
  assert.ok(visiteur.includes('fil-aurore') && connecte.includes('fil-aurore'), 'la signature des écrans d’état')
  assert.match(lire('src/App.tsx'), /<CoquillePublique nav=\{<NavSite \/>\}><AdresseInconnue connecte=\{false\} \/>/)
  assert.ok(connecte.includes('href="/dashboard"') && connecte.includes('href="/projects"') && !connecte.includes('href="/"'))
  const ao = rendre(<AOIntrouvable />)
  assert.ok(ao.includes('Cet appel d’offres est introuvable') && ao.includes('href="/projects"'))
  const app = sansCommentaires(lire('src/App.tsx'))
  assert.doesNotMatch(app, /<Navigate to="\/" replace \/>/)
  assert.match(lire('src/App.tsx'), /<Route path="\*" element=\{<AdresseInconnue connecte \/>\} \/>/)
})

test('écran d’erreur : calme, en français, deux gestes ; rien de technique à l’écran, le détail part à la console et à Sentry (F-02)', () => {
  const html = renderToStaticMarkup(<ErreurAppli />)
  assert.ok(html.includes('Recharger la page') && html.includes('Revenir à l’accueil'))
  assert.equal(nb(html, /<h1/g), 1)
  assert.doesNotMatch(html, /Erreur React|stack|Error|undefined|monospace/)
  assert.ok(html.includes('fil-aurore') && html.includes('mailto:contact@synorix.tech'), 'la signature sous le titre ; qui joindre si l’erreur revient')
  assert.doesNotMatch(html, /Rechargez la page/, 'la phrase ne répète plus les deux boutons')
  const horsLigne = renderToStaticMarkup(<ConnexionInterrompue />)
  assert.ok(horsLigne.includes('data-sens="ambre"') && horsLigne.includes('Hors connexion') && horsLigne.includes('role="status"'), 'hors ligne : l’état a son signe')
  const app = sansCommentaires(lire('src/App.tsx'))
  assert.doesNotMatch(app, /error\.stack\}|error\.message\}|Erreur React|style=\{\{/)
  assert.match(app, /componentDidCatch\(/)
  assert.match(app, /Sentry\?\.captureException\?\.\(error/)
  assert.equal(accueilPour('/projects/abc/plan'), '/dashboard')
  assert.equal(accueilPour('/legal/cgu'), '/')
  assert.equal(accueilPour('/'), '/')
})

test('hors ligne : « Connexion interrompue » ; un morceau qui ne se charge pas propose de recharger', () => {
  const morceau = new TypeError('Failed to fetch dynamically imported module: http://localhost/src/routes/Vault.tsx')
  assert.equal(estMorceauIntrouvable(morceau), true)
  assert.equal(estMorceauIntrouvable(new Error('x is not a function')), false)
  assert.equal(ecranPourErreur(morceau, false), 'hors-ligne')
  assert.equal(ecranPourErreur(new Error('x is not a function'), false), 'hors-ligne')
  assert.equal(ecranPourErreur(morceau, true), 'morceau')
  assert.equal(ecranPourErreur(new Error('x is not a function'), true), 'erreur')
  const horsLigne = renderToStaticMarkup(<ConnexionInterrompue />)
  assert.ok(/<h1[^>]*>Connexion interrompue<\/h1>/.test(horsLigne) && horsLigne.includes('se rechargera seul'))
  assert.match(sansCommentaires(lire('src/components/public/EcransHorsRouteur.tsx')), /addEventListener\('online', recharger\)/)
  const version = renderToStaticMarkup(<MorceauIntrouvable />)
  assert.ok(version.includes('Recharger la page'))
  for (const html of [horsLigne, version]) assert.doesNotMatch(html, /Failed|fetch|module/)
})

// ─── Premiers jours ───
test('Mes AO sans AO : la page du système, un seul geste (déposer), aligné à gauche ; le partage des rôles est dit sous « Ensuite, sept étapes », sans visage (jury, tour 3)', () => {
  const html = rendre(<VideMesAO />)
  assert.ok(/<h1[^>]*>Mes appels d’offres<\/h1>/.test(html))
  assert.equal(nb(html, /<h1/g), 1)
  assert.equal(nb(html, /bg-accent-fill/g), 1)
  assert.ok(html.includes('Choisir des fichiers'))   // FIN-B1 : la zone accepte plusieurs fichiers à la fois
  assert.equal(nb(html, /data-synorix-parle/g), 0, 'le slogan n’est pas une phrase de Synorix sur cet écran')
  assert.ok(html.includes(`Synorix lit et rédige${NB}; vous décidez et vous déposez.`) && html.includes('Ensuite, sept étapes'))
  assert.doesNotMatch(html.slice(html.indexOf('data-zone-depot'), html.indexOf('Ensuite, sept étapes')), /text-center|place-items-center|justify-items-center/, 'la zone de dépôt part du bord gauche')
  const src = sansCommentaires(lire('src/components/mesao/VideMesAO.tsx'))
  assert.doesNotMatch(src, /uppercase|VisagePetit|rounded-\[|text-\[/)
})

test('typographie : aucun repère d’espace insécable resté dans un texte affiché, et les deux-points de l’écran d’erreur tiennent à leur mot', () => {
  const html = renderToStaticMarkup(<ErreurAppli />)
  assert.ok(html.includes(`écrivez-nous${NB}: `))
  for (const f of ['src/components/public/EcransHorsRouteur.tsx', 'src/components/public/EcransEtat.tsx', 'src/components/public/CoquillePublique.tsx',
    'src/routes/Landing.tsx', 'src/routes/Pricing.tsx', 'src/routes/Legal.tsx', 'src/routes/Login.tsx', 'src/routes/Register.tsx',
    'src/components/onboarding/FirstAOWelcome.tsx', 'src/components/onboarding/FilSeptEtapes.tsx', 'src/components/mesao/VideMesAO.tsx']) {
    assert.ok(!lire(f).includes('␣'), f)
  }
})

test('démarrage sur une adresse connectée : la coquille et l’écran partent avec Clerk ; jamais sur le site public', () => {
  for (const chemin of ['/dashboard', '/projects', '/projects/new', '/projects/ao-1/export', '/vault', '/company', '/settings', '/settings/billing', '/outils']) {
    assert.equal(morceauxDeDemarrage(chemin).length, 2, chemin)
  }
  for (const chemin of ['/', '/login', '/register', '/pricing', '/legal/cgv', '/adresse-inconnue']) {
    assert.deepEqual(morceauxDeDemarrage(chemin), [], chemin)
  }
})
