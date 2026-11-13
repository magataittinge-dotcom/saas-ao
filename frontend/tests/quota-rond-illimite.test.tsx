// Recette du 4/11 — le rond « ∞ » de la barre latérale (offre illimitée) déroutait. Depuis le 11/11/2026 (décision du
// fondateur), aucune offre n'est illimitée : chaque offre, Business compris, a son anneau et son pourcentage ; plus de « ∞ ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QuotaRond } from '@/components/layout/QuotaGauge'
import { lire, sansCommentaires } from './outils/sources'

const rendre = (quota: unknown) => {
  const c = new QueryClient()
  c.setQueryData(['billing-quota'], quota)
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><QuotaRond /></MemoryRouter></QueryClientProvider>)
}
const BUSINESS = { plan: 'business', analyses: { used: 7, limit: 70 }, memoires: { used: 2, limit: 70 } }
const UNITES = { plan: 'pro', analyses: { used: 15, limit: 30 }, memoires: { used: 12, limit: 30 } }

test('Business a son anneau comme les autres offres, jamais de « ∞ »', () => {
  const html = rendre(BUSINESS)
  assert.match(html, />10%</)
  assert.match(html, /Analyses 7 \/ 70 · Mémoires 2 \/ 70/)
  assert.doesNotMatch(html, /∞|illimit/)
})

test('offre à unités : la jauge reste, avec son pourcentage', () => {
  const html = rendre(UNITES)
  assert.match(html, /50%/)
  assert.match(html, /href="\/settings\/billing"/)
})

test('la barre latérale et le menu du téléphone montrent le même anneau, sans option « illimité »', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Sidebar.tsx')), /<QuotaRond \/>/)
  assert.match(sansCommentaires(lire('src/components/layout/BarreOnglets.tsx')), /<QuotaRond \/>/)
  assert.doesNotMatch(sansCommentaires(lire('src/components/layout/QuotaGauge.tsx')), /masquerIllimite|∞/)
})

// Migration 40 → 30 (11/11/2026) : une organisation Pro déjà à 35 analyses ce mois-ci lit 100 %, jamais plus.
test('au-delà du nouveau quota : l’anneau plafonne à 100 %', () => {
  assert.match(rendre({ plan: 'pro', analyses: { used: 35, limit: 30 }, memoires: { used: 3, limit: 30 } }), />100%</)
})

// Jury, tour 1 (bloquant, accueil-quota-atteint et abonnement-quota-atteint) : « 100% » débordait de son anneau.
test('quota atteint : « 100% » tient dans l\'anneau (anneau de 40 px, chiffre en 11 px, sans chasse fixe)', () => {
  const html = rendre({ plan: 'pro', analyses: { used: 30, limit: 30 }, memoires: { used: 12, limit: 30 } })
  assert.match(html, />100%</)
  const anneau = html.match(/<svg[^>]*data-anneau-quota[^>]*>/)?.[0] ?? ''
  assert.match(anneau, /size-10/, 'anneau de 40 px : 31 px de creux')
  const chiffre = html.match(/<span[^>]*data-chiffre-quota[^>]*>/)?.[0] ?? ''
  assert.match(chiffre, /text-micro/, 'chiffre en 11 px : « 100% » fait 27 px')
  assert.doesNotMatch(chiffre, /tabular-nums|text-xs|text-sm/)
})

// Business est l'offre la plus haute (11/11/2026) : à son quota, le mur ne propose pas de « passer au niveau supérieur »
// ni de nouvel abonnement (le paiement refuserait une organisation déjà abonnée) ; il dit le refus du serveur, tel quel.
test('mur d’abonnement en Business : le refus du serveur, sans grille d’offres', () => {
  const code = sansCommentaires(lire('src/components/common/SubscriptionWall.tsx'))
  assert.match(code, /\?\.plan\) === 'business'/)
  // COR-B1 (jury, tour 3 : un dialogue sans issue) : en Business, un petit dialogue rendu AVANT la grille, avec le fait en
  // titre, la phrase du serveur et une issue vers Paramètres > Abonnement ; ni grille, ni mention de résiliation.
  const business = code.slice(code.indexOf('if (business) {'), code.indexOf('<GrilleOffres'))
  assert.match(business, /^if \(business\) \{\s*return \(\s*<Dialogue [^\n]*taille="petit"/)
  assert.match(business, /Vos analyses du mois sont utilisées/)
  assert.match(business, /description=\{message \?\?/)
  assert.match(business, /versPage\('\/settings\/billing', 'Voir mon abonnement'\)/)
  assert.doesNotMatch(business, /PHRASE_RESILIATION/)
})
