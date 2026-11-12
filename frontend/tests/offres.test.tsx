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

test('la grille décidée le 2026-11-11 : plus aucune offre illimitée, prix inchangés', () => {
  assert.deepEqual(
    OFFRES.map((o) => [o.id, o.nom, o.prixMensuelHT, o.analysesParMois, o.memoiresParMois]),
    [
      ['essentiel', 'Essentiel', 149, 5, 5],
      ['pro', 'Pro', 349, 30, 30],
      ['business', 'Business', 599, 70, 70],
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
  // Décision du 2026-11-11 : plus aucune offre illimitée, ni dans le front ni dans le serveur.
  assert.deepEqual(Object.keys(limites).sort(), ['business', 'essentiel', 'free', 'pro'])
  for (const [plan, l] of Object.entries(limites)) {
    assert.ok(l.analyses !== null && l.memoires !== null, `${plan} : quota None dans PLAN_LIMITS`)
  }
  for (const o of OFFRES) {
    assert.ok(Number.isInteger(o.analysesParMois) && Number.isInteger(o.memoiresParMois), `${o.id} : quota non chiffré`)
  }
  assert.deepEqual(
    Object.fromEntries(OFFRES.map((o) => [o.id, [limites[o.id].analyses, limites[o.id].memoires]])),
    { essentiel: [5, 5], pro: [30, 30], business: [70, 70] },
  )
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
  assert.ok(html.includes('30 analyses + 30 mémoires par mois'))
  assert.ok(html.includes('70 analyses + 70 mémoires par mois'))
  assert.doesNotMatch(html, /illimit|usage raisonnable/i)
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

// D18 corrigé par la décision du 11/11/2026 : la partie des CGV et des CGU qui décrit les offres dit la grille, et rien d'autre.
test('CGV et CGU : la description des offres dit la grille du produit, sans « illimité » ni offre ou fonction inventée', () => {
  const legal = (slug: string) => readFileSync(path.join(RACINE, 'public/legal', `${slug}.md`), 'utf8')
  const section = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)))
  const offresCgv = section(legal('cgv'), '## 4.', '## 5.')
  const offresCgu = section(legal('cgu'), '### 4.2', '### 4.3')
  for (const [nom, texte] of [['CGV', offresCgv], ['CGU', offresCgu]] as const) {
    assert.ok(texte.length > 50, `${nom} : section des offres trouvée`)
    for (const o of OFFRES) {
      assert.match(texte, new RegExp(`${o.nom}[^\\n]*${o.prixMensuelHT}[\\s\\u00a0]€ HT par mois`), `${nom} : ${o.nom} à ${o.prixMensuelHT} € HT`)
      assert.ok(texte.includes(quotaLibelle(o)), `${nom} : ${quotaLibelle(o)}`)
    }
    assert.match(texte, /1 AO offert/, `${nom} : l'essai`)
    assert.doesNotMatch(texte, /Découverte|Starter|\b(99|299|499) €|illimit|usage raisonnable|API|SSO|SLA|utilisateurs|Go\b|prioritaire|téléphonique|Onboarding|scoring|Templates/i, nom)
  }
  for (const slug of ['cgv', 'cgu', 'politique-confidentialite', 'mentions-legales', 'cookies']) {
    assert.doesNotMatch(legal(slug), /illimit|usage raisonnable|fair.?use/i, slug)
  }
})

// Migration Pro 40 → 30 (11/11/2026) et Business au quota, sur la page Abonnement refaite au lot c.
test('Abonnement : au-delà du nouveau quota, la jauge lit « 30 sur 30 » ; Business au quota ne propose pas d’offre plus large', () => {
  const page = sansCommentaires(lire('src/routes/Billing.tsx'))
  assert.match(page, /const utilise = Math\.min\(compteur\.used, compteur\.limit\)/)
  assert.match(page, /\{utilise\} sur \{compteur\.limit\}/)
  assert.match(page, /aria-valuenow=\{utilise\}/)
  assert.doesNotMatch(page, /\{compteur\.used\} sur/)
  assert.match(page, /business \? 'le nombre d’unités peut être relevé sur demande\.' : 'une offre plus large/)
  assert.match(page, /\{business \? null : isPaid/)
  assert.doesNotMatch(page, /limit === null|limit !== null|illimit|usage raisonnable/)
})

// D23 (fondateur, 12/11/2026) : « l'accès reste ouvert jusqu'à la fin de la période payée, puis résiliation, sans remboursement du mois entamé ; CGV à jour ».
test('résiliation (D23) : accès jusqu’à la fin de la période payée, mois entamé non remboursé — CGV, CGU et Abonnement disent la même chose', () => {
  const legal = (slug: string) => readFileSync(path.join(RACINE, 'public/legal', `${slug}.md`), 'utf8')
  const cgv = legal('cgv')
  const art7 = cgv.slice(cgv.indexOf('## 7. Résiliation'), cgv.indexOf('## 8.'))
  const art71 = art7.slice(art7.indexOf('### 7.1'), art7.indexOf('### 7.2'))
  assert.match(art71, /fin de la\s+période payée/)
  assert.match(art71, /accès au Service reste ouvert/)
  const art72 = art7.slice(art7.indexOf('### 7.2'), art7.indexOf('### 7.3'))
  assert.match(art72, /### 7\.2 Absence de remboursement de la période entamée/)
  assert.doesNotMatch(art7, /prorata des jours|remboursement au prorata\b(?! )/i)
  assert.doesNotMatch(art72, /peut demander un\s+remboursement/)
  for (const n of ['7.3 Récupération des données', '7.4 Export à tout moment', '7.5 Résiliation pour faute']) assert.ok(art7.includes(`### ${n}`), n)
  const cgu = legal('cgu')
  const art91 = cgu.slice(cgu.indexOf('### 9.1'), cgu.indexOf('### 9.2'))
  assert.match(art91, /fin de la\s+période payée/)
  assert.match(art91, /n’est pas remboursée|n'est pas remboursée/)
  const page = lire('src/routes/Billing.tsx')
  const ligne = page.slice(page.indexOf('data-ou-gerer'), page.indexOf('</Carte>', page.indexOf('data-ou-gerer')))
  assert.match(ligne, /résilier à tout moment : l’accès reste ouvert jusqu’à la fin de la période payée, et le mois entamé n’est pas remboursé\./)
})
