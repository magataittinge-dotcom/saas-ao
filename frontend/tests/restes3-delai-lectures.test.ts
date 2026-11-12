// RESTES-3 (PERF § 5) : axios n'avait aucun délai d'attente. Une lecture qui ne répond pas (ex. /billing/quota) laissait
// un écran en attente sans fin. Les lectures JSON ont un délai par défaut ; les téléchargements (blob), les écritures,
// dépôts de fichiers et longues opérations gardent le leur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { api, DELAI_LECTURE_MS } from '@/services/api'

test('lecture : délai par défaut ; délai donné, téléchargement, écriture : inchangés', async () => {
  const vus: { url?: string; timeout?: number }[] = []
  const espion: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    vus.push({ url: config.url, timeout: config.timeout })
    return { data: {}, status: 200, statusText: '', headers: {}, config }
  }
  const avant = api.defaults.adapter
  api.defaults.adapter = espion
  try {
    await api.get('/billing/quota')
    await api.get('/organizations/me/carte', { timeout: 30_000 })
    await api.get('/projects/p/export/zip', { responseType: 'blob' })
    await api.post('/projects/p/analyze', {})
    await api.post('/documents/upload', {}, { timeout: 30 * 60 * 1000 })
  } finally {
    api.defaults.adapter = avant
  }
  assert.ok(DELAI_LECTURE_MS >= 15_000 && DELAI_LECTURE_MS <= 60_000, 'raisonnable : ni trop court pour un calcul serveur, ni sans fin')
  assert.deepEqual(vus.map((v) => v.timeout), [DELAI_LECTURE_MS, 30_000, 0, 0, 30 * 60 * 1000])
})
