// Phase C — tableau de bord : « Synorix Intelligence » est branché sous le seul h1 (« Bonjour, … »),
// le bouton « Nouvel AO » de l'état vide est le bouton du socle (plus d'encre sombre écrite en dur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from '@/routes/Dashboard'
import { PROJETS_DEMO, STATS_DEMO } from '@/lib/intelligence/demo'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

// Rendu serveur : le magasin d'authentification donne son état initial (aucun utilisateur) → « vous ».
function rendre(projets: Project[]) {
  const client = new QueryClient()
  client.setQueryData(['projects'], projets)
  client.setQueryData(['dashboard-stats'], STATS_DEMO)
  client.setQueryData(['billing-quota'], { plan: 'pro', analyses: { used: 3, limit: 40 }, memoires: { used: 1, limit: 40 } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
}

test('le tableau de bord rend Synorix Intelligence en h2, sous un seul h1', () => {
  const html = rendre(PROJETS_DEMO)
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'un seul h1')
  assert.ok(/<h1[^>]*>Bonjour, vous<\/h1>/.test(html), 'le « Bonjour » existant est le h1')
  assert.ok(html.includes('data-synorix-intelligence'), 'Synorix Intelligence est rendu')
  assert.ok(/<h2[^>]*id="syx-titre"[^>]*>Synorix Intelligence<\/h2>/.test(html), 'son titre est un h2')
  assert.equal((html.match(/data-bulle="/g) ?? []).length, 6, 'six bulles')
  // le visage vient de public/visage (poster en repli), jamais d'une autre source
  assert.ok(html.includes('src="/visage/tete-ouverte-poster.webp"'))
  // l'intelligence précède la liste des AO
  assert.ok(html.indexOf('data-synorix-intelligence') < html.indexOf('id="t-ao"'))
})

test("sans AO : l'état vide garde son texte, et le bouton « Nouvel AO » est celui du socle", () => {
  const html = rendre([])
  assert.ok(html.includes('Aucun appel d&#x27;offres en cours'))
  assert.ok(/<button[^>]*bg-accent-fill[^>]*>[\s\S]*?Nouvel AO<\/button>/.test(html), 'bouton du socle (dégradé d\'accent)')
  assert.ok(!/bg-encre|sur-encre/.test(html), 'plus d\'encre sombre écrite en dur')
})

test("le tableau de bord n'importe plus l'ancien Compagnon (le visage est celui de Synorix Intelligence)", () => {
  const code = sansCommentaires(lire('src/routes/Dashboard.tsx'))
  assert.match(code, /import SynorixIntelligence from '@\/components\/intelligence\/SynorixIntelligence'/)
  assert.doesNotMatch(code, /CompanionOrb|companionStore/)
})
