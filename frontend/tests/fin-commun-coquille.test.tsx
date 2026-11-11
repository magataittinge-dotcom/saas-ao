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
