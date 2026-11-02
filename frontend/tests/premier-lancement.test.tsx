// Phase C (premier lancement) — chaque écran vide dit à quoi il sert et propose UNE action.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Projects from '@/routes/Projects'
import { STATS_DEMO } from '@/lib/intelligence/demo'

function mesAoVide() {
  const c = new QueryClient()
  c.setQueryData(['projects'], [])
  c.setQueryData(['dashboard-stats'], STATS_DEMO)
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
}

test('Mes AO sans aucun AO : un seul bloc, une seule action, ce que fait l\'écran est dit', () => {
  const html = mesAoVide()
  const boutons = (html.match(/<button[^>]*>[^<]*(?:<[^>]+>[^<]*)*?<\/button>/g) ?? []).filter((b) => /AO|appel/i.test(b))
  assert.equal(boutons.length, 1, `une seule action pour créer un AO (${boutons.length} trouvées)`)
  assert.ok(!html.includes('data-synorix-intelligence'), 'pas de scène « À faire maintenant » sans AO')
  assert.ok(!/Aucun (projet|appel)/.test(html), 'le vide n\'est pas annoncé en plus du bloc')
  assert.ok(/dossier/i.test(html) && /ZIP/.test(html), 'dit quoi déposer')
})

import Vault from '@/routes/Vault'
import { lire, sansCommentaires } from './outils/sources'

function coffreVide() {
  const c = new QueryClient()
  c.setQueryData(['documents'], [])
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><Vault /></MemoryRouter></QueryClientProvider>)
}

test('coffre-fort vide : une seule action (la zone de dépôt), pas six rubriques « Aucun document », unités françaises', () => {
  const html = coffreVide()
  assert.ok(!html.includes('0 documents'), 'pas de « 0 documents stockés »')
  assert.equal((html.match(/Aucun document/g) ?? []).length, 0, 'les rubriques vides ne sont pas listées')
  assert.ok(!/\bMB\b/.test(html) && html.includes('50 Mo'), 'unité française')
  assert.ok(/attestations/i.test(html) && /validité/i.test(html), 'dit à quoi sert le coffre-fort et qu\'il surveille les dates')
  assert.ok(html.includes('Glissez vos documents ici ou cliquez pour parcourir'))
})

test('Paramètres : le rôle s\'affiche en français', () => {
  const src = sansCommentaires(lire('src/routes/Settings.tsx'))
  assert.ok(src.includes('Administrateur'), 'rôle « admin » traduit')
  assert.ok(!/\{user\?\.role \?\? 'admin'\}/.test(src), 'plus d\'identifiant brut')
})

import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { QuotaRond } from '@/components/layout/QuotaGauge'

test('premier écran : il dit à quoi sert Synorix avant de demander le SIRET', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FirstAOWelcome /></MemoryRouter></QueryClientProvider>)
  assert.ok(/appel d&#x27;offres|dossier de l&#x27;acheteur/.test(html) && /mémoire technique/.test(html), 'dit ce que fait Synorix')
  assert.ok(html.indexOf('mémoire technique') < html.indexOf('Numéro SIRET'), 'avant le champ SIRET')
  assert.ok(!html.includes('!'), 'sans point d\'exclamation')
})

test('la jauge de la barre dit « % » : un « 0 » seul dans un rond ne veut rien dire', () => {
  const c = new QueryClient()
  c.setQueryData(['billing-quota'], { plan: 'free', period_start: null, period_end: null, analyses: { used: 0, limit: 1 }, memoires: { used: 0, limit: 1 } })
  const html = renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><QuotaRond /></MemoryRouter></QueryClientProvider>)
  assert.ok(/>0 ?%<|>0&nbsp;%<|>0%</.test(html), 'le pourcentage est écrit avec son signe')
})

test('fiche à télécharger : le hook reprend le contrôleur au montage (sinon, en développement, l\'aperçu reste « Mise à jour »)', () => {
  const src = sansCommentaires(lire('src/components/fiche/useApercuFiche.ts'))
  assert.ok(src.indexOf('controleur.reprendre()') > -1 && src.indexOf('controleur.reprendre()') < src.indexOf('controleur.abonner'))
})
