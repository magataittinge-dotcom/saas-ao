// Jury, tour 1 (11/11/2026) — les défauts communs de la coquille, corrigés une fois pour tous les écrans.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import LegalFooter from '@/components/layout/LegalFooter'
import { lire, sansCommentaires } from './outils/sources'

test('pied de page : sur la grille du contenu (le conteneur de la coquille), plus de largeur à lui', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LegalFooter /></MemoryRouter>)
  assert.match(html, /<footer[^>]*data-coquille="pied"[^>]*><div class="conteneur /)
  assert.doesNotMatch(html, /max-w-\[1680px\]|max-w-6xl|mx-auto|px-6/)
})

test('pied de page au téléphone : deux rangées de trois (cinq liens et le copyright), aucun mot seul sur sa ligne', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LegalFooter /></MemoryRouter>)
  assert.match(html, /max-md:grid max-md:grid-cols-\[auto_auto_auto\]/)
  assert.match(html, /<nav[^>]*class="[^"]*max-md:contents/)
  assert.equal((html.match(/<a /g) ?? []).length, 5)
  assert.match(html, /<span class="[^"]*max-md:order-last[^"]*">© \d{4} Synorix<\/span>/)
})

test('la coquille ne force plus la nuit sur un écran : <main> ne porte un thème que si la liste le demande, et elle ne le demande plus', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /export const estThemee = \(_pathname: string\) => true/)
})

// ── Typographie fine ──
test('chiffres proportionnels dans le texte courant et les dates ; tabulaires seulement sur demande (`.chiffres`)', () => {
  const css = lire('src/index.css')
  const body = css.slice(css.indexOf('  body {'), css.indexOf('  h1, h2, h3'))
  assert.doesNotMatch(body.replace(/\/\*[\s\S]*?\*\//g, ''), /tnum|tabular-nums/, 'plus de chasse fixe héritée : « Mercredi 1 1 novembre »')
  assert.match(css, /\.chiffres \{ font-variant-numeric: tabular-nums lining-nums; \}/)
  // la valeur en texte d'une case (une date, un nom) n'est pas une colonne de nombres
  assert.doesNotMatch(sansCommentaires(lire('src/components/ui/case-resume.tsx')), /data-valeur="texte" className="chiffres/)
})

test('fil d\'Ariane : jamais « Mes AO / » sans suite ; Abonnement et Retenue de garantie ont un chemin de retour', () => {
  const h = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(h, /\{idAO \|\| parent\s*\? <span data-fil-courant=""[^>]*aria-current="page">\{label\}<\/span>/)
  // au téléphone : le retour seul, avec son chevron (la barre y porte la recherche, la cloche et le compte)
  assert.match(h, /<ChevronLeft[^>]*min-\[769px\]:hidden/)
  assert.match(h, /data-fil-courant="" className="[^"]*max-\[768px\]:hidden"/)
  assert.match(h, /'\/outils':\s+\{ parent: 'Paramètres', parentTo: '\/settings', label: 'Retenue de garantie' \}/)
  assert.match(h, /'\/settings\/billing': \{ parent: 'Paramètres', parentTo: '\/settings', label: 'Abonnement' \}/)
})

// ── La coquille ──
import { ONGLETS_TEL, BARRE, estActif, libelleBarre } from '@/components/layout/navigation'
import BarreOnglets from '@/components/layout/BarreOnglets'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

test('Abonnement et Retenue de garantie gardent l\'entrée « Paramètres » active', () => {
  assert.equal(estActif('/settings/billing', '/settings'), true)
  assert.equal(estActif('/outils', '/settings'), true)
  assert.equal(estActif('/outils', '/company'), false)
})

test('barre du bas : les cinq entrées du bureau, mêmes noms ; libellés en 11 px, dans leur propre balise', () => {
  assert.deepEqual(ONGLETS_TEL.map(libelleBarre), BARRE.map(libelleBarre))
  assert.equal(libelleBarre(ONGLETS_TEL[4]), 'Paramètres')
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/settings']}><BarreOnglets /></MemoryRouter></QueryClientProvider>)
  const libelles = [...html.matchAll(/<span data-libelle-onglet="" class="([^"]*)">([^<]+)<\/span>/g)]
  assert.deepEqual(libelles.map((m) => m[2]), ['Accueil', 'Mes AO', 'Entreprise', 'Coffre-fort', 'Paramètres'])
  for (const m of libelles) assert.match(m[1], /text-micro/, `${m[2]} en 11 px`)
  assert.doesNotMatch(html, />Compte</)
  assert.match(html, /<a aria-current="page"[^>]*href="\/settings"|href="\/settings"[^>]*aria-current="page"/)
})

test('au téléphone, la cloche et le compte sont dans la barre du haut ; « Déconnexion » est écrit', () => {
  const h = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(h, /^\s*<NotificationBell \/>$/m)
  assert.doesNotMatch(h, /max-\[768px\]:hidden"><NotificationBell/)
  assert.match(h, /<CompteTel className="min-\[769px\]:hidden" \/>/)
  const o = sansCommentaires(lire('src/components/layout/BarreOnglets.tsx'))
  assert.match(o, /<LogOut[^>]*\/>\s*Déconnexion/)
  assert.doesNotMatch(o, /aria-label="Déconnexion"/, 'plus une icône seule')
  assert.doesNotMatch(o, /NotificationBell/)
})

test('barre latérale : le survol ne pose plus de fond (deux entrées semblaient sélectionnées) ; voile des dialogues plus dense', () => {
  const rail = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.match(rail, /actif \? 'bg-surface-1 text-fg' : 'text-fg-2 hover:text-fg'/)
  assert.match(lire('src/styles/theme.css'), /--scrim: rgba\(6, 22, 32, \.52\);/, 'écrit par scripts/palette-visage.mjs')
})

// ── Le panneau des notifications ──
import { accorder, quandNotification } from '@/components/layout/NotificationBell'

test('notifications : les pluriels entre parenthèses et les accords faux du serveur sont accordés à l\'affichage', () => {
  assert.equal(accorder('605 exigence(s) extraite(s)'), '605 exigences relevées') // accordé, et dans les mots du produit
  assert.equal(accorder('1 exigence(s) extraite(s) et 2 lot(s) à relancer'), '1 exigence relevée et 2 lots à relancer')
  assert.equal(accorder('Remise dans 1 jours'), 'Remise demain')
  assert.equal(accorder('Le mémoire du projet « X » est généré. Relisez-le avant export.'), 'Le mémoire de l’appel d’offres « X » est rédigé. Relisez-le avant l’export.')
  assert.equal(accorder('AO Mairie — remise dans 3 jours'), 'AO Mairie — remise dans 3 jours')
  assert.equal(accorder('Analyse terminée'), 'Analyse terminée')
})

test('notifications : la date en mots entiers ; au-delà d\'une semaine, le jour (« 3 nov. »)', () => {
  const maintenant = Date.parse('2026-11-11T10:00:00+01:00')
  const ilYA = (ms: number) => quandNotification(new Date(maintenant - ms).toISOString(), maintenant)
  assert.equal(ilYA(20_000), 'à l’instant')
  assert.equal(ilYA(12 * 60_000), 'il y a 12 min')
  assert.equal(ilYA(3 * 3_600_000), 'il y a 3 h')
  assert.equal(ilYA(26 * 3_600_000), 'hier')
  assert.equal(ilYA(4 * 86_400_000), 'il y a 4 jours')
  assert.match(ilYA(8 * 86_400_000), /^3 nov\.?$/)
  assert.doesNotMatch(ilYA(15 * 86_400_000), / j$/)
  const code = sansCommentaires(lire('src/components/layout/NotificationBell.tsx'))
  assert.match(code, />Tout marquer comme lu</)
  assert.match(code, /'line-clamp-2 text-sm'/)
  assert.doesNotMatch(code, /line-clamp-2 block/, '`block` annule la coupe à deux lignes')
})

test('infobulle : un trait d\'un pixel, pas d\'ombre grise diffuse', () => {
  const t = sansCommentaires(lire('src/components/ui/tooltip.tsx'))
  assert.match(t, /border-bord-2 bg-surface-pop/)
  assert.doesNotMatch(t, /shadow-toast|shadow-pop/)
})
