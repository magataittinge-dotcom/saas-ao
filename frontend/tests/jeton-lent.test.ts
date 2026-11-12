// Bug vu par REVUE-FRONT (services/api.ts) : si l'obtention du jeton Clerk dépassait 3 s (réseau lent), la requête
// partait sans jeton, le serveur répondait 401 et l'appli déconnectait le client (réaction « session expirée »).
// Désormais : la requête attend le jeton ; s'il n'arrive pas (15 s) ou si Clerk échoue, elle échoue proprement,
// sans partir, sans 401, sans déconnexion. Sans session (Clerk rend null), elle part sans jeton, comme avant.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { AxiosAdapter } from 'axios'
import { DELAI_JETON_MS, api, setClerkTokenProvider, setReactionSessionExpiree } from '@/services/api'

const envoyees: (string | undefined)[] = []
const adaptateur: AxiosAdapter = async (config) => {
  const auth = config.headers?.Authorization as string | undefined
  envoyees.push(auth)
  const status = auth ? 200 : 401
  const reponse = { data: {}, status, statusText: '', headers: {}, config }
  if (status >= 400) throw Object.assign(new Error('Request failed with status code 401'), { isAxiosError: true, response: reponse, config })
  return reponse
}
api.defaults.adapter = adaptateur
let reactions = 0
setReactionSessionExpiree(() => { reactions++ })
const tour = () => new Promise<void>((r) => setImmediate(r))

test('jeton lent (5 s) : la requête l’attend et part avec, aucune déconnexion', async () => {
  envoyees.length = 0; reactions = 0
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    setClerkTokenProvider(() => new Promise((r) => setTimeout(() => r('jeton-lent'), 5000)))
    const p = api.get('/projects')
    for (let i = 0; i < 5; i++) await tour()
    mock.timers.tick(5000)
    const r = await p
    assert.equal(r.status, 200)
    assert.deepEqual(envoyees, ['Bearer jeton-lent'])
    assert.equal(reactions, 0)
  } finally { mock.timers.reset() }
})

test('jeton qui n’arrive jamais : échec propre après DELAI_JETON_MS, rien n’est envoyé, aucune déconnexion', async () => {
  envoyees.length = 0; reactions = 0
  assert.ok(DELAI_JETON_MS >= 10_000, 'un réseau lent a le temps de rendre le jeton')
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    setClerkTokenProvider(() => new Promise(() => {}))
    const p = api.get('/projects')
    for (let i = 0; i < 5; i++) await tour()
    mock.timers.tick(DELAI_JETON_MS)
    await assert.rejects(p, (e: { code?: string; response?: unknown }) => e.code === 'ERR_JETON_INDISPONIBLE' && e.response === undefined)
    assert.deepEqual(envoyees, [])
    assert.equal(reactions, 0)
  } finally { mock.timers.reset() }
})

test('Clerk en échec : la requête échoue proprement, sans partir ni déconnecter', async () => {
  envoyees.length = 0; reactions = 0
  setClerkTokenProvider(() => Promise.reject(new Error('réseau')))
  await assert.rejects(api.get('/projects'), (e: { code?: string }) => e.code === 'ERR_JETON_INDISPONIBLE')
  assert.deepEqual(envoyees, [])
  assert.equal(reactions, 0)
})

test('sans session (Clerk rend null tout de suite) : la requête part sans jeton, comme avant', async () => {
  envoyees.length = 0; reactions = 0
  setClerkTokenProvider(() => Promise.resolve(null))
  await assert.rejects(api.get('/public'))
  assert.deepEqual(envoyees, [undefined])
})
