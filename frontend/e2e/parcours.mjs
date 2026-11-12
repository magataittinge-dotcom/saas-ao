// Le parcours d'un client, du dépôt du dossier à l'export, sur une API à IA SIMULÉE (backend/tests/e2e/api_simulee.py).
// Joué deux fois (1 440 × 900, puis 390 × 844), puis les pannes. Échoue dès qu'une étape ne mène plus à la suivante.
// Mode d'emploi : frontend/e2e/LISEZMOI.md. Lancement : `npm run e2e` (dans frontend/).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, CHROMIUM, seConnecter, garderRequetes, masquer } from './outils.mjs'
import { FIL, NOM_FIL, TITRES, VERBES, DEPOSE, PIECE_JOINTE, CHAMPS_MEMOIRE, PARTIE_OUVERTE, SUITE } from './contrat.mjs'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BACKEND = path.join(RACINE, 'backend')
const PY = process.env.E2E_PYTHON || path.join(os.homedir(), 'sprint-ozcan-wt/venv-sprint/bin/python')
const BASE = process.env.E2E_BASE || 'http://localhost:3127'
const PORT_API = process.env.E2E_API_PORT || '8127'
const EMAIL = process.env.E2E_EMAIL || 'maga.taittinge@gmail.com'
const TRAVAIL = process.env.E2E_TRAVAIL || path.join(os.tmpdir(), 'synorix-e2e')
const CAPTURES = process.env.E2E_CAPTURES || path.join(TRAVAIL, 'captures')
const APPELS = path.join(TRAVAIL, 'appels.jsonl')
const PANNE = path.join(TRAVAIL, 'panne')
const MARQUE = 'E2E Ecole des Grebes'
const LARGEURS = [
  { nom: 'ordinateur', width: 1440, height: 900, tel: false },
  { nom: 'telephone', width: 390, height: 844, tel: true },
]
const ATTENTE_IA = 120_000
/** E2E_STRICT=1 : un constat connu (bug déjà porté au rapport, pas encore corrigé) fait échouer le passage. */
const STRICT = process.env.E2E_STRICT === '1'
function constat(ctx, texte) {
  if (STRICT) throw new Echec(`constat (E2E_STRICT) : ${texte}`)
  ctx.j.connues.add(texte)
}
/** Écrans connus sans exactement un bouton principal visible (largeur:écran:nombre → constat du rapport). */
const PRINCIPAL_CONNUS = {
  'telephone:decider:0': 'StepAnalysis.tsx:376 — au téléphone, l’écran Décider n’a aucun bouton principal : l’action de l’en-tête, montée mais cachée, fait céder l’aplat à « Suivant : Pièces » (StepAnalysis.tsx:356)',
}
/**
 * Erreurs de console CONNUES, déjà portées au rapport (constats à corriger dans l'appli, pas dans le test) : tolérées mais
 * comptées et écrites dans le bilan. Toute autre erreur fait échouer l'étape. Quand le constat est corrigé, retirez la ligne.
 */
const CONSOLE_CONNUES = [
  { motif: /validateDOMNesting[\s\S]*<p>[\s\S]*EtatElement/, constat: 'StepExport.tsx:526 — <p> autour d’EtatElement, qui rend lui-même un <p> (EtatElement.tsx:28)' },
]

const t0 = Date.now()
const sec = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
const dire = (m) => console.log(`[${sec()} s] ${m}`)
class Echec extends Error {}

// ── L'API à IA simulée et le dossier inventé ────────────────────────────────
mkdirSync(TRAVAIL, { recursive: true })
mkdirSync(CAPTURES, { recursive: true })
if (existsSync(PANNE)) unlinkSync(PANNE)
writeFileSync(APPELS, '')

function fabriquerDossier() {
  const r = spawnSync(PY, ['-m', 'tests.e2e.dce_invente', path.join(TRAVAIL, 'dce')], { cwd: BACKEND, encoding: 'utf8' })
  if (r.status !== 0) throw new Echec('dossier inventé : ' + (r.stderr || r.stdout).slice(-400))
  const f = r.stdout.trim().split('\n')
  return { zip: f[0], dc2: f.find((x) => x.includes('DC2')) }
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
  // SIGKILL : après SIGTERM, uvicorn s'arrête mais des fils de travail (lecture, rédaction) gardaient le processus en vie.
  if (api && api.exitCode === null) { try { process.kill(-api.pid, 'SIGKILL') } catch { /* déjà arrêtée */ } }
}
// Interrompu (Ctrl C, délai dépassé) : l'API simulée ne doit pas survivre au test, elle garderait le port.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { arreterApi(); process.exit(130) })

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
  return { ctx, page, j }
}

/** Le jeton de session, pour les appels directs du ménage. */
async function api_(page, methode, chemin) {
  return page.evaluate(async ({ methode, chemin }) => {
    const t = await window.Clerk.session.getToken()
    const r = await fetch(chemin, { method: methode, headers: { Authorization: `Bearer ${t}` } })
    return { s: r.status, corps: r.status === 204 ? null : await r.json().catch(() => null) }
  }, { methode, chemin })
}

/** Ménage : les AO du test laissés par un passage précédent (nom marqué) sont supprimés. */
async function menage(page) {
  const r = await api_(page, 'GET', '/api/projects')
  const liste = Array.isArray(r.corps) ? r.corps : (r.corps?.items ?? r.corps?.projects ?? [])
  const anciens = liste.filter((p) => String(p.name || '').startsWith(MARQUE))
  for (const p of anciens) await api_(page, 'DELETE', `/api/projects/${p.id}`)
  return anciens.length
}

// ── Les contrôles de chaque écran ──────────────────────────────────────────
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const nomCommence = (s) => new RegExp('^' + echapper(s))

async function inventaire(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const nom = (e) => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70)
    return [...document.querySelectorAll('h1,h2,button,[role=button],[role=dialog],[role=alert]')].filter(vis)
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('data-variante') ? '/' + e.getAttribute('data-variante') : ''}${e.disabled ? '(off)' : ''} ${nom(e)}`)
      .filter((l) => !/Mentions|CGU|CGV|Cookies|Confidentialit/.test(l)).join('\n')
  })
}

async function capturer(page, largeur, n, nom) {
  const f = path.join(CAPTURES, `${largeur.nom}-${String(n).padStart(2, '0')}-${nom}.png`)
  await page.screenshot({ path: f, fullPage: false }).catch(() => {})
  return f
}

/**
 * Contrôle d'un écran : titre, étape active du fil, un seul bouton principal visible, 0 erreur de console, aucune 5xx,
 * rien qui déborde au téléphone, cible de l'action principale ≥ 44 px au téléphone. Puis la capture.
 */
async function controler(ctx, cle, { fil, principal = true }) {
  const { page, j, largeur } = ctx
  ctx.n += 1
  const titre = TITRES[cle]
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor({ timeout: 30_000 })
  if (fil) {
    const actif = page.getByRole('navigation', { name: NOM_FIL }).locator('[aria-current="step"]')
    const nomActif = (await actif.getAttribute('aria-label', { timeout: 10_000 })) || ''
    if (!nomActif.startsWith(fil)) throw new Echec(`${cle} : étape active du fil « ${nomActif} », attendu « ${fil} »`)
  }
  await page.waitForTimeout(400)
  const principaux = page.locator('[data-variante="principal"]:visible')
  const nb = await principaux.count()
  if (principal && nb !== 1 && PRINCIPAL_CONNUS[`${largeur.nom}:${cle}:${nb}`]) constat(ctx, PRINCIPAL_CONNUS[`${largeur.nom}:${cle}:${nb}`])
  else if (principal && nb !== 1) throw new Echec(`${cle} : ${nb} bouton(s) principal(aux) visible(s), attendu 1\n${await inventaire(page)}`)
  if (largeur.tel) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    if (sw > largeur.width) throw new Echec(`${cle} : la page déborde à ${largeur.width} px (scrollWidth ${sw})`)
    if (principal && nb === 1) {
      const b = await principaux.first().boundingBox()
      if (b && (b.height < 44 || b.width < 44)) throw new Echec(`${cle} : action principale de ${Math.round(b.width)} × ${Math.round(b.height)} px, sous 44 px`)
    }
  }
  await controlerConsole(ctx, cle)
  if (j.erreurs5xx.length) throw new Echec(`${cle} : requête(s) en 5xx : ${j.erreurs5xx.join(' ; ')}`)
  const f = await capturer(page, largeur, ctx.n, cle)
  ctx.etapes.push({ cle, s: sec().trim(), capture: path.basename(f) })
  dire(`  ✓ ${largeur.nom} · ${titre}`)
}

async function controlerConsole(ctx, cle) {
  const inconnues = []
  for (const m of ctx.j.console.splice(0)) {
    const connue = CONSOLE_CONNUES.find((c) => c.motif.test(m))
    if (connue) constat(ctx, connue.constat); else inconnues.push(m)
  }
  if (inconnues.length) throw new Echec(`${cle} : erreur(s) dans la console :\n${inconnues.join('\n')}`)
  if (ctx.j.erreurs5xx.length) throw new Echec(`${cle} : requête(s) en 5xx : ${ctx.j.erreurs5xx.join(' ; ')}`)
}

/** Le bouton de suite de l'écran, vers l'étape `etiquette` du fil. */
const suivant = (ctx, etiquette) => ctx.page.getByRole('button', { name: SUITE[ctx.largeur.nom] + etiquette, exact: true }).click()
const bouton = (page, nom, exact = false) => page.getByRole('button', { name: exact ? nom : nomCommence(nom), exact })
const principal = (page) => page.locator('[data-variante="principal"]:visible')

// ── Les sept étapes ─────────────────────────────────────────────────────────
async function etapeDepot(ctx, zip) {
  const { page } = ctx
  await page.goto(BASE + '/projects/new', { waitUntil: 'domcontentloaded' })
  await controler(ctx, 'nouveau', { fil: null, principal: false })
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), bouton(page, VERBES.zoneDepot).click()])
  await choix.setFiles(zip)
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/upload/, { timeout: 60_000 })
  ctx.id = page.url().match(/projects\/([0-9a-f-]{36})/)[1]
  await controler(ctx, 'depot', { fil: FIL[0] })
  await suivant(ctx, FIL[1])
}

async function etapeLots(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/lots$/, { timeout: 30_000 })
  await controler(ctx, 'lots', { fil: FIL[1] })
  await page.getByRole('button', { name: /^Lot 01/ }).first().click()
  const lancer = bouton(page, VERBES.analyserLot)
  await lancer.click()
}

async function etapeDecider(ctx) {
  const { page } = ctx
  // L'analyse finie, le serveur marque déjà l'étape 3 faite (routers/analysis.py) : l'action de l'écran dit « Passer aux
  // pièces », « On y va » ne s'affiche pas (constat du rapport E2E).
  await page.waitForURL(/\/analysis$/, { timeout: 30_000 })
  // Au téléphone, l'action est le bouton de suite de la barre du bas.
  const action = ctx.largeur.tel
    ? page.getByRole('button', { name: SUITE.telephone + FIL[3], exact: true })
    : bouton(page, VERBES.passerPieces, true)
  try {
    await action.waitFor({ timeout: 30_000 })
  } catch {
    // L'analyse simulée finit en moins d'une seconde : si l'écran d'attente reste affiché alors que le serveur a fini,
    // c'est le constat « fin d'analyse manquée » ; un rechargement doit montrer l'écran Décider.
    const p = await api_(page, 'GET', `/api/projects/${ctx.id}`)
    if (p.corps?.processing_status === 'analyzing') { await action.waitFor({ timeout: ATTENTE_IA }) } else {
      constat(ctx, 'StepAnalysis.tsx:331 — analyse finie côté serveur, l’écran reste sur « Synorix analyse votre dossier » (Démarrage) : la fin, survenue avant l’abonnement au flux, n’est jamais vue (processing_status du projet en cache, jamais relu) ; un rechargement débloque')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await action.waitFor({ timeout: 30_000 })
    }
  }
  await controler(ctx, 'decider', { fil: FIL[2] })
  // La décision revient à l'utilisateur : « On y va » doit lui être proposé avant toute suite.
  if (!(await bouton(page, VERBES.yAller, true).count())) {
    constat(ctx, 'SynorixScoreCard.tsx:74 — la fiche « On y va ? » dit « Vous avez décidé d’y aller » dès la fin de l’analyse, sans décision : decideAller lit completed_steps["3"], que routers/analysis.py:826 pose à la fin de la lecture (current_step passe à 4, aDecider d’action.ts:35 n’est jamais vrai, l’en-tête dit « Passer aux pièces », StepAnalysis.tsx:178)')
  }
  await action.click()
}

async function etapePieces(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/verification$/, { timeout: 30_000 })
  await controler(ctx, 'pieces', { fil: FIL[3] })
  // Une pièce déposée : le DC2 inventé, sur la ligne du formulaire de l'acheteur qui le demande.
  const ligne = page.getByText(PIECE_JOINTE, { exact: true })
    .locator(`xpath=ancestor::*[.//button[normalize-space()="${VERBES.deposerFormulaire}"]][1]`)
  const envoi = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/api/') && r.status() < 300, { timeout: 30_000 })
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), ligne.getByRole('button', { name: VERBES.deposerFormulaire }).click()])
  await choix.setFiles(ctx.dossier.dc2)
  await envoi
  await page.waitForTimeout(1500)
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'piece-jointe')
  await suivant(ctx, FIL[4])
}

async function etapePlan(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/plan$/, { timeout: 30_000 })
  await controler(ctx, 'plan', { fil: FIL[4] })
  // Panne : un pas en arrière dans le fil, puis le retour arrière du navigateur → l'écran Plan, intact.
  await page.getByRole('navigation', { name: NOM_FIL }).getByRole('button', { name: FIL[2], exact: true }).click()
  await page.waitForURL(/\/analysis$/, { timeout: 15_000 })
  await page.getByRole('heading', { level: 1, name: TITRES.decider, exact: true }).waitFor({ timeout: 15_000 })
  await page.goBack()
  await page.waitForURL(/\/plan$/, { timeout: 15_000 })
  await controler(ctx, 'plan', { fil: FIL[4] })
  ctx.pannes.push('retour arrière du navigateur après un clic dans le fil : écran Plan intact')
  await bouton(page, VERBES.validerPlan, true).click()
  await bouton(page, VERBES.rediger, true).click()
}

async function etapeRediger(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/memoire$/, { timeout: 30_000 })
  await controler(ctx, 'rediger', { fil: FIL[5] })
  await page.getByLabel(CHAMPS_MEMOIRE.ouvriers).fill('4')
  await page.getByLabel(CHAMPS_MEMOIRE.delai).fill('6 mois')
  await bouton(page, VERBES.rediger, true).click()
  const versExport = ctx.largeur.tel
    ? page.getByRole('button', { name: SUITE.telephone + FIL[6], exact: true })
    : bouton(page, VERBES.passerExport, true)
  try { await versExport.waitFor({ timeout: 30_000 }) } catch {
    // Rédaction simulée finie en moins d'une seconde : si l'écran d'attente reste alors que le serveur a fini, c'est le constat.
    const p = await api_(page, 'GET', `/api/projects/${ctx.id}`)
    if (p.corps?.processing_status === 'generating') { await versExport.waitFor({ timeout: ATTENTE_IA }) } else {
      constat(ctx, 'StepMemoire.tsx:302 — rédaction finie côté serveur, l’écran reste sur « Synorix rédige votre mémoire » : la fin, survenue avant l’abonnement au flux, n’est jamais vue (même cause que StepAnalysis.tsx:331) ; un rechargement débloque')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await versExport.waitFor({ timeout: 30_000 })
    }
  }
  await page.waitForTimeout(1000)
  await controler(ctx, 'rediger', { fil: FIL[5] })
  // Une partie s'ouvre depuis le sommaire (replié derrière « Sommaire » au téléphone).
  if (ctx.largeur.tel) await bouton(page, VERBES.sommaire, true).click()
  await page.getByRole('button', { name: PARTIE_OUVERTE, exact: true }).first().click()
  await page.waitForTimeout(800)
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'partie-ouverte')
  // Une modification s'enregistre seule (éditeur bloc par bloc, enregistrement automatique).
  await bouton(page, VERBES.modifierTexte).click()
  const editeur = page.getByRole('dialog', { name: VERBES.editeur })
  await editeur.waitFor({ timeout: 15_000 })
  const bloc = editeur.getByRole('textbox').nth(1)
  await bloc.click()
  await page.keyboard.press('End')
  const ajout = ` Phrase ajoutée par le test E2E ${Date.now()}.`
  ctx.ajout = ajout
  const sauvegarde = page.waitForResponse((r) => ['PUT', 'PATCH', 'POST'].includes(r.request().method()) && /memoire/.test(r.url()), { timeout: 20_000 })
  await page.keyboard.type(ajout)
  const rep = await sauvegarde
  if (rep.status() >= 300) throw new Echec(`rédiger : l'enregistrement automatique a répondu ${rep.status()}`)
  await editeur.getByRole('status').filter({ hasText: VERBES.enregistre }).waitFor({ timeout: 15_000 })
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'modification-enregistree')
  await page.keyboard.press('Escape')
  await editeur.waitFor({ state: 'hidden', timeout: 10_000 })
  // Panne : rechargement au milieu de la rédaction → on retrouve l'étape et la modification.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await controler(ctx, 'rediger', { fil: FIL[5] })
  await page.getByText(ajout.trim().slice(0, 40)).first().waitFor({ state: 'attached', timeout: 15_000 })
  ctx.pannes.push('rechargement pendant Rédiger : étape et modification retrouvées')
  if (ctx.largeur.tel) await suivant(ctx, FIL[6])
  else await bouton(page, VERBES.passerExport, true).click()
}

async function etapeExport(ctx) {
  const { page } = ctx
  await page.waitForURL(/\/export$/, { timeout: 30_000 })
  await controler(ctx, 'export', { fil: FIL[6] })
  // Des pièces restent à joindre (DC1, assurance) : l'écran le dit et renvoie à l'étape Pièces par son verbe.
  await bouton(page, VERBES.reunir, true).first().waitFor({ timeout: 10_000 })
  // Panne : double clic sur « Télécharger le dossier » → un seul fichier.
  const avant = ctx.j.telechargements.length
  await bouton(page, VERBES.telecharger, true).dblclick()
  await page.getByRole('button', { name: VERBES.depose, exact: true }).waitFor({ timeout: 60_000 })
  await page.waitForTimeout(3000)
  const recus = ctx.j.telechargements.slice(avant)
  if (recus.length === 2) constat(ctx, 'StepExport.tsx:439 — double clic sur « Télécharger le dossier » : deux dossiers téléchargés (exportZip() lancé deux fois avant que isPending ne désactive le bouton)')
  else if (recus.length !== 1) throw new Echec(`export : ${recus.length} fichier(s) téléchargé(s) après un double clic, attendu 1`)
  else ctx.pannes.push('double clic sur « Télécharger le dossier » : un seul fichier')
  const zip = path.join(TRAVAIL, `dossier-${ctx.largeur.nom}.zip`)
  await recus[0].saveAs(zip)
  ctx.zip = lireZip(zip)
  // Le mémoire est dans le dossier (PDF quand LibreOffice est là, Word sinon : routers/export.py), après les pièces de candidature.
  const memoire = ctx.zip.findIndex((n) => /\.(docx|pdf)$/i.test(n) && /m[ée]moire/i.test(n))
  if (memoire < 0) throw new Echec(`export : pas de mémoire dans le ZIP :\n${ctx.zip.join('\n')}`)
  if (ctx.zip.findIndex((n) => /DC2/i.test(n)) > memoire) throw new Echec(`export : la candidature vient après l'offre :\n${ctx.zip.join('\n')}`)
  // Le mémoire en Word : il s'ouvre, et la modification faite à l'étape Rédiger y est.
  const [word] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), bouton(page, VERBES.memoireWord, true).click()])
  const docx = path.join(TRAVAIL, `memoire-${ctx.largeur.nom}.docx`)
  await word.saveAs(docx)
  const xml = spawnSync('python3', ['-I', '-c', 'import sys,zipfile,re;print(re.sub(r"<[^>]+>","",zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode()))', docx], { encoding: 'utf8' })
  if (xml.status !== 0) throw new Echec('export : le mémoire en Word ne s’ouvre pas : ' + xml.stderr.slice(-300))
  if (!xml.stdout.includes(ctx.ajout.trim().slice(0, 40))) throw new Echec('export : la modification de l’étape Rédiger n’est pas dans le Word')
  if (!ctx.zip.some((n) => /DC2/i.test(n))) throw new Echec(`export : la pièce jointe (DC2) n'est pas dans le ZIP :\n${ctx.zip.join('\n')}`)
  const numeros = ctx.zip.map((n) => path.basename(n).match(/^(\d+)/)?.[1]).filter(Boolean).map(Number)
  if (numeros.some((v, i) => i > 0 && v < numeros[i - 1])) throw new Echec(`export : pièces hors d'ordre dans le ZIP :\n${ctx.zip.join('\n')}`)
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'telecharge')
  // « Je l'ai déposé » → « Déposé ».
  await page.getByRole('button', { name: VERBES.depose, exact: true }).click()
  const dialogue = page.getByRole('dialog', { name: VERBES.dialogueStatut })
  await dialogue.waitFor({ timeout: 10_000 })
  await dialogue.getByRole('radio', { name: nomCommence(VERBES.depose) }).dispatchEvent('click')
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'statut')
  await dialogue.getByRole('button', { name: VERBES.enregistrer, exact: true }).click()
  await dialogue.waitFor({ state: 'hidden', timeout: 15_000 })
  await page.waitForTimeout(1000)
  ctx.n += 1
  await capturer(page, ctx.largeur, ctx.n, 'depose')
  await page.getByText(DEPOSE, { exact: true }).first().waitFor({ timeout: 15_000 })
  // Il quitte les AO en cours : Mes AO (vue par défaut, les AO en cours) et l'Accueil ne le montrent plus.
  for (const [ecran, url] of [['mesAO', '/projects'], ['accueil', '/dashboard']]) {
    const liste = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/projects' && r.status() === 200, { timeout: 30_000 })
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
    await liste
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    const encore = await page.getByText(MARQUE).count()
    ctx.n += 1
    await capturer(page, ctx.largeur, ctx.n, ecran)
    if (encore) throw new Echec(`${ecran} : l'AO déposé est encore affiché parmi les AO en cours`)
    if (ctx.j.console.length) await controlerConsole(ctx, ecran)
  }
  dire(`  ✓ ${ctx.largeur.nom} · Déposé : l'AO a quitté Mes AO et l'Accueil`)
}

function lireZip(fichier) {
  const r = spawnSync('python3', ['-I', '-c', 'import json,sys,zipfile;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', fichier], { encoding: 'utf8' })
  if (r.status !== 0) throw new Echec('export : le ZIP ne s’ouvre pas : ' + r.stderr.slice(-300))
  return JSON.parse(r.stdout)
}

// ── Un passage complet à une largeur ───────────────────────────────────────
async function passage(nav, largeur, dossier) {
  const zip = dossier.zip
  const { ctx: bctx, page, j } = await ouvrir(nav, largeur)
  const ctx = { page, j, largeur, n: 0, etapes: [], id: null, dossier, pannes: [] }
  const debut = Date.now()
  try {
    const supprimes = await menage(page)
    if (supprimes) dire(`  ménage : ${supprimes} AO d'un passage précédent supprimé(s)`)
    await etapeDepot(ctx, zip)
    await etapeLots(ctx)
    await etapeDecider(ctx)
    await etapePieces(ctx)
    await etapePlan(ctx)
    await etapeRediger(ctx)
    await etapeExport(ctx)
  } catch (e) {
    const f = await capturer(page, largeur, 99, 'echec')
    const ou = e instanceof Echec ? '' : '\n' + String(e.stack || '').split('\n').filter((l) => l.includes('parcours.mjs')).slice(0, 2).join('\n')
    throw new Echec(`[${largeur.nom}] ${e.message.split('\nCall log')[0]}${ou}\nURL ${page.url()}\ncapture ${f}\n${await inventaire(page).catch(() => '')}`)
  } finally {
    ctx.appels = appelsDepuis(debut)
    await bctx.close()
  }
  return ctx
}

// ── Panne : l'IA échoue pendant la lecture ─────────────────────────────────
/** Analyses décomptées ce mois (GET /api/billing/quota, la source de la jauge de la barre). */
const quota = async (page) => {
  const r = await api_(page, 'GET', '/api/billing/quota')
  return Number(r.corps?.analyses?.used ?? r.corps?.analyses?.utilisees ?? NaN)
}

async function panneLecture(nav, dossier) {
  const largeur = LARGEURS[0]
  const { ctx: bctx, page, j } = await ouvrir(nav, largeur)
  const ctx = { page, j, largeur, n: 40, etapes: [], id: null, dossier, pannes: [] }
  const debut = Date.now()
  try {
    await menage(page)
    await etapeDepot(ctx, dossier.zip)
    await page.waitForURL(/\/lots$/, { timeout: 30_000 })
    await page.getByRole('button', { name: /^Lot 01/ }).first().click()
    const avant = await quota(page)
    writeFileSync(PANNE, 'analyse')
    await bouton(page, VERBES.analyserLot).click()
    // L'écran d'erreur de la lecture (ProgressDisplay) : la phrase, l'unité rendue, « Relancer ».
    const relancer = bouton(page, VERBES.relancer, true)
    try { await relancer.waitFor({ timeout: 45_000 }) } catch {
      constat(ctx, 'StepAnalysis.tsx:331 — lecture en échec côté serveur, l’écran reste sur l’attente : la fin n’est pas vue sans rechargement')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await relancer.waitFor({ timeout: 30_000 })
    }
    ctx.n += 1
    await capturer(page, largeur, ctx.n, 'panne-ia-message')
    // Un message clair : aucune trace technique (étiquette de passe, nombre de tentatives, erreur du fournisseur).
    const message = await relancer.locator('xpath=ancestor::*[@role="alert" or @role="status"][1]').innerText().catch(() => '')
    if (!message) throw new Echec('panne IA : aucun message autour de « Relancer »')
    if (/\[[\w-]+\]|tentatives|Connection error|Exception|Traceback/i.test(message)) {
      constat(ctx, `StepAnalysis.tsx:297 — lecture en échec : le message montre l’erreur technique (« ${message.split('\n')[0].slice(0, 90)} ») ; le détail du flux vient de fail_pipeline(…, str(e)) (routers/analysis.py:571), la phrase propre de processing_detail n’est lue qu’après relecture du projet`)
    }
    await controlerConsole(ctx, 'panne IA')
    const apres = await quota(page)
    if (!(apres === avant)) throw new Echec(`panne IA : l'unité n'est pas rendue (analyses ${avant} → ${apres})`)
    // L'IA est réparée : « Relancer » relance la lecture, qui mène à Décider.
    unlinkSync(PANNE)
    await relancer.click()
    await page.waitForURL(/\/analysis$/, { timeout: 30_000 })
    const suite = bouton(page, VERBES.passerPieces, true)
    try { await suite.waitFor({ timeout: 30_000 }) } catch {
      constat(ctx, 'StepAnalysis.tsx:331 — analyse finie côté serveur, l’écran reste sur « Synorix analyse votre dossier » (Démarrage) : la fin, survenue avant l’abonnement au flux, n’est jamais vue (processing_status du projet en cache, jamais relu) ; un rechargement débloque')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await suite.waitFor({ timeout: 30_000 })
    }
    await controler(ctx, 'decider', { fil: FIL[2] })
    ctx.pannes.push(`IA en panne pendant la lecture : message et « ${VERBES.relancer} », unité rendue (${avant} → ${apres}), relance réussie`)
  } catch (e) {
    const f = await capturer(page, largeur, 99, 'panne-echec')
    const ou = e instanceof Echec ? '' : '\n' + String(e.stack || '').split('\n').filter((l) => l.includes('parcours.mjs')).slice(0, 2).join('\n')
    throw new Echec(`[panne IA] ${e.message.split('\nCall log')[0]}${ou}\nURL ${page.url()}\ncapture ${f}\n${await inventaire(page).catch(() => '')}`)
  } finally {
    if (existsSync(PANNE)) unlinkSync(PANNE)
    ctx.appels = appelsDepuis(debut)
    await bctx.close()
  }
  return ctx
}

// ── Programme ───────────────────────────────────────────────────────────────
let code = 0
const bilan = []
let nav
try {
  if (!(await sante(BASE + '/'))) throw new Echec(`le front ne répond pas sur ${BASE} (banc.sh lancer e2e)`)
  const dossier = fabriquerDossier()
  dire(`dossier inventé : ${path.basename(dossier.zip)}`)
  await lancerApi()
  dire(`API à IA simulée prête sur :${PORT_API}`)
  nav = await chromium.launch({ headless: true, executablePath: CHROMIUM })
  for (const largeur of LARGEURS) {
    dire(`passage ${largeur.nom} (${largeur.width} × ${largeur.height})`)
    bilan.push(await passage(nav, largeur, dossier))
  }
  if (process.env.E2E_PANNES !== '0') {
    dire('panne : l’IA échoue pendant la lecture (ordinateur)')
    bilan.push(await panneLecture(nav, dossier))
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
  dire(`appels simulés (${b.n >= 40 ? 'panne IA' : b.largeur.nom}) : ${JSON.stringify(b.appels)}`)
  for (const p of b.pannes) dire(`  panne (${b.largeur.nom}) : ${p}`)
  for (const c of b.j.connues) dire(`  CONSTAT (${b.largeur.nom}) : ${c}`)
}
console.log(code === 0 ? `\nE2E VERT : ${bilan.length} parcours (ordinateur, téléphone${bilan.length > 2 ? ', panne IA' : ''}), ${sec().trim()} s, captures dans ${CAPTURES}` : `\nE2E ROUGE (${sec().trim()} s)`)
process.exit(code)
