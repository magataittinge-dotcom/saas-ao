// S1 — la barre à 5 entrées, chacune avec son nom écrit sous l'icône (visible sans survol, donc sur tablette aussi) ;
// la déconnexion vit dans le menu du compte (la photo), pas dans la barre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EntreesBarre } from '@/components/layout/Sidebar'
import { BARRE } from '@/components/layout/navigation'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'
import { contrasteJetons, type Theme } from './outils/jetons'

const rendu = (chemin = '/dashboard') => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><TooltipProvider><MemoryRouter initialEntries={[chemin]}><EntreesBarre /></MemoryRouter></TooltipProvider></QueryClientProvider>,
)

test('la barre compte cinq entrées : Accueil, Mes AO, Mon entreprise, Coffre-fort, Paramètres', () => {
  assert.deepEqual(BARRE.map((e) => [e.to, e.label]), [
    ['/dashboard', 'Accueil'], ['/projects', 'Mes AO'], ['/company', 'Mon entreprise'], ['/vault', 'Coffre-fort'], ['/settings', 'Paramètres'],
  ])
})

test('le rendu de la barre écrit le nom de chaque entrée sous son icône, sans survol', () => {
  const html = rendu()
  const liens = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
  assert.equal(liens.length, 5)
  for (const [, href, contenu] of liens) {
    const entree = BARRE.find((e) => e.to === href)
    assert.ok(entree, href)
    assert.match(contenu, new RegExp(`<span[^>]*text-\\[11px\\][^>]*>${entree.label}</span>`), `${href} : nom visible en 11 px`)
  }
})

test('aucune entrée « Retenue de garantie », « Équipe » ni « Mes références » dans la barre', () => {
  const html = rendu()
  for (const mot of ['Retenue de garantie', 'Équipe', 'Mes références', 'Déconnexion']) assert.ok(!html.includes(mot), mot)
  assert.deepEqual(BARRE.filter((e) => ['/outils', '/team', '/references'].includes(e.to)), [])
})

test('l\'entrée de la page courante est marquée active, et elle seule', () => {
  const actives = (chemin: string) => [...rendu(chemin).matchAll(/<a ([^>]*)>/g)].filter((m) => m[1].includes('aria-current="page"')).map((m) => m[1].match(/href="([^"]+)"/)?.[1])
  assert.deepEqual(actives('/projects/abc/memoire'), ['/projects'])
  assert.deepEqual(actives('/entreprise/fiche/moyens'), ['/company'])
  assert.deepEqual(actives('/dashboard'), ['/dashboard'])
})

test('chaque entrée est une cible d\'au moins 44 px, et la barre passe de 64 à 76 px', () => {
  const code = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.match(code, /min-h-14/) // 56 px
  assert.match(code, /w-\[76px\]/)
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /min-\[769px\]:pl-\[108px\]/) // 16 + 76 + 16
})

test('la déconnexion est dans le menu du compte (la photo), plus dans la barre', () => {
  const barre = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.doesNotMatch(barre, /LogOut/)
  assert.match(barre, /MenuCompte/)
  const menu = sansCommentaires(lire('src/components/layout/MenuCompte.tsx'))
  assert.match(menu, /Déconnexion/)
  assert.match(menu, /useLogout/)
})

test('le nom sous l\'icône dépasse 4,5:1, au repos et sur l\'entrée active, en clair comme en nuit', () => {
  const faibles: string[] = []
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const [texte, fond] of [['--text-2', '--surface-1'], ['--accent-text', '--accent-tint'], ['--text-1', '--surface-2']]) {
      const { minimum } = contrasteJetons(theme, texte, fond)
      if (minimum < 4.5) faibles.push(`${theme} ${texte} sur ${fond} : ${minimum.toFixed(2)}`)
    }
  }
  assert.deepEqual(faibles, [])
})

test('aucun fichier de la coquille ne garde d\'ancienne liste TRAVAIL / CAPITAL / COMPTE', () => {
  const fautifs = fichiersSource('src').filter((f) => /\b(TRAVAIL|CAPITAL|COMPTE)\b/.test(sansCommentaires(lire(f))) && /navigation/.test(lire(f)))
  assert.deepEqual(fautifs, [])
})
