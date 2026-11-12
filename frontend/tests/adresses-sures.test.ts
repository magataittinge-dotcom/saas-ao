// P0-1 (REVUE-FRONT) : `/vault?returnTo=javascript:…` exécutait du JavaScript dans la page du client au clic sur
// « Retour à la vérification », et `//hote`, `/\hote`, `https://hote` le menaient sur un site tiers. Une seule règle,
// partagée par toutes les navigations qui reçoivent une adresse venue de l'adresse du navigateur ou du serveur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETAPES_AO, adresseEtapeAO, cheminInterne } from '@/lib/adresseSure'
import { ROUTES_ETAPES } from '@/lib/intelligence/action'
import { adresseDeRetourValide } from '@/lib/sessionExpiree'
import { lire, sansCommentaires } from './outils/sources'

const ID = 'dfc6ceb2-e944-4249-af92-d146b1b20b2b'

const HOSTILES = [
  'javascript:alert(document.domain)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  '//tiers.example/faux-login',
  '/\\tiers.example/faux-login',
  '\\\\tiers.example',
  'https://tiers.example/faux-login',
  'http://tiers.example',
  '%2F%2Ftiers.example',
  '/%2F%2Ftiers.example',
  '/%5Ctiers.example',
  '/\ttiers.example',
  '/\n/tiers.example',
]

test('cheminInterne : un chemin de l’appli seulement (jamais un schéma, un hôte, une barre oblique inverse ni un caractère de contrôle)', () => {
  for (const a of HOSTILES) assert.equal(cheminInterne(a), false, JSON.stringify(a))
  for (const a of [null, undefined, '']) assert.equal(cheminInterne(a), false, String(a))
  for (const a of ['/projects', `/projects/${ID}/verification`, '/company?rubrique=moyens', '/vault']) assert.equal(cheminInterne(a), true, a)
})

test('adresseEtapeAO : seulement /projects/<uuid>/<étape connue>, rien d’autre', () => {
  for (const a of HOSTILES) assert.equal(adresseEtapeAO(a), false, JSON.stringify(a))
  for (const etape of ['upload', 'lots', 'analysis', 'verification', 'plan', 'memoire', 'export']) {
    assert.equal(adresseEtapeAO(`/projects/${ID}/${etape}`), true, etape)
  }
  for (const a of [
    `/projects/${ID}/verification?x=1`,
    `/projects/${ID}/verification/`,
    `/projects/${ID}/inconnue`,
    `/projects/${ID}`,
    '/projects/abc/verification',
    `/projects/${ID}/verification#//tiers.example`,
    `//projects/${ID}/verification`,
    `/projects/${ID}/../../vault`,
    '/dashboard',
  ]) assert.equal(adresseEtapeAO(a), false, a)
})

test('les étapes acceptées sont exactement les étapes routées (ROUTES_ETAPES + plan)', () => {
  assert.deepEqual([...ETAPES_AO].sort(), [...ROUTES_ETAPES, 'plan'].sort())
})

test('retour après une session expirée : la même règle (P2-8 : `/\\hote` refusé)', () => {
  for (const a of HOSTILES) assert.equal(adresseDeRetourValide(a), false, JSON.stringify(a))
  assert.equal(adresseDeRetourValide(`/projects/${ID}/plan?lot=2`), true)
})

test('coffre-fort : le retour ne navigue que vers une étape d’AO validée, sinon pas de bouton', () => {
  const src = sansCommentaires(lire('src/routes/Vault.tsx'))
  assert.match(src, /const returnTo = adresseEtapeAO\((\w+)\) \? \1 : null/, 'returnTo passe par adresseEtapeAO, sinon null (pas de bouton)')
  assert.doesNotMatch(src, /navigate\(searchParams/, 'jamais navigate() sur le paramètre brut')
})

test('les autres navigations qui reçoivent une adresse dynamique passent par la même règle', () => {
  // retour après connexion (Login, PublicRoute) : retourApresConnexion → adresseDeRetourValide → cheminInterne
  assert.match(sansCommentaires(lire('src/lib/sessionExpiree.ts')), /cheminInterne\(/)
})

test('redirection vers Stripe (adresse rendue par le serveur) : seulement checkout.stripe.com et billing.stripe.com en https', async () => {
  const { adresseStripe } = await import('@/lib/adresseSure')
  for (const a of ['https://checkout.stripe.com/c/pay/cs_test_a1', 'https://billing.stripe.com/p/session/test_b2']) assert.equal(adresseStripe(a), true, a)
  for (const a of [...HOSTILES, null, undefined, '', 'http://checkout.stripe.com/c/pay/x', 'https://checkout.stripe.com.tiers.example/x',
    'https://tiers.example/?https://checkout.stripe.com/', 'https://checkout.stripe.com@tiers.example/', 'https://stripe.com/', '/settings/billing']) {
    assert.equal(adresseStripe(a), false, JSON.stringify(a))
  }
  for (const f of ['src/routes/Billing.tsx', 'src/components/common/SubscriptionWall.tsx']) {
    const src = sansCommentaires(lire(f))
    assert.doesNotMatch(src, /window\.location\.href\s*=/, `${f} : jamais d’affectation directe d’une adresse du serveur`)
    assert.match(src, /allerChezStripe\(data\.url\)/, f)
  }
})
