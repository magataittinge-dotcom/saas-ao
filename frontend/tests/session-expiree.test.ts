// F-01 (audit du front) : le serveur répond 401 → une seule réaction pour toute l'appli (retour à la connexion, phrase,
// retour à la page d'où l'on vient), au lieu de laisser chaque liste tomber dans son état vide.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AxiosAdapter } from 'axios'
import { api, setReactionSessionExpiree } from '@/services/api'
import { ADRESSE_SESSION_EXPIREE, CLE_RETOUR, PHRASE_SESSION_EXPIREE, adresseDeRetourValide, creerReactionSessionExpiree, retourApresConnexion } from '@/lib/sessionExpiree'
import { lire, sansCommentaires } from './outils/sources'

function stockage() {
  const m = new Map<string, string>()
  return { getItem: (c: string) => m.get(c) ?? null, setItem: (c: string, v: string) => { m.set(c, v) }, removeItem: (c: string) => { m.delete(c) } }
}

const repondre = (status: number): AxiosAdapter => async (config) => {
  const reponse = { data: { detail: 'Not authenticated' }, status, statusText: '', headers: {}, config }
  if (status >= 400) throw Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: reponse, config })
  return reponse
}

test('toutes les requêtes /api en 401 : une seule réaction, la page d’où l’on vient est gardée, les appels échouent toujours', async () => {
  const s = stockage()
  const sorties: string[] = []
  setReactionSessionExpiree(creerReactionSessionExpiree({ stockage: () => s, adresse: () => '/projects/abc/plan?lot=2', sortir: (vers) => { sorties.push(vers) } }))
  const avant = api.defaults.adapter
  api.defaults.adapter = repondre(401)
  try {
    const issues = await Promise.allSettled([api.get('/projects'), api.get('/documents'), api.get('/billing/quota'), api.post('/veille/visite')])
    assert.ok(issues.every((i) => i.status === 'rejected'), 'chaque appel reste en échec (jamais un succès vide)')
    assert.deepEqual(sorties, [ADRESSE_SESSION_EXPIREE], 'une seule sortie vers la connexion, pour quatre réponses 401')
    assert.equal(retourApresConnexion(s), '/projects/abc/plan?lot=2')
  } finally {
    api.defaults.adapter = avant
    setReactionSessionExpiree(null)
  }
})

test('une panne (500) ou un refus (403) ne ferme pas la session', async () => {
  const sorties: string[] = []
  setReactionSessionExpiree(creerReactionSessionExpiree({ stockage, adresse: () => '/projects', sortir: (vers) => { sorties.push(vers) } }))
  const avant = api.defaults.adapter
  try {
    for (const statut of [500, 403, 404]) {
      api.defaults.adapter = repondre(statut)
      await assert.rejects(api.get('/projects'))
    }
    assert.deepEqual(sorties, [])
  } finally {
    api.defaults.adapter = avant
    setReactionSessionExpiree(null)
  }
})

test('jamais de boucle : un second 401 moins de 30 s après la reconnexion ne ferme pas la session une seconde fois', () => {
  const s = stockage()
  let heure = 1_000_000
  const sorties: string[] = []
  const nouvelle = () => creerReactionSessionExpiree({ stockage: () => s, adresse: () => '/vault', sortir: (v) => { sorties.push(v) }, maintenant: () => heure })
  assert.equal(nouvelle()(), true)
  heure += 5_000 // la page a été rechargée par la déconnexion : nouvelle réaction, même stockage
  assert.equal(nouvelle()(), false)
  heure += 60_000
  assert.equal(nouvelle()(), true)
  assert.equal(sorties.length, 2)
})

test('le retour après connexion ne mène qu’à une page de l’appli', () => {
  for (const a of ['/projects', '/projects/abc/memoire', '/company?rubrique=moyens']) assert.equal(adresseDeRetourValide(a), true, a)
  for (const a of [null, '', '/', '//pirate.example', 'https://pirate.example', '/login', '/login?session=expiree', '/register/verify']) assert.equal(adresseDeRetourValide(a), false, String(a))
  const s = stockage()
  s.setItem(CLE_RETOUR, '//pirate.example')
  assert.equal(retourApresConnexion(s), null)
})

test('la phrase est celle de la mission ; useSyncUser pose la réaction, qui ferme la session vers la connexion', () => {
  assert.equal(PHRASE_SESSION_EXPIREE, 'Votre session a expiré. Reconnectez-vous pour reprendre où vous en étiez.')
  const auth = sansCommentaires(lire('src/hooks/useAuth.ts'))
  assert.match(auth, /setReactionSessionExpiree\(/)
  assert.match(auth, /signOut\(\{ redirectUrl: vers \}\)/)
})
