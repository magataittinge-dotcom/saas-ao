// La coquille (mission SOCLE § 4) : le rond du compte, le choix du thème et « Animer le fond » dans le menu du compte,
// la barre du haut (56 px et deux actions au téléphone, un seul aplat d'accent), le bandeau « Nouveau » hors coquille.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { RondCompte } from '@/components/layout/MenuCompte'
import { OPTIONS_THEME } from '@/components/layout/BasculeTheme'
import { initialeDuPrenom } from '@/lib/raisonSociale'
import { prenomAffichable } from '@/lib/prenom'
import { choixTheme } from '@/lib/theme'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EntreesBarre } from '@/components/layout/Sidebar'
import { ACCES_PALETTE, BARRE, ONGLETS_TEL, libelleBarre } from '@/components/layout/navigation'
import { StepProgress } from '@/components/project/StepProgress'
import { GabaritEtape } from '@/components/etape/GabaritEtape'
import { AIDE_ETAPES } from '@/components/etape/aideEtape'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('rond du compte : l\'initiale du prénom, sinon une icône de personne ; jamais un tiret, jamais l\'e-mail', () => {
  const avec = renderToStaticMarkup(<RondCompte initiale={initialeDuPrenom(prenomAffichable('Mohamed O.', 'm@x.fr'))} />)
  assert.match(avec, /<span data-initiale="">M<\/span>/)
  const sans = renderToStaticMarkup(<RondCompte initiale={initialeDuPrenom(prenomAffichable('maga.taittinge', 'maga.taittinge@gmail.com'))} />)
  assert.match(sans, /<svg[^>]*data-rond-icone/)
  assert.doesNotMatch(sans, /[—–-]<|maga|>m</i)
  assert.match(renderToStaticMarkup(<RondCompte photo="https://exemple.test/p.png" initiale="M" />), /<img src="https:\/\/exemple\.test\/p\.png" alt=""/)
})

test('thème : « Système · Clair · Nuit » dans le menu du compte ; sans choix enregistré, c\'est « Système »', () => {
  assert.deepEqual(OPTIONS_THEME.map((o) => [o.valeur, o.libelle]), [['system', 'Système'], ['light', 'Clair'], ['dark', 'Nuit']])
  assert.equal(choixTheme(), 'system') // aucun localStorage ici : aucun choix enregistré
  const menu = sansCommentaires(lire('src/components/layout/MenuCompte.tsx'))
  assert.match(menu, /<Menu\.RadioGroup value=\{choix\}/)
  assert.match(menu, /Animer le fond/)
  const theme = sansCommentaires(lire('src/lib/theme.ts'))
  assert.match(theme, /localStorage\.removeItem\(CLE_THEME\)/, '« Système » efface le choix enregistré')
  // le réglage est lu par l'aurore, en plus de prefers-reduced-motion
  const aurore = sansCommentaires(lire('src/components/layout/Aurore.tsx'))
  assert.match(aurore, /useUIStore\(\(s\) => s\.animerFond\)/)
  assert.match(aurore, /data-arretee=\{arretee \|\| !animerFond \? '' : undefined\}/)
  assert.match(sansCommentaires(lire('src/stores/uiStore.ts')), /partialize: \(s\) => \(\{ sidebarCollapsed: s\.sidebarCollapsed, animerFond: s\.animerFond \}\)/)
})

test('barre du haut : 56 px au téléphone, deux actions (recherche et « + »), « Nouvel appel d\'offres » au trait dès que l\'écran a son action', () => {
  const entete = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(entete, /className="conteneur flex h-14 /)
  assert.match(entete, /<span className="max-\[768px\]:hidden"><NotificationBell \/><\/span>/)
  assert.doesNotMatch(entete, /BasculeTheme/)
  assert.match(entete, /const auTrait = aplatsEcran > 0/)
  assert.doesNotMatch(entete, /hover:-translate-y/, 'au survol rien ne bouge (P17)')
  assert.match(entete, /active:scale-\[\.98\]/)
  assert.doesNotMatch(sansCommentaires(lire('src/components/layout/Layout.tsx')), /BandeauNouveau/)
})

const barre = (chemin: string) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><TooltipProvider><MemoryRouter initialEntries={[chemin]}><EntreesBarre /></MemoryRouter></TooltipProvider></QueryClientProvider>)

test('barres : « Entreprise » sur une ligne (nom complet en aria-label et dans Ctrl K) ; l\'entrée active est neutre, seuls l\'icône et le trait portent l\'accent', () => {
  const entree = BARRE.find((e) => e.to === '/company')!
  assert.deepEqual([entree.label, libelleBarre(entree)], ['Mon entreprise', 'Entreprise'])
  assert.equal(libelleBarre(ONGLETS_TEL.find((e) => e.to === '/company')!), 'Entreprise')
  assert.ok(ACCES_PALETTE.some((e) => e.label === 'Mon entreprise'), 'Ctrl K garde le nom complet')
  for (const e of [...BARRE, ...ONGLETS_TEL]) assert.ok(libelleBarre(e).length <= 11 && !libelleBarre(e).includes(' ') || ['Mes AO'].includes(libelleBarre(e)), `${libelleBarre(e)} : une ligne`)
  const html = barre('/company')
  assert.match(html, /<a[^>]*aria-current="page"[^>]*aria-label="Mon entreprise"[^>]*class="[^"]*bg-surface-1 text-fg[^"]*"/)
  assert.match(html, /<span class="whitespace-nowrap text-micro font-medium">Entreprise<\/span>/)
  assert.doesNotMatch(html, /bg-bleu-soft|text-bleu-ink|bg-accent-fill/, 'aucun fond d\'accent dans la coquille (P3)')
  assert.match(html, /w-\[3px\][^"]*bg-accent-ui/)
  assert.match(html, /<svg[^>]*class="[^"]*text-accent-ui/)
  const onglets = sansCommentaires(lire('src/components/layout/BarreOnglets.tsx'))
  assert.match(onglets, /whitespace-nowrap[^']*text-micro font-medium/)
  assert.doesNotMatch(onglets, /text-accent-text|bg-accent-tint/)
  for (const f of ['Sidebar.tsx', 'BarreOnglets.tsx', 'Header.tsx', 'MenuCompte.tsx', 'NotificationBell.tsx']) assert.doesNotMatch(sansCommentaires(lire(`src/components/layout/${f}`)), /\stitle=/, `${f} : infobulle native`)
})

test('coquille d\'un AO : le fil des étapes sans visage ni aplat, un seul h1 (le titre de l\'étape), le « ? » qui déplie trois lignes dans l\'écran', () => {
  const fil = renderToStaticMarkup(<MemoryRouter initialEntries={['/projects/p1/verification']}><StepProgress currentStep={4} completedSteps={{ 1: true, 2: true, 3: true }} onStepClick={() => {}} piecesAJoindre={14} /></MemoryRouter>)
  assert.equal((fil.match(/<button/g) ?? []).length, 7)
  assert.match(fil, /aria-current="step"/)
  assert.match(fil, /data-etat="active"[^>]*border-accent-ui bg-surface-0/)
  assert.doesNotMatch(fil, /bg-accent-fill|accent-fill-solid|style=|<video|<img|data-visage/)
  assert.match(fil, />14 à joindre</)
  const code = sansCommentaires(lire('src/components/project/StepProgress.tsx'))
  assert.doesNotMatch(code, /CompanionOrb|Visage|title=/)
  // le gabarit : un h1 serif ; sans aide, pas de « ? » ; avec, un bouton qui annonce son état
  const sans = renderToStaticMarkup(<GabaritEtape titre="Décider" utilite="Les conditions du marché." />)
  assert.equal((sans.match(/<h1/g) ?? []).length, 1)
  assert.match(sans, /<h1 class="titre-page[^"]*"[^>]*>Décider<\/h1>/)
  assert.doesNotMatch(sans, /data-aide-bouton/)
  const avec = renderToStaticMarkup(<GabaritEtape titre="Décider" utilite="Les conditions du marché." aide={AIDE_ETAPES.analysis} />)
  assert.match(avec, /aria-label="Comprendre cet écran"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="Comprendre cet écran"/)
  assert.doesNotMatch(avec, /data-aide-etape/, 'replié au départ')
  const gabarit = sansCommentaires(lire('src/components/etape/GabaritEtape.tsx'))
  for (const ligne of ['Ce que montre l’écran', 'Ce que vous avez à faire', 'Les mots de l’écran']) assert.ok(gabarit.includes(ligne), ligne)
  assert.doesNotMatch(gabarit, /Tooltip|Infobulle|createPortal|href=/, 'ni bulle flottante, ni lien d\'aide')
  // chaque étape a ses trois lignes, et ses sigles viennent du lexique
  assert.deepEqual(Object.keys(AIDE_ETAPES).sort(), ['analysis', 'export', 'lots', 'memoire', 'plan', 'upload', 'verification'])
  for (const a of Object.values(AIDE_ETAPES)) { assert.ok(a.montre.length > 20 && a.aFaire.length > 20); assert.ok((a.sigles ?? []).every((s) => s.developpe && s.source)) }
  const barreBas = sansCommentaires(lire('src/components/project/BarreEtape.tsx'))
  assert.doesNotMatch(barreBas, /backdrop|blur|animate-spin|signature-btn|style=\{\{/)
  assert.match(barreBas, /variante=\{autreAplat \? 'secondaire' : 'principal'\}/)
})

test('le visage : jamais dans une ligne ou une carte d\'AO, jamais au bout du fil ; « Synorix parle » est le seul composant qui le pose hors de Mon entreprise', () => {
  const porteurs = fichiersSource('src').filter((f) => /data-visage=/.test(sansCommentaires(lire(f))))
  assert.deepEqual(porteurs, ['src/components/entreprise/VisageAnime.tsx', 'src/components/ui/synorix-parle.tsx'])
})
