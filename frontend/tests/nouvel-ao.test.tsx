// Phase C — Nouvel AO : l'écran suit le thème (route listée dans PAGES_THEMEES), les champs sont ceux du socle
// avec une étiquette associée, le bouton est le bouton du socle ; les textes ne changent pas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewProject from '@/routes/NewProject'
import { lire, sansCommentaires } from './outils/sources'

const html = renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><NewProject /></MemoryRouter></QueryClientProvider>)

test('les textes de l\'écran sont inchangés', () => {
  for (const t of ['Nouvel appel d&#x27;offres', 'Remplissez les informations de base pour démarrer', 'Nom du projet *',
    'Maître d&#x27;ouvrage', 'Date limite de réponse', 'Créer le projet →', 'Vous déposerez les documents du DCE à l&#x27;étape suivante']) {
    assert.ok(html.includes(t), t)
  }
  assert.ok(/<h1[^>]*>Nouvel appel d&#x27;offres<\/h1>/.test(html), 'un seul h1')
})

test('chaque champ a une étiquette associée et vient du socle (bord de champ à 3:1)', () => {
  for (const id of ['nom-projet', 'maitre-ouvrage', 'date-limite']) {
    assert.ok(html.includes(`for="${id}"`), `étiquette de ${id}`)
    const balise = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
    assert.ok(balise.includes('border-input'), `champ ${id} du socle`)
  }
  assert.ok(!/glass-input|btn-primary/.test(html), 'plus de classes héritées')
})

test('le bouton « Créer le projet » est le bouton du socle', () => {
  const bouton = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? ''
  assert.ok(bouton.includes('bg-accent-fill'), 'dégradé d\'accent')
  assert.ok(html.includes('>Créer le projet →</button>'))
})

test('la route /projects/new suit le thème clair / nuit', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /PAGES_THEMEES = \[[^\]]*'\/projects\/new'/)
})
