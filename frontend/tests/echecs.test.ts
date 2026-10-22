// 1.16 — Les échecs ne passent plus en silence, et la source citée n'est
// jamais remplacée par une autre pièce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import { messageErreur } from '@/lib/erreurs'
import { PASSAGE_INTROUVABLE, trouverPieceCitee } from '@/lib/pieceCitee'

const PIECES = [
  { type: 'rc', file_name: 'Reglement_consultation.pdf' },
  { type: 'cctp', file_name: 'CCTP_lot05.pdf' },
  { type: 'autre', file_name: 'CCAP.pdf' },
]

test('la pièce citée est retrouvée par son type ou son nom', () => {
  assert.equal(trouverPieceCitee('RC p.4', PIECES)?.file_name, 'Reglement_consultation.pdf')
  assert.equal(trouverPieceCitee('CCTP', PIECES)?.file_name, 'CCTP_lot05.pdf')
  assert.equal(trouverPieceCitee('CCAP p. 12', PIECES)?.file_name, 'CCAP.pdf')
})

test("source introuvable : aucune pièce, jamais le premier document du dossier", () => {
  assert.equal(trouverPieceCitee('Annexe 7 — plan de masse', PIECES), null)
  assert.equal(trouverPieceCitee('', PIECES), null)
  assert.equal(trouverPieceCitee(null, PIECES), null)
  assert.equal(PASSAGE_INTROUVABLE, 'Passage introuvable dans le dossier.')
})

function erreurHttp(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status, statusText: '', headers: {}, config, data,
  })
}

test("message d'erreur : le refus expliqué par le serveur, même dans une réponse binaire (export)", async () => {
  assert.equal(await messageErreur(erreurHttp(503, { detail: 'Export PDF indisponible.' }), 'défaut'), 'Export PDF indisponible.')
  const blob = new Blob([JSON.stringify({ detail: 'Mémoire introuvable' })], { type: 'application/json' })
  assert.equal(await messageErreur(erreurHttp(404, blob), 'défaut'), 'Mémoire introuvable')
  assert.equal(await messageErreur(erreurHttp(402, { detail: 'Votre AO d\'essai gratuit est utilisé.' }), 'défaut'), 'Votre AO d\'essai gratuit est utilisé.')
})

test("message d'erreur : pour une panne (5xx générique ou technique), le message précis de l'écran", async () => {
  assert.equal(await messageErreur(erreurHttp(500, { detail: 'Erreur interne du serveur' }), 'Le ZIP n\'a pas abouti.'), 'Le ZIP n\'a pas abouti.')
  assert.equal(await messageErreur(erreurHttp(500, { detail: "KeyError: 'partie_a'" }), 'défaut'), 'défaut')
  assert.equal(await messageErreur(erreurHttp(502, new Blob(['<html>'])), 'défaut'), 'défaut')
  assert.equal(await messageErreur(new Error('réseau'), 'défaut'), 'défaut')
})
