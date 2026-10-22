// 1.1 — Une seule grille d'offres, honnête, identique partout et alignée sur le serveur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import GrilleOffres from '@/components/offres/GrilleOffres'
import { ESSAI, OFFRES, nomPlan, prixLibelle, quotaLibelle } from '@/lib/offres'
import { RACINE, fichiersSource, lire, sansCommentaires } from './outils/sources'

test('la grille décidée le 2026-10-22', () => {
  assert.deepEqual(
    OFFRES.map((o) => [o.id, o.nom, o.prixMensuelHT, o.analysesParMois, o.memoiresParMois]),
    [
      ['essentiel', 'Essentiel', 149, 5, 5],
      ['pro', 'Pro', 349, 40, 40],
      ['business', 'Business', 599, null, null],
    ],
  )
  assert.deepEqual({ ...ESSAI }, { ao: 1, analyses: 1, memoires: 1 })
  assert.equal(nomPlan('free'), 'Essai')
  assert.equal(nomPlan('essentiel'), 'Essentiel')
})

test('le serveur applique les mêmes quotas (backend/services/quota.py)', () => {
  const py = readFileSync(path.join(RACINE, '../backend/services/quota.py'), 'utf8')
  const debut = py.indexOf('PLAN_LIMITS: dict = {')
  const bloc = py.slice(debut, py.indexOf('}\n', debut))
  const limites: Record<string, { analyses: number | null; memoires: number | null; mensuel: boolean }> = {}
  for (const m of bloc.matchAll(/"(\w+)": \{"analysis": (None|\d+), "memoire": (None|\d+), "monthly": (True|False)\}/g)) {
    limites[m[1]] = {
      analyses: m[2] === 'None' ? null : Number(m[2]),
      memoires: m[3] === 'None' ? null : Number(m[3]),
      mensuel: m[4] === 'True',
    }
  }
  for (const o of OFFRES) {
    assert.deepEqual(limites[o.id], { analyses: o.analysesParMois, memoires: o.memoiresParMois, mensuel: true }, o.id)
  }
  assert.deepEqual(limites.free, { analyses: ESSAI.analyses, memoires: ESSAI.memoires, mensuel: false })
})

test('la grille affichée : 3 offres avec prix et quotas, aucune mention d\'utilisateurs', () => {
  const html = renderToStaticMarkup(<MemoryRouter><GrilleOffres /></MemoryRouter>)
  for (const o of OFFRES) {
    assert.ok(html.includes(o.nom), o.nom)
    assert.ok(html.includes(prixLibelle(o)), prixLibelle(o))
    assert.ok(html.includes(quotaLibelle(o)), quotaLibelle(o))
  }
  assert.ok(html.includes('5 analyses + 5 mémoires par mois'))
  assert.ok(html.includes('Analyses et mémoires illimités'))
  assert.doesNotMatch(html, /utilisateur/i)
})

test('accueil, Tarifs, Facturation et mur d\'abonnement affichent la même grille', () => {
  for (const f of ['src/routes/Landing.tsx', 'src/routes/Pricing.tsx', 'src/routes/Billing.tsx', 'src/components/common/SubscriptionWall.tsx']) {
    assert.match(lire(f), /<GrilleOffres/, f)
  }
})

test('aucun montant écrit en dur hors de lib/offres.ts', () => {
  const montant = /['"`]\s*(149|249|349|599)\s*['"`]|\b(149|249|349|599)\s*(€|&nbsp;€|\\u00a0€|euros)/
  const fautifs = fichiersSource()
    .filter((f) => f !== 'src/lib/offres.ts')
    .filter((f) => montant.test(sansCommentaires(lire(f))))
  assert.deepEqual(fautifs, [])
})

test('aucun client, témoignage ni chiffre sans source sur les pages de prix', () => {
  const interdits = [
    'OZDEM', 'Plurial', 'Sionneau', 'CARISO', 'Reims Habitat', 'Karim B.', 'Sophie M.', 'Jean-Marc L.',
    '+50 entreprises', 'Ils nous font confiance', 'Ce qu\'en disent nos utilisateurs',
    '5/5', '10 min', '18.5/20', 'ROI', 'Rentabilisé', '2 jours', '10x',
    'Compliance.xlsx', 'Excel', 'Claude Opus', 'Scoring',
    'Multi-utilisateurs', '5 utilisateurs', 'utilisateurs inclus', '1-2 utilisateurs',
    'illimitée', '5 projets simultanés', '15 AO', 'Populaire',
  ]
  const fichiers = [
    'src/routes/Landing.tsx', 'src/routes/Pricing.tsx', 'src/routes/Billing.tsx', 'src/routes/Settings.tsx',
    'src/components/common/SubscriptionWall.tsx', 'src/components/offres/GrilleOffres.tsx', 'src/lib/offres.ts',
    'index.html',
  ]
  for (const f of fichiers) {
    const texte = sansCommentaires(lire(f))
    for (const mot of interdits) assert.ok(!texte.includes(mot), `${f} contient « ${mot} »`)
  }
})
