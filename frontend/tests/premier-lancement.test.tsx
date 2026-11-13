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

test('Mes AO sans aucun AO : la zone de dépôt, l\'accès à Mon entreprise, ce que fait l\'écran est dit', () => {
  const html = mesAoVide()
  assert.ok(!html.includes('data-synorix-intelligence'), 'pas de scène « À faire maintenant » sans AO')
  assert.ok(!/Aucun (projet|appel)/.test(html), 'le vide n\'est pas annoncé en plus du bloc')
  assert.ok(/Déposez le dossier de l.acheteur/.test(html) && /ZIP/.test(html), 'dit quoi déposer')
  assert.ok(html.includes('href="/company"') && html.includes('Compléter Mon entreprise'), 'un lien vers Mon entreprise')
  assert.ok(html.includes('Trouvés par la veille pour vous'), 'la veille est proposée')
  assert.ok(!html.includes('Votre premier dossier est offert'), 'l\'offre n\'est annoncée que pour un compte à l\'essai intact')
})

import Vault from '@/routes/Vault'
import { lire, sansCommentaires } from './outils/sources'

function coffreVide() {
  const c = new QueryClient()
  c.setQueryData(['documents'], [])
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><Vault /></MemoryRouter></QueryClientProvider>)
}

test('coffre-fort vide : une seule action (« Déposer des documents »), pas six rubriques « Aucun document », unités françaises', () => {
  const html = coffreVide()
  assert.ok(!html.includes('0 documents'), 'pas de « 0 documents stockés »')
  assert.equal((html.match(/Aucun document/g) ?? []).length, 0, 'les rubriques vides ne sont pas listées')
  assert.ok(!/\bMB\b/.test(html) && html.includes('50 Mo'), 'unité française')
  assert.ok(/attestations/i.test(html) && /validité/i.test(html), 'dit à quoi sert le coffre-fort et qu\'il surveille les dates')
  // mission finale, lot c : plus de zone en pointillés au repos ; le seul geste est un bouton
  assert.equal((html.match(/Déposer des documents/g) ?? []).length, 1)
  assert.ok(!html.includes('border-dashed'))
})

test('Paramètres : le rôle s\'affiche en français', () => {
  const src = sansCommentaires(lire('src/routes/Settings.tsx'))
  assert.ok(src.includes('Administrateur'), 'rôle « admin » traduit')
  assert.ok(!/\{user\?\.role \?\? 'admin'\}/.test(src), 'plus d\'identifiant brut')
})

import FirstAOWelcome, { ERREUR_SIRET, siretValide } from '@/components/onboarding/FirstAOWelcome'
import { QuotaRond } from '@/components/layout/QuotaGauge'

test('premier écran : il dit à quoi sert Synorix avant de demander le SIRET', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FirstAOWelcome /></MemoryRouter></QueryClientProvider>)
  // jury, tour 1 : une seule phrase, celle du visage (le sous-titre disait la même chose 80 px plus haut)
  assert.equal((html.match(/Synorix lit/g) ?? []).length, 1, 'ce que fait Synorix est dit une fois')
  assert.ok(html.indexOf('Synorix lit et rédige') > 0 && html.indexOf('Synorix lit et rédige') < html.indexOf('Numéro SIRET'), 'avant le champ SIRET')
  // « Valider » n'est plus un aplat éteint : il reste plein, et une saisie qui n'a pas 14 chiffres est dite sous le champ
  assert.doesNotMatch(html.match(/<button[^>]*>Trouver mon entreprise<\/button>/)?.[0] ?? " disabled=", / disabled=/)
  assert.equal(siretValide('123 456 789 00012'), true)
  assert.equal(siretValide('1234'), false)
  assert.equal(siretValide(''), false)
  assert.ok(/14 chiffres/.test(ERREUR_SIRET) && !/manquant|incomplet|absent|!/.test(ERREUR_SIRET))
  // le fil des sept étapes est dessiné (un rond numéroté par étape), sous un titre qui dit ce qui vient ensuite
  assert.equal((html.match(/rounded-pilule border border-bord-2 bg-surface-0/g) ?? []).length, 7)
  assert.ok(html.includes('Ensuite, les sept étapes') && !html.includes('·</span>'))
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
