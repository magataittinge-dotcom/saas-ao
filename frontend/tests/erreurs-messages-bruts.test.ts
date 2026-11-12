// Q-01 (audit QUALITE-FRONT) — plus aucun message brut à l'écran : ni le texte anglais d'axios (« Network Error »,
// « Request failed with status code 500 »), ni « [object Object] » d'une 422 de Pydantic (son `detail` est un tableau).
// Les sites relevés par l'audit (VaultPickerModal, CandidatureSectionTemplates, StepUpload) passent déjà par
// `messageErreur` depuis la refonte : ce test verrouille l'utilitaire et interdit le retour d'un `err.message` affiché.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { messageErreur } from '@/lib/erreurs'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const DEFAUT = 'Le fichier n’a pas pu être déposé. Réessayez dans un instant.'
const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig

function erreurHttp(status: number, data: unknown): AxiosError {
  const response = { status, statusText: '', headers: {}, config, data } as AxiosResponse
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response)
}

test('422 de Pydantic (detail en tableau) : le message de l’écran, jamais « [object Object] » ni l’anglais', async () => {
  const err = erreurHttp(422, { detail: [{ loc: ['body', 'nom'], msg: 'Field required', type: 'missing' }] })
  const m = await messageErreur(err, DEFAUT)
  assert.equal(m, DEFAUT)
  assert.doesNotMatch(m, /object Object|Field required|Request failed/)
})

test('erreur de réseau (aucune réponse) : le message de l’écran, jamais « Network Error »', async () => {
  const err = new AxiosError('Network Error', 'ERR_NETWORK', config, {})
  assert.equal(await messageErreur(err, DEFAUT), DEFAUT)
})

test('panne 500 : le message de l’écran ; refus 4xx expliqué : la phrase du serveur', async () => {
  assert.equal(await messageErreur(erreurHttp(500, { detail: 'Internal Server Error' }), DEFAUT), DEFAUT)
  assert.equal(await messageErreur(erreurHttp(413, { detail: 'Fichier trop volumineux (200 Mo au plus).' }), DEFAUT), 'Fichier trop volumineux (200 Mo au plus).')
  assert.equal(await messageErreur(new Error('boom'), DEFAUT), DEFAUT)
})

// Les seuls `.message` d'une erreur lus dans src/, et pourquoi aucun n'est affiché.
const PERMIS: Record<string, string> = {
  'src/App.tsx': 'estMorceauIntrouvable : classe l’erreur (morceau introuvable), le texte n’est jamais montré',
  'src/hooks/useAuth.ts': 'console.error seulement',
  'src/lib/apercuFiche.ts': '`e` est l’état renvoyé par le serveur (phrase française du serveur), pas une exception',
  'src/lib/entreprise/depots.ts': '`e` est une ligne du bilan de validation du serveur ({ libelle, message } en français)',
}

test('aucun écran n’affiche le texte brut d’une exception (err.message, String(err), detail concaténé)', () => {
  const fautifs: string[] = []
  for (const f of fichiersSource('src')) {
    if (f === 'src/lib/erreurs.ts' || PERMIS[f]) continue
    const code = sansCommentaires(lire(f))
    for (const m of code.matchAll(/\b(?:err|error|erreur|e|ex|exc)\??\.message\b|String\((?:err|error|e)\)|\$\{(?:err|error|e)\??\.response\??\.data\??\.detail\}/g)) {
      fautifs.push(`${f} : ${m[0]}`)
    }
  }
  assert.deepEqual(fautifs, [], 'passez par messageErreur (lib/erreurs.ts)')
  for (const f of Object.keys(PERMIS)) assert.ok(lire(f).length > 0, `${f} existe toujours`)
})
