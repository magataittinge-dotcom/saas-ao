// R16 — l'analyse parle en phrases de patron : ce que sont les exigences, et pourquoi tous les documents ne sont pas analysés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repartirDocuments, phraseDocumentsAnalyses, phraseExigences } from '@/lib/analyseLibelles'
import { lire, sansCommentaires } from './outils/sources'

const doc = (id: string, related_lots: string[] | null) => ({ id, related_lots })

test('la répartition suit la règle du serveur : communs (all, 0, sans étiquette) et lot choisi analysés, le reste non', () => {
  const docs = [doc('a', ['all']), doc('b', null), doc('c', ['0']), doc('d', ['5']), doc('e', ['info']), doc('f', ['9']), doc('g', ['13', '5'])]
  const r = repartirDocuments(docs, 'lot5')
  assert.deepEqual(r.analyses.map((d) => d.id), ['a', 'b', 'c', 'd', 'g'])
  assert.deepEqual(r.informations.map((d) => d.id), ['e'])
  assert.deepEqual(r.autresLots.map((d) => d.id), ['f'])
})

test('la phrase des documents explique les 58 autres : pièces d’information et autres lots, sans abréviation', () => {
  const p = phraseDocumentsAnalyses({ analyses: 35, informations: 42, autresLots: 16 })
  assert.equal(p.principale, '35 documents analysés sur 93')
  assert.equal(p.detail, 'Les 58 autres documents ne servent pas à ce lot : 42 sont des pièces d’information (plans, diagnostics…) et 16 concernent d’autres lots.')
  assert.ok(!/\bdocs?\b/.test(p.principale + p.detail))
})

test('accords et cas simples', () => {
  assert.equal(phraseDocumentsAnalyses({ analyses: 1, informations: 1, autresLots: 0 }).detail, 'L’autre document ne sert pas à ce lot : c’est une pièce d’information (plan, diagnostic…).')
  assert.equal(phraseDocumentsAnalyses({ analyses: 4, informations: 0, autresLots: 2 }).detail, 'Les 2 autres documents ne servent pas à ce lot : 2 concernent d’autres lots.')
  assert.equal(phraseDocumentsAnalyses({ analyses: 1, informations: 0, autresLots: 1 }).principale, '1 document analysé sur 2')
  assert.equal(phraseDocumentsAnalyses({ analyses: 5, informations: 0, autresLots: 0 }).detail, '')
})

test('exigences : ce que veut dire « obligatoire » pour un patron', () => {
  assert.equal(phraseExigences(605, 597), '597 à respecter impérativement · 8 souhaitées par l’acheteur')
  assert.equal(phraseExigences(10, 10), 'Toutes à respecter impérativement')
  assert.equal(phraseExigences(1, 1), 'À respecter impérativement')
  assert.equal(phraseExigences(3, 0), 'Toutes souhaitées par l’acheteur')
})

test('l’écran d’analyse utilise ces phrases (plus de « docs » ni de « obligatoires » sec)', () => {
  const code = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(code, /phraseDocumentsAnalyses\(/)
  assert.match(code, /phraseExigences\(/)
  assert.doesNotMatch(code, /documents (analysés|lus)/)
  assert.match(code, /phraseDocuments\?\.detail/)
})
