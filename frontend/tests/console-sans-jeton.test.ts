// P2-9 (REVUE-FRONT) : console.error(err) d'une erreur axios affichait sa configuration, `Authorization: Bearer …` compris.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import { resumeErreur } from '@/lib/erreurs'
import { lire, sansCommentaires } from './outils/sources'

test('resumeErreur : le statut seulement, jamais la configuration ni le jeton', () => {
  const headers = new AxiosHeaders({ Authorization: 'Bearer eyJ.jeton.secret' })
  const config = { headers, url: '/files/sign?path=uploads/org/nom-prive.pdf' }
  const e = new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', config as never, null,
    { status: 403, statusText: '', headers: {}, config: config as never, data: { detail: 'Interdit' } })
  const r = resumeErreur(e)
  assert.equal(r, 'HTTP 403')
  assert.ok(!JSON.stringify(r).includes('Bearer'))
  assert.equal(resumeErreur(new AxiosError('Network Error', 'ERR_NETWORK', config as never)), 'ERR_NETWORK')
  assert.equal(resumeErreur(new TypeError('x')), 'TypeError')
  assert.equal(resumeErreur('chaîne'), 'erreur')
})

test('aucune erreur brute dans la console (FileCard, VaultSavePrompt)', () => {
  for (const f of ['src/components/common/FileCard.tsx', 'src/components/vault/VaultSavePrompt.tsx']) {
    const src = sansCommentaires(lire(f))
    assert.doesNotMatch(src, /console\.\w+\([^)]*,\s*err\)/, f)
  }
})
