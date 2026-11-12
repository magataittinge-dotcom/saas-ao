// Le second test de bout en bout : les parcours que le premier (e2e/parcours.mjs) ne joue pas, sur la même API à IA SIMULÉE.
// A (ordinateur) : une pièce choisie au coffre-fort → ZIP ; « Préparer les questions » ; IA en panne pendant la rédaction ;
//                  « Je l'ai déposé », « Gagné », correction « Perdu » (D16) → le bilan de l'Accueil suit.
// B (ordinateur) : deux lots lus d'un coup → l'Export de chaque lot propose la DPGF de SON lot.
// C (ordinateur, puis téléphone) : quota du mois épuisé (organisation de test, base jetable) → mur d'abonnement, rien décompté.
// D (ordinateur) : « Supprimer mon compte » sans abonnement (même organisation de test) : dialogue et message, NON confirmé
//                  (la suppression appelle Clerk : services/resiliation_compte.py, executer_suppression).
// Mode d'emploi : e2e/LISEZMOI.md. Lancement : `npm run e2e:2` (dans frontend/).
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, CHROMIUM, seConnecter, garderRequetes, masquer } from './outils.mjs'
import { FIL, NOM_FIL, TITRES, VERBES, DEPOSE, CHAMPS_MEMOIRE, SUITE, PARCOURS_2 as M, TITRES_2 } from './contrat.mjs'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BACKEND = path.join(RACINE, 'backend')
const PY = process.env.E2E_PYTHON || path.join(os.homedir(), 'sprint-ozcan-wt/venv-sprint/bin/python')
const BASE = process.env.E2E_BASE || 'http://localhost:3127'
const PORT_API = process.env.E2E_API_PORT || '8127'
const EMAIL = process.env.E2E_EMAIL || 'maga.taittinge@gmail.com'
const TRAVAIL = process.env.E2E_TRAVAIL || path.join(os.tmpdir(), 'synorix-e2e-2')
const CAPTURES = process.env.E2E_CAPTURES || path.join(TRAVAIL, 'captures')
const APPELS = path.join(TRAVAIL, 'appels.jsonl')
const PANNE = path.join(TRAVAIL, 'panne')
/** La marque des AO de ce test (le ménage du premier test, « E2E Ecole des Grebes », ne les touche pas, et inversement). */
const MARQUE = 'E2E2 Grebes'
const ORDI = { nom: 'ordinateur', width: 1440, height: 900, tel: false }
const TEL = { nom: 'telephone', width: 390, height: 844, tel: true }
const ATTENTE_IA = 120_000
const STRICT = process.env.E2E_STRICT === '1'
/** E2E2_SEUL=A,C : seulement ces parcours (mise au point). */
const SEUL = (process.env.E2E2_SEUL || 'A,B,C,D').split(',').map((s) => s.trim().toUpperCase())

/** Constats CONNUS (bugs portés au rapport, pas encore corrigés) : tolérés et listés en fin de passage ; E2E_STRICT=1 les rend bloquants. */
function constat(ctx, texte) {
  if (STRICT) throw new Echec(`constat (E2E_STRICT) : ${texte}`)
  ctx.j.connues.add(texte)
}
/**
 * Messages de console ATTENDUS d'un parcours (pas des bugs) : le refus du serveur que le parcours provoque exprès est
 * noté par Chromium (« Failed to load resource … 402 ») ; il n'est accepté que dans le parcours qui le provoque.
 */
const CONSOLE_ATTENDUES = { quota: /Failed to load resource: the server responded with a status of 402/ }

const t0 = Date.now()
const sec = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
const dire = (m) => console.log(`[${sec()} s] ${m}`)
class Echec extends Error {}

// ── Le dossier inventé, l'API simulée, la base jetable ─────────────────────
mkdirSync(TRAVAIL, { recursive: true })
mkdirSync(CAPTURES, { recursive: true })
if (existsSync(PANNE)) unlinkSync(PANNE)
writeFileSync(APPELS, '')

function fabriquerDossiers() {
  const r = spawnSync(PY, ['-m', 'tests.e2e.dce_invente', path.join(TRAVAIL, 'dce'), '--parcours-2'], { cwd: BACKEND, encoding: 'utf8' })
  if (r.status !== 0) throw new Echec('dossier inventé : ' + (r.stderr || r.stdout).slice(-400))
  const f = r.stdout.trim().split('\n')
  // Le dossier du premier test, sous le nom de ce test (le nom de l'AO vient du nom de l'archive).
  const copie = (nom) => { const d = path.join(TRAVAIL, 'dce', `${MARQUE} ${nom}.zip`); copyFileSync(f[0], d); return d }
  return {
    coffre: copie('coffre'), quota: copie('quota'), quotaTel: copie('quota tel'),
    deuxLots: f.find((x) => x.endsWith('deux lots.zip')), attestation: f.find((x) => x.includes('Attestation')),
  }
}

/** Préparations dans la base jetable (backend/tests/e2e/base_jetable.py : refus si la base n'est pas synorix_fin_*). */
function baseJetable(action) {
  const r = spawnSync(PY, ['-m', 'tests.e2e.base_jetable', action, EMAIL, TRAVAIL], { cwd: BACKEND, encoding: 'utf8' })
  if (r.status !== 0) throw new Echec(`base jetable (${action}) : ` + masquer((r.stderr || r.stdout).slice(-400)))
  return JSON.parse(r.stdout.trim().split('\n').pop())
}

const sante = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok } catch { return false } }

let api = null
async function lancerApi() {
  if (await sante(`http://127.0.0.1:${PORT_API}/api/health`)) {
    throw new Echec(`le port ${PORT_API} sert déjà une API : arrêtez celle du banc (le parcours lance la sienne, à IA simulée)`)
  }
  api = spawn(PY, ['-m', 'tests.e2e.api_simulee'], {
    cwd: BACKEND, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, E2E_PORT: PORT_API, E2E_APPELS: APPELS, E2E_PANNE: PANNE, ANTHROPIC_API_KEY: '', VOYAGE_API_KEY: '' },
  })
  const journal = []
  const noter = (d) => { journal.push(String(d)); if (journal.length > 200) journal.shift() }
  api.stdout.on('data', noter); api.stderr.on('data', noter)
  api.journal = journal
  for (let i = 0; i < 90; i++) {
    if (api.exitCode !== null) throw new Echec('API simulée arrêtée au démarrage :\n' + masquer(journal.join('').slice(-800)))
    if (await sante(`http://127.0.0.1:${PORT_API}/api/health`)) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Echec('API simulée : pas de réponse en 90 s')
}
function arreterApi() {
  if (api && api.exitCode === null) { try { process.kill(-api.pid, 'SIGKILL') } catch { /* déjà arrêtée */ } }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { arreterApi(); try { baseJetable('restaurer') } catch { /* rien */ } process.exit(130) })

function appelsDepuis(debut) {
  const lignes = readFileSync(APPELS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const compte = {}
  for (const a of lignes) if (a.t * 1000 >= debut) compte[a.genre] = (compte[a.genre] ?? 0) + 1
  return compte
}

// ── Le navigateur ───────────────────────────────────────────────────────────
async function ouvrir(nav, largeur) {
  const ctx = await nav.newContext({
    viewport: { width: largeur.width, height: largeur.height }, isMobile: largeur.tel, hasTouch: largeur.tel,
    deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true,
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('synorix.theme', 'light') } catch { /* rien */ } })
  const page = await ctx.newPage()
  const j = { requetes: [], erreurs5xx: [], reprises401: 0, console: [], telechargements: [], connues: new Set() }
  page.on('console', (m) => { if (m.type() === 'error') j.console.push(masquer(m.text()).slice(0, 1200)) })
  page.on('pageerror', (e) => j.console.push('pageerror: ' + masquer(e.message).slice(0, 300)))
  page.on('download', (d) => j.telechargements.push(d))
  garderRequetes(page, j)
  await seConnecter(page, BASE, RACINE, EMAIL)
  return { bctx: ctx, ctx: { page, j, largeur, n: 0, id: null, faits: [], appels: {} } }
}

/** Un appel direct à l'API avec le jeton de la session (ménage, mesures). */
async function api_(page, methode, chemin, corps) {
  return page.evaluate(async ({ methode, chemin, corps }) => {
    const t = await window.Clerk.session.getToken()
    const r = await fetch(chemin, {
      method: methode, headers: { Authorization: `Bearer ${t}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    })
    return { s: r.status, corps: r.status === 204 ? null : await r.json().catch(() => null) }
  }, { methode, chemin, corps })
}

/** Ménage : les AO de ce test laissés par un passage précédent (nom marqué) sont supprimés. */
async function menage(page) {
  const r = await api_(page, 'GET', '/api/projects')
  const liste = Array.isArray(r.corps) ? r.corps : (r.corps?.items ?? r.corps?.projects ?? [])
  const anciens = liste.filter((p) => String(p.name || '').startsWith(MARQUE))
  for (const p of anciens) await api_(page, 'DELETE', `/api/projects/${p.id}`)
  return anciens.length
}

/** Unités décomptées ce mois (GET /api/billing/quota, la source de la jauge). */
async function unites(page) {
  const r = await api_(page, 'GET', '/api/billing/quota')
  return { analyses: Number(r.corps?.analyses?.used ?? NaN), memoires: Number(r.corps?.memoires?.used ?? NaN) }
}

// ── Les contrôles de chaque écran (les mêmes que le premier test) ───────────
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const nomCommence = (s) => new RegExp('^' + echapper(s))
const bouton = (page, nom, exact = false) => page.getByRole('button', { name: exact ? nom : nomCommence(nom), exact })
const suivant = (ctx, etiquette) => ctx.page.getByRole('button', { name: SUITE[ctx.largeur.nom] + etiquette, exact: true }).click()

async function inventaire(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const nom = (e) => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90)
    return [...document.querySelectorAll('h1,h2,h3,button,[role=button],[role=dialog],[role=alert],[role=status],a')].filter(vis)
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('data-variante') ? '/' + e.getAttribute('data-variante') : ''}${e.disabled ? '(off)' : ''} ${nom(e)}`)
      .filter((l) => !/Mentions|CGU|CGV|Cookies|Confidentialit/.test(l)).join('\n')
  })
}

async function capturer(ctx, nom) {
  ctx.n += 1
  const f = path.join(CAPTURES, `${ctx.largeur.nom}-${ctx.parcours}-${String(ctx.n).padStart(2, '0')}-${nom}.png`)
  await ctx.page.screenshot({ path: f, fullPage: false }).catch(() => {})
  return f
}

/** Titre h1 (si donné), étape active du fil, un seul bouton principal visible, console, 5xx, débordement à 390 ; capture. */
async function controler(ctx, nom, { titre, fil, principal = true, attendues = null } = {}) {
  const { page, j, largeur } = ctx
  if (titre) await page.getByRole('heading', { level: 1, name: titre instanceof RegExp ? titre : titre, exact: !(titre instanceof RegExp) }).first().waitFor({ timeout: 30_000 })
  if (fil) {
    const actif = page.getByRole('navigation', { name: NOM_FIL }).locator('[aria-current="step"]')
    const nomActif = (await actif.getAttribute('aria-label', { timeout: 10_000 })) || ''
    if (!nomActif.startsWith(fil)) throw new Echec(`${nom} : étape active du fil « ${nomActif} », attendu « ${fil} »`)
  }
  await page.waitForTimeout(400)
  const principaux = page.locator('[data-variante="principal"]:visible')
  const nb = await principaux.count()
  if (principal && nb !== 1) throw new Echec(`${nom} : ${nb} bouton(s) principal(aux) visible(s), attendu 1\n${await inventaire(page)}`)
  if (largeur.tel) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    if (sw > largeur.width) throw new Echec(`${nom} : la page déborde à ${largeur.width} px (scrollWidth ${sw})`)
    if (principal && nb === 1) {
      const b = await principaux.first().boundingBox()
      if (b && (b.height < 44 || b.width < 44)) throw new Echec(`${nom} : action principale de ${Math.round(b.width)} × ${Math.round(b.height)} px, sous 44 px`)
    }
  }
  controlerConsole(ctx, nom, attendues)
  if (j.erreurs5xx.length) throw new Echec(`${nom} : requête(s) en 5xx : ${j.erreurs5xx.join(' ; ')}`)
  await capturer(ctx, nom)
}

function controlerConsole(ctx, nom, attendues = null) {
  const inconnues = ctx.j.console.splice(0).filter((m) => !(attendues && attendues.test(m)))
  if (inconnues.length) throw new Echec(`${nom} : erreur(s) dans la console :\n${inconnues.join('\n')}`)
  if (ctx.j.erreurs5xx.length) throw new Echec(`${nom} : requête(s) en 5xx : ${ctx.j.erreurs5xx.join(' ; ')}`)
}

function lireZip(fichier, temoin) {
  // La liste des pièces, et celle dont le contenu est EXACTEMENT celui du fichier témoin (la pièce du coffre-fort).
  const r = spawnSync('python3', ['-I', '-c',
    'import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);t=open(sys.argv[2],"rb").read() if sys.argv[2] else None;'
    + 'print(json.dumps({"noms":z.namelist(),"temoin":[n for n in z.namelist() if t is not None and z.read(n)==t]}))', fichier, temoin || ''], { encoding: 'utf8' })
  if (r.status !== 0) throw new Echec('export : le ZIP ne s’ouvre pas : ' + r.stderr.slice(-300))
  return JSON.parse(r.stdout)
}

// ── Les gestes communs ──────────────────────────────────────────────────────
async function deposer(ctx, zip) {
  const { page } = ctx
  await page.goto(BASE + '/projects/new', { waitUntil: 'domcontentloaded' })
  await controler(ctx, 'nouveau', { titre: TITRES.nouveau, principal: false })
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), bouton(page, VERBES.zoneDepot).click()])
  await choix.setFiles(zip)
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/upload/, { timeout: 60_000 })
  ctx.id = page.url().match(/projects\/([0-9a-f-]{36})/)[1]
  await controler(ctx, 'depot', { titre: TITRES.depot, fil: FIL[0] })
  await suivant(ctx, FIL[1])
  await page.waitForURL(/\/lots$/, { timeout: 30_000 })
  await controler(ctx, 'lots', { titre: TITRES.lots, fil: FIL[1] })
}

/** L'analyse finie, l'écran Décider propose « On y va ». */
async function attendreDecider(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/analysis$/, { timeout: 30_000 })
  const action = bouton(page, VERBES.yAller, true).first()
  try { await action.waitFor({ timeout: 30_000 }) } catch {
    const p = await api_(page, 'GET', `/api/projects/${ctx.id}`)
    if (p.corps?.processing_status !== 'analyzing') throw new Echec('décider : analyse finie côté serveur, l’écran reste sur l’attente')
    await action.waitFor({ timeout: ATTENTE_IA })
  }
  await controler(ctx, 'decider', { titre: TITRES.decider, fil: FIL[2] })
  return action
}

// ── A : coffre-fort, questions, panne pendant la rédaction, statut ─────────
async function parcoursA(nav, dossiers) {
  const { bctx, ctx } = await ouvrir(nav, ORDI)
  ctx.parcours = 'A'
  const { page } = ctx
  const debut = Date.now()
  try {
    await menage(page)
    // La pièce est au coffre-fort AVANT le parcours (rangée là par l'entreprise) ; le parcours la CHOISIT, il ne la dépose pas.
    const docs = await api_(page, 'GET', '/api/documents')
    for (const d of (Array.isArray(docs.corps) ? docs.corps : docs.corps?.items ?? [])) {
      if (d.file_name === path.basename(dossiers.attestation)) await api_(page, 'DELETE', `/api/documents/${d.id}`)
    }
    const range = await page.evaluate(async ({ b64, nom }) => {
      const t = await window.Clerk.session.getToken()
      const fd = new FormData()
      fd.append('file', new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }), nom)
      fd.append('type', 'decennale')
      const r = await fetch('/api/documents', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd })
      return { s: r.status, id: (await r.json().catch(() => ({}))).id }
    }, { b64: readFileSync(dossiers.attestation).toString('base64'), nom: path.basename(dossiers.attestation) })
    if (range.s >= 300 || !range.id) throw new Echec(`coffre-fort : la pièce de départ n'a pas pu y être rangée (${range.s})`)

    await deposer(ctx, dossiers.coffre)
    await page.getByRole('button', { name: /^Lot 01/ }).first().click()
    await bouton(page, VERBES.analyserLot).click()
    const yAller = await attendreDecider(ctx)

    // 2. « Préparer les questions » : les questions simulées s'affichent, chacune avec sa source dans le dossier.
    const avantQuestions = await unites(page)
    await bouton(page, M.preparerQuestions, true).click()
    // La question (texte de l'IA simulée, backend/tests/e2e/api_simulee.py) et, dans la même carte, sa source.
    const question = page.getByText(/^Le planning détaillé attendu sous quinze jours/)
    await question.waitFor({ timeout: 30_000 })
    // La carte de la question : le plus proche parent qui porte aussi une ligne « Source : … ».
    const source = await question.evaluate((el, debut) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const l = (n.innerText || '').split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).find((x) => x.startsWith(debut))
        if (l) return l
      }
      return ''
    }, M.sourcePoint.trim())
    if (!/CCTP/.test(source)) throw new Echec(`questions : la source de la question ne cite pas le CCTP (« ${source} »)`)
    await question.scrollIntoViewIfNeeded()
    await controler(ctx, 'questions', { titre: TITRES.decider, fil: FIL[2] })
    const apresQuestions = await unites(page)
    if (apresQuestions.analyses !== avantQuestions.analyses) throw new Echec('questions : la préparation a décompté une unité')
    ctx.faits.push(`« ${M.preparerQuestions} » : la question simulée s'affiche, « ${source.trim()} », rien décompté`)
    await yAller.click()

    // 1. Pièces : l'attestation déjà au coffre-fort est CHOISIE pour la ligne « Décennale ».
    await page.waitForURL(/\/verification$/, { timeout: 30_000 })
    await controler(ctx, 'pieces', { titre: TITRES.pieces, fil: FIL[3] })
    // La ligne « … décennale » : « Choisir » si rien n'y est lié, « Remplacer » si le coffre-fort y a déjà rattaché une pièce
    // (rattachement automatique à la création de la liste) ; les deux ouvrent le même choix dans le coffre-fort.
    const geste = new RegExp(`^(${M.choisirPiece}|${M.remplacerPiece})$`)
    const ligne = page.locator('xpath=//*[.//button]').filter({ hasText: M.pieceDuCoffre }).filter({ has: page.getByRole('button', { name: geste }) }).last()
    await ligne.getByRole('button', { name: geste }).click()
    const dialogue = page.getByRole('dialog', { name: M.dialogueCoffre })
    await dialogue.waitFor({ timeout: 15_000 })
    await capturer(ctx, 'coffre-fort-ouvert')
    const lien = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/checklist\/[^/]+\/link$/.test(new URL(r.url()).pathname), { timeout: 30_000 })
    await dialogue.getByRole('button', { name: `${M.choisirPiece} ${path.basename(dossiers.attestation)}`, exact: true }).click()
    const rep = await lien
    if (rep.status() >= 300) throw new Echec(`pièces : le rattachement a répondu ${rep.status()}`)
    await dialogue.waitFor({ state: 'hidden', timeout: 15_000 })
    // La ligne est rattachée à CETTE pièce du coffre-fort (lu côté serveur : l'écran dit « Lié au coffre-fort », sans le nom).
    const liste = (await api_(page, 'GET', `/api/projects/${ctx.id}/checklist`)).corps ?? []
    if (!liste.some((i) => i.linked_document_id === range.id)) throw new Echec('pièces : la ligne n’est pas rattachée à la pièce choisie au coffre-fort')
    await controler(ctx, 'piece-choisie', { titre: TITRES.pieces, fil: FIL[3] })
    await suivant(ctx, FIL[4])

    // Plan validé, puis 3. la rédaction en panne : message du produit, unité rendue, relance.
    await page.waitForURL(/\/plan$/, { timeout: 30_000 })
    await controler(ctx, 'plan', { titre: TITRES.plan, fil: FIL[4] })
    await bouton(page, VERBES.validerPlan, true).click()
    await bouton(page, VERBES.rediger, true).click()
    await page.waitForURL(/\/memoire$/, { timeout: 30_000 })
    await controler(ctx, 'rediger', { titre: TITRES.rediger, fil: FIL[5] })
    await page.getByLabel(CHAMPS_MEMOIRE.ouvriers).fill('4')
    await page.getByLabel(CHAMPS_MEMOIRE.delai).fill('6 mois')
    const avant = await unites(page)
    const appelsAvant = Object.values(appelsDepuis(0)).reduce((a, b) => a + b, 0)
    writeFileSync(PANNE, 'redaction')
    await bouton(page, VERBES.rediger, true).click()
    const message = page.getByRole('alert').filter({ hasText: /\S/ }).first()
    try { await message.waitFor({ timeout: 60_000 }) } catch {
      throw new Echec('panne rédaction : aucun message d’échec à l’écran')
    }
    await page.waitForTimeout(1500)
    const texte = (await message.innerText()).trim()
    await capturer(ctx, 'panne-redaction-message')
    if (/\[[\w-]+\]|tentatives|Connection error|Exception|Traceback|APIConnection|anthropic|Error/i.test(texte)) {
      constat(ctx, `panne rédaction : le message montre l’erreur technique (« ${texte.split('\n')[0].slice(0, 120)} »)`)
    }
    const appelsPanne = Object.values(appelsDepuis(0)).reduce((a, b) => a + b, 0) - appelsAvant
    if (appelsPanne < 1) throw new Echec('panne rédaction : aucun appel de rédaction n’est parti (la panne n’a pas été jouée)')
    let apres = await unites(page)
    for (let i = 0; i < 10 && apres.memoires !== avant.memoires; i++) { await page.waitForTimeout(1000); apres = await unites(page) }
    if (apres.memoires !== avant.memoires) throw new Echec(`panne rédaction : l'unité n'est pas rendue (mémoires ${avant.memoires} → ${apres.memoires})`)
    controlerConsole(ctx, 'panne rédaction')
    unlinkSync(PANNE)
    // La relance : le bouton que l'écran propose après l'échec (« Relancer » s'il est là, sinon le geste de l'étape).
    const relancer = (await bouton(page, VERBES.relancer, true).count()) ? bouton(page, VERBES.relancer, true) : bouton(page, VERBES.rediger, true)
    const nomRelance = (await relancer.innerText()).trim()
    if (nomRelance !== VERBES.relancer) constat(ctx, `panne rédaction : pas de « ${VERBES.relancer} » après l’échec, la relance passe par « ${nomRelance} » (routes/project/StepMemoire.tsx:452, FormulaireMemoire.tsx:75)`)
    await relancer.click()
    const versExport = bouton(page, VERBES.passerExport, true)
    try { await versExport.waitFor({ timeout: 30_000 }) } catch {
      const p = await api_(page, 'GET', `/api/projects/${ctx.id}`)
      if (p.corps?.processing_status !== 'generating') throw new Echec('panne rédaction : relance finie côté serveur, l’écran reste sur l’attente')
      await versExport.waitFor({ timeout: ATTENTE_IA })
    }
    await controler(ctx, 'redige-apres-relance', { titre: TITRES.rediger, fil: FIL[5] })
    const relance = await unites(page)
    if (relance.memoires !== avant.memoires + 1) throw new Echec(`relance : mémoires ${avant.memoires} → ${relance.memoires}, attendu +1`)
    ctx.faits.push(`IA en panne pendant la rédaction : « ${texte.split('\n')[0].slice(0, 80)} », unité rendue (${avant.memoires} → ${apres.memoires}), « ${nomRelance} » rédige (→ ${relance.memoires})`)
    await versExport.click()

    // Export : la pièce choisie au coffre-fort est dans le ZIP, octet pour octet.
    await page.waitForURL(/\/export$/, { timeout: 30_000 })
    await controler(ctx, 'export', { titre: TITRES.export, fil: FIL[6] })
    const avantZip = ctx.j.telechargements.length
    await bouton(page, VERBES.telecharger, true).click()
    await page.getByRole('button', { name: VERBES.depose, exact: true }).waitFor({ timeout: 60_000 })
    for (let i = 0; i < 20 && ctx.j.telechargements.length === avantZip; i++) await page.waitForTimeout(500)
    const recu = ctx.j.telechargements[avantZip]
    if (!recu) throw new Echec('export : aucun dossier téléchargé')
    const zip = path.join(TRAVAIL, 'dossier-A.zip')
    await recu.saveAs(zip)
    const contenu = lireZip(zip, dossiers.attestation)
    if (!contenu.temoin.length) throw new Echec(`export : la pièce choisie au coffre-fort n'est pas dans le ZIP :\n${contenu.noms.join('\n')}`)
    ctx.faits.push(`pièce choisie au coffre-fort, dans le ZIP : « ${contenu.temoin[0]} » (même contenu, octet pour octet)`)

    // 6. Statut : « Je l'ai déposé », « Gagné », puis la correction « Perdu » (D16) ; le bilan de l'Accueil suit.
    const stats = async () => (await api_(page, 'GET', '/api/dashboard/stats')).corps
    const s0 = await stats()
    await page.getByRole('button', { name: VERBES.depose, exact: true }).click()
    await choisirStatut(ctx, VERBES.depose, 'statut-depose')
    await page.getByText(DEPOSE, { exact: true }).first().waitFor({ timeout: 15_000 })
    await ouvrirStatut(ctx)
    await choisirStatut(ctx, M.gagne, 'statut-gagne')
    const s1 = await stats()
    if (s1.projects_gagnes !== s0.projects_gagnes + 1) throw new Echec(`statut : gagnés ${s0.projects_gagnes} → ${s1.projects_gagnes} après « Gagné », attendu +1`)
    const bilan1 = await bilanAccueil(ctx, 'accueil-gagne')
    if (!dit(bilan1, s1)) throw new Echec(`bilan après « Gagné » : l'Accueil dit « ${bilan1} », le serveur ${JSON.stringify(s1)}`)
    // Un AO gagné n'a plus d'action sur sa page : la correction (D16) passe par Mes AO, menu « … » de sa rangée.
    await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' })
    const recherche = page.getByRole('search', { name: M.rechercheMesAO })
    await recherche.getByRole('searchbox').or(recherche.getByRole('textbox')).first().fill(`${MARQUE} coffre`)
    // Les terminés sont repliés : « Afficher » les déplie.
    const afficher = page.getByRole('button', { name: M.afficherTermines, exact: true })
    await afficher.waitFor({ timeout: 15_000 })
    if ((await afficher.getAttribute('aria-expanded')) !== 'true') await afficher.click()
    await page.getByRole('button', { name: `${M.menuAO}${MARQUE} coffre »`, exact: true }).first().click()
    await page.getByRole('menuitem', { name: VERBES.dialogueStatut, exact: true }).click()
    await choisirStatut(ctx, M.corrigerPerdu, 'statut-perdu')
    const s2 = await stats()
    if (s2.projects_gagnes !== s0.projects_gagnes) throw new Echec(`statut : gagnés ${s1.projects_gagnes} → ${s2.projects_gagnes} après la correction « Perdu », attendu ${s0.projects_gagnes}`)
    const bilan2 = await bilanAccueil(ctx, 'accueil-perdu')
    if (!dit(bilan2, s2)) throw new Echec(`bilan après « Perdu » : l'Accueil dit « ${bilan2} », le serveur ${JSON.stringify(s2)}`)
    ctx.faits.push(`statut : déposé → gagné (gagnés ${s0.projects_gagnes} → ${s1.projects_gagnes}, taux ${s0.taux_succes} → ${s1.taux_succes} %) → corrigé « Perdu » (gagnés ${s2.projects_gagnes}, taux ${s2.taux_succes} %) ; l'Accueil suit`)
  } catch (e) {
    throw await echec(ctx, 'A', e)
  } finally {
    if (existsSync(PANNE)) unlinkSync(PANNE)
    ctx.appels = appelsDepuis(debut)
    await bctx.close()
  }
  return ctx
}

/** « Indiquer le résultat » (bandeau « Le dossier est déposé » de la page de l’AO) ouvre « Mettre à jour le statut ». */
async function ouvrirStatut(ctx) {
  await ctx.page.getByRole('button', { name: M.statut, exact: true }).first().click()
}
async function choisirStatut(ctx, libelle, capture) {
  const { page } = ctx
  const dialogue = page.getByRole('dialog', { name: VERBES.dialogueStatut })
  await dialogue.waitFor({ timeout: 10_000 })
  await dialogue.getByRole('radio', { name: nomCommence(libelle) }).dispatchEvent('click')
  await capturer(ctx, capture)
  const ecrit = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/projects/${ctx.id}`, { timeout: 15_000 })
  await dialogue.getByRole('button', { name: VERBES.enregistrer, exact: true }).click()
  if ((await ecrit).status() >= 300) throw new Echec(`statut « ${libelle} » : le serveur a refusé`)
  await dialogue.waitFor({ state: 'hidden', timeout: 15_000 })
  controlerConsole(ctx, `statut ${libelle}`)
}
/** Le bilan de l'Accueil dit ce que dit le serveur : le taux et les marchés gagnés (ligne absente quand rien n'est décidé). */
function dit(ligne, s) {
  const l = ligne.replace(/\s/g, '')
  if (!(s.projects_gagnes > 0 || s.taux_succes > 0)) return ligne === ''
  return l.includes(`${s.taux_succes}%`) && (s.projects_gagnes === 0 || l.includes(`${s.projects_gagnes}march`))
}
/** Le bilan de l'Accueil (« Taux de réussite ») : la ligne lue à l'écran, '' si elle n'y est pas. */
async function bilanAccueil(ctx, capture) {
  const { page } = ctx
  const stats = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard/stats' && r.status() === 200, { timeout: 30_000 })
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
  await stats
  await page.getByRole('heading', { level: 1, name: nomCommence(TITRES_2.accueil) }).waitFor({ timeout: 30_000 })
  const coffre = page.getByRole('term').filter({ hasText: 'Coffre-fort' })
  await coffre.waitFor({ timeout: 15_000 })
  const ligne = page.getByRole('term').filter({ hasText: M.bilan }).locator('xpath=..')
  const presente = await ligne.count()
  await (presente ? ligne : coffre).scrollIntoViewIfNeeded()
  await controler(ctx, capture, { principal: false })
  if (!presente) return ''
  return (await ligne.innerText()).replace(/\s+/g, ' ')
}

// ── B : deux lots, l'Export de chaque lot propose la DPGF de son lot ───────
async function parcoursB(nav, dossiers) {
  const { bctx, ctx } = await ouvrir(nav, ORDI)
  ctx.parcours = 'B'
  const { page } = ctx
  const debut = Date.now()
  try {
    await deposer(ctx, dossiers.deuxLots)
    const avant = await unites(page)
    await page.getByRole('button', { name: /^Lot 01/ }).first().click()
    await page.getByRole('button', { name: /^Lot 02/ }).first().click()
    await bouton(page, M.analyserLots).click()
    const confirmer = page.getByRole('dialog').getByRole('button', { name: M.confirmerLots, exact: true })
    await confirmer.waitFor({ timeout: 10_000 })
    await capturer(ctx, 'confirmer-deux-lots')
    await confirmer.click()
    const yAller = await attendreDecider(ctx)
    const apres = await unites(page)
    if (apres.analyses !== avant.analyses + 2) throw new Echec(`deux lots : analyses ${avant.analyses} → ${apres.analyses}, attendu +2`)
    await yAller.click()
    await page.waitForURL(/\/verification$/, { timeout: 30_000 })
    // L'Export du premier lot : la DPGF du lot 01.
    const lots = (await api_(page, 'GET', `/api/projects/${ctx.id}`)).corps?.lots_detectes ?? []
    const vus = []
    for (const [i, lot] of lots.slice(0, 2).entries()) {
      if (i > 0) {
        // Aucun écran ne mène à l'Export d'un autre lot déjà lu sans le relire (StepLotSelection : le seul geste est
        // « Analyser 1 lot », 1 unité) : le lot est choisi comme l'écran Lots le fait (POST lots/select), sans relecture.
        const choix = await api_(page, 'POST', `/api/projects/${ctx.id}/lots/select`, { lot_id: lot.id, lot_name: lot.nom })
        if (choix.s >= 300) throw new Echec(`deux lots : le choix du ${lot.nom} a répondu ${choix.s}`)
        constat(ctx, 'deux lots : aucun écran ne mène à l’Export du second lot lu sans le relire (1 unité de plus) : routes/project/StepExport.tsx (pas de choix du lot), routes/project/StepLotSelection.tsx:499 (seul geste : « Analyser 1 lot »)')
      }
      const detail = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/export/detail') && r.status() === 200, { timeout: 30_000 })
      await page.goto(`${BASE}/projects/${ctx.id}/export`, { waitUntil: 'domcontentloaded' })
      const d = await (await detail).json()
      await controler(ctx, `export-${lot.id}`, { titre: TITRES.export, fil: FIL[6] })
      const tableau = bouton(page, M.tableauAcheteur, true)
      await tableau.scrollIntoViewIfNeeded()
      const carte = tableau.locator('xpath=ancestor::div[1]')
      const nomFichier = d.dpgf_info?.file_name || ''
      await carte.getByText(nomFichier, { exact: true }).waitFor({ timeout: 10_000 })
      await capturer(ctx, `dpgf-${lot.id}`)
      const numero = lot.nom.match(/Lot (\d+)/)?.[1]
      if (!numero || !nomFichier.includes(`Lot ${numero}`)) throw new Echec(`deux lots : l'Export du ${lot.nom} propose « ${nomFichier} »`)
      // Le fichier téléchargé est bien celui du lot (la feuille du tableur porte le numéro du lot).
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), tableau.click()])
      const f = path.join(TRAVAIL, `dpgf-${lot.id}.xlsx`)
      await dl.saveAs(f)
      const feuilles = spawnSync('python3', ['-I', '-c', 'import sys,zipfile,re;print(" ".join(re.findall(r\'name="([^"]+)"\', zipfile.ZipFile(sys.argv[1]).read("xl/workbook.xml").decode())))', f], { encoding: 'utf8' }).stdout.trim()
      if (feuilles !== `Lot ${numero}`) throw new Echec(`deux lots : le tableau téléchargé pour le ${lot.nom} a les feuilles « ${feuilles} »`)
      vus.push(`${lot.nom} → « ${nomFichier} » (feuille « ${feuilles} »)`)
      controlerConsole(ctx, `dpgf ${lot.id}`)
    }
    if (vus.length !== 2) throw new Echec(`deux lots : ${lots.length} lot(s) repéré(s) dans le dossier, attendu 2`)
    ctx.faits.push(`deux lots lus d'un coup (analyses ${avant.analyses} → ${apres.analyses}) ; Export : ${vus.join(' ; ')}`)
  } catch (e) {
    throw await echec(ctx, 'B', e)
  } finally {
    ctx.appels = appelsDepuis(debut)
    await bctx.close()
  }
  return ctx
}

// ── C : quota du mois épuisé → mur d'abonnement, rien décompté, rien envoyé à l'IA ──
async function parcoursC(nav, dossiers, largeur) {
  const { bctx, ctx } = await ouvrir(nav, largeur)
  ctx.parcours = 'C'
  const { page } = ctx
  const debut = Date.now()
  try {
    await menage(page)
    const avant = await unites(page)
    if (!(avant.analyses >= 5)) throw new Echec(`quota : l'organisation de test n'est pas épuisée (${avant.analyses} analyses)`)
    await deposer(ctx, largeur.tel ? dossiers.quotaTel : dossiers.quota)
    await page.getByRole('button', { name: /^Lot 01/ }).first().click()
    const appelsAvant = appelsDepuis(debut)
    await bouton(page, VERBES.analyserLot).click()
    const mur = page.getByRole('dialog', { name: M.murAbonnement })
    await mur.waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    await controler(ctx, 'mur-abonnement', { principal: false, attendues: CONSOLE_ATTENDUES.quota })
    const apres = await unites(page)
    if (apres.analyses !== avant.analyses) throw new Echec(`quota : analyses ${avant.analyses} → ${apres.analyses} : une unité a été décomptée`)
    const appels = appelsDepuis(debut)
    if (JSON.stringify(appels) !== JSON.stringify(appelsAvant)) throw new Echec(`quota : des appels sont partis à l'IA : ${JSON.stringify(appels)}`)
    const p = (await api_(page, 'GET', `/api/projects/${ctx.id}`)).corps
    if (['analyzing', 'analyzed'].includes(p?.processing_status) || p?.status === 'analyzed') throw new Echec(`quota : l'AO est parti en lecture (${p?.processing_status})`)
    ctx.faits.push(`quota épuisé (${avant.analyses} analyses sur 5, Essentiel) : « ${M.murAbonnement} » s'ouvre, analyses ${avant.analyses} → ${apres.analyses}, 0 appel d'IA`)
    await page.keyboard.press('Escape')
    await mur.waitFor({ state: 'hidden', timeout: 10_000 })
    controlerConsole(ctx, 'mur fermé', CONSOLE_ATTENDUES.quota)
  } catch (e) {
    throw await echec(ctx, 'C', e)
  } finally {
    ctx.appels = appelsDepuis(debut)
    await bctx.close()
  }
  return ctx
}

// ── D : « Supprimer mon compte » sans abonnement : le dialogue et son message (non confirmé : la suppression appelle Clerk) ──
async function parcoursD(nav) {
  const { bctx, ctx } = await ouvrir(nav, ORDI)
  ctx.parcours = 'D'
  const { page } = ctx
  try {
    const moi = (await api_(page, 'GET', '/api/auth/me')).corps
    if (!String(moi?.organization?.name || '').startsWith('E2E2')) throw new Echec(`suppression : le compte n'est pas sur l'organisation de test (${moi?.organization?.name})`)
    const apercu = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/suppression', { timeout: 15_000 })
    await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' })
    await controler(ctx, 'parametres', { titre: TITRES_2.parametres, principal: false })
    const supprimer = bouton(page, M.supprimerCompte, true)
    await supprimer.scrollIntoViewIfNeeded()
    let suppressions = 0
    page.on('request', (r) => { if (r.method() === 'DELETE' && new URL(r.url()).pathname === '/api/users/me') suppressions += 1 })
    await supprimer.click()
    const lu = await apercu
    const corps = await lu.json()
    if (lu.status() !== 200 || corps.immediate !== true) throw new Echec(`suppression : l'aperçu dit ${lu.status()} ${JSON.stringify(corps)}, attendu une suppression immédiate (aucun abonnement)`)
    const dialogue = page.getByRole('alertdialog', { name: M.dialogueSuppression }).or(page.getByRole('dialog', { name: M.dialogueSuppression }))
    await dialogue.waitFor({ timeout: 10_000 })
    await dialogue.getByText(M.suppressionImmediate, { exact: false }).waitFor({ timeout: 5_000 })
    await dialogue.getByRole('button', { name: M.confirmerSuppression, exact: true }).waitFor({ timeout: 5_000 })
    await controler(ctx, 'suppression-dialogue', { principal: false })
    await dialogue.getByRole('button', { name: M.annuler, exact: true }).click()
    await dialogue.waitFor({ state: 'hidden', timeout: 10_000 })
    const encore = await api_(page, 'GET', '/api/auth/me')
    if (encore.s !== 200 || suppressions) throw new Echec('suppression : le compte a été touché alors que le dialogue a été annulé')
    ctx.faits.push(`« ${M.supprimerCompte} » (organisation de test, sans abonnement) : « ${M.dialogueSuppression} », suppression immédiate annoncée, « ${M.confirmerSuppression} » proposé, NON confirmé (la suppression appelle Clerk), annulé : compte intact`)
  } catch (e) {
    throw await echec(ctx, 'D', e)
  } finally {
    await bctx.close()
  }
  return ctx
}

async function echec(ctx, nom, e) {
  const f = await capturer(ctx, 'echec')
  const ou = e instanceof Echec ? '' : '\n' + String(e.stack || '').split('\n').filter((l) => l.includes('parcours-2.mjs')).slice(0, 2).join('\n')
  return new Echec(`[${nom} · ${ctx.largeur.nom}] ${e.message.split('\nCall log')[0]}${ou}\nURL ${ctx.page.url()}\ncapture ${f}\n${await inventaire(ctx.page).catch(() => '')}`)
}

// ── Programme ───────────────────────────────────────────────────────────────
let code = 0
const bilan = []
let nav
try {
  if (!(await sante(BASE + '/'))) throw new Echec(`le front ne répond pas sur ${BASE} (banc.sh lancer <copie>)`)
  const reparee = baseJetable('restaurer')
  if (reparee.restaure) dire('base jetable : le compte du test est rendu à son organisation (passage précédent interrompu)')
  const dossiers = fabriquerDossiers()
  dire(`dossiers inventés : ${path.basename(dossiers.coffre)}, ${path.basename(dossiers.deuxLots)}`)
  await lancerApi()
  dire(`API à IA simulée prête sur :${PORT_API}`)
  nav = await chromium.launch({ headless: true, executablePath: CHROMIUM })
  if (SEUL.includes('A')) { dire('A · coffre-fort, questions, panne pendant la rédaction, statut (ordinateur)'); bilan.push(await parcoursA(nav, dossiers)) }
  if (SEUL.includes('B')) { dire('B · deux lots (ordinateur)'); bilan.push(await parcoursB(nav, dossiers)) }
  if (SEUL.includes('C') || SEUL.includes('D')) {
    // L'organisation de test (base jetable) : offre Essentiel sans abonnement, 5 analyses décomptées sur 5.
    const org = baseJetable('organisation-de-test')
    dire(`base jetable : compte rattaché à l'organisation de test ${org.organisation.slice(0, 8)}… (quota épuisé)`)
    try {
      if (SEUL.includes('C')) {
        dire('C · quota épuisé (ordinateur)'); bilan.push(await parcoursC(nav, dossiers, ORDI))
        dire('C · quota épuisé (téléphone)'); bilan.push(await parcoursC(nav, dossiers, TEL))
      }
      if (SEUL.includes('D')) { dire('D · supprimer mon compte (ordinateur)'); bilan.push(await parcoursD(nav)) }
    } finally {
      baseJetable('restaurer')
      dire('base jetable : compte rendu à son organisation')
    }
  }
} catch (e) {
  code = 1
  console.error(`\nÉCHEC ${masquer(e.stack && !(e instanceof Echec) ? e.stack : e.message)}`)
  if (api?.journal) console.error('\n— fin du journal de l’API —\n' + masquer(api.journal.join('').split('\n').slice(-15).join('\n')))
} finally {
  if (nav) await nav.close().catch(() => {})
  arreterApi()
}
for (const b of bilan) {
  dire(`${b.parcours} (${b.largeur.nom}) · appels simulés : ${JSON.stringify(b.appels ?? {})}`)
  for (const f of b.faits) dire(`  ✓ ${f}`)
  for (const c of b.j.connues) dire(`  CONSTAT (${b.parcours}, ${b.largeur.nom}) : ${c}`)
}
console.log(code === 0
  ? `\nE2E-2 VERT : ${bilan.length} parcours (${bilan.map((b) => `${b.parcours} ${b.largeur.nom}`).join(', ')}), ${sec().trim()} s, captures dans ${CAPTURES}`
  : `\nE2E-2 ROUGE (${sec().trim()} s)`)
process.exit(code)
