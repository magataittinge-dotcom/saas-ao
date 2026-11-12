// P2-2 (REVUE-FRONT) : localStorage `auth-storage` gardait l'e-mail, le téléphone et le nom de l'utilisateur, et toute la
// ligne de l'organisation (SIRET, adresse, identifiants Stripe…), même après la déconnexion. Le navigateur ne garde plus
// que des identifiants techniques et l'offre ; la déconnexion efface la clé.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const memoire = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (c: string) => memoire.get(c) ?? null,
  setItem: (c: string, v: string) => { memoire.set(c, String(v)) },
  removeItem: (c: string) => { memoire.delete(c) },
  clear: () => memoire.clear(),
  key: () => null,
  length: 0,
}

const USER = { id: 'u1', email: 'prenom.nom@exemple.test', name: 'Prénom Nom', phone: '0600000000', role: 'admin' as const, organization_id: 'o1', created_at: '2026-11-01T00:00:00' }
const ORG = {
  id: 'o1', name: 'Bâti Essai SARL', siret: '00000000000000', address: '1 rue de l’Essai', telephone: '0100000000', email_contact: 'contact@exemple.test',
  presentation: 'Texte de présentation', plan: 'pro' as const, trial_granted: false, created_at: '2026-11-01T00:00:00', stripe_customer_id: 'cus_essai',
}
const PERSONNEL = ['prenom.nom@exemple.test', 'Prénom Nom', '0600000000', 'Bâti Essai SARL', '00000000000000', 'rue de l’Essai', '0100000000', 'contact@exemple.test', 'présentation', 'cus_essai']

test('le navigateur ne garde rien de personnel : identifiants, rôle et offre seulement', async () => {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore.getState().setAuth(USER, ORG)
  const garde = memoire.get('auth-storage') ?? ''
  for (const p of PERSONNEL) assert.ok(!garde.includes(p), `gardé dans localStorage : ${p}`)
  const { state } = JSON.parse(garde)
  assert.deepEqual(state.user, { id: 'u1', role: 'admin', organization_id: 'o1' })
  assert.deepEqual(state.organization, { id: 'o1', plan: 'pro', trial_granted: false })
  // en mémoire, l'appli a tout ce que ses écrans lisent
  assert.equal(useAuthStore.getState().user?.email, USER.email)
  assert.equal(useAuthStore.getState().organization?.siret, ORG.siret)
})

test('la déconnexion efface la clé du navigateur', async () => {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore.getState().setAuth(USER, ORG)
  assert.ok(memoire.has('auth-storage'))
  useAuthStore.getState().logout()
  assert.equal(memoire.get('auth-storage'), undefined)
  assert.equal(useAuthStore.getState().user, null)
})

test('un ancien stockage complet (avant P2-2) est réduit à la relecture', async () => {
  const { migrerEtatGarde } = await import('@/stores/authStore')
  const reduit = migrerEtatGarde({ user: USER, organization: ORG }, 0)
  const texte = JSON.stringify(reduit)
  for (const p of PERSONNEL) assert.ok(!texte.includes(p), p)
  assert.deepEqual(migrerEtatGarde(null, 0), { user: null, organization: null })
})

test('session fermée hors de l’appli (autre onglet, expiration) : l’état gardé est vidé', async () => {
  const { lire, sansCommentaires } = await import('./outils/sources')
  assert.match(sansCommentaires(lire('src/hooks/useAuth.ts')), /if \(!isSignedIn\) \{ if \(user\) logout\(\); return \}/)
})
