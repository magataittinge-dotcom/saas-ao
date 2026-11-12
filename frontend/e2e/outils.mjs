// Outils communs du test de bout en bout : navigateur, connexion Clerk de développement, garde des requêtes, contrôles.
// Même playwright-core (Apache-2.0) et même Chromium local que banc/ecran.mjs ; rien n'est installé.
import { createRequire } from 'node:module'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)

function chargerPlaywright() {
  // 1) frontend/node_modules (devDependencies), 2) cache npx déjà utilisé par banc/ecran.mjs
  try { return require('playwright-core') } catch { /* pas installé dans node_modules */ }
  const cache = process.env.E2E_PLAYWRIGHT || '/home/omarov/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core'
  return require(cache)
}
export const { chromium } = chargerPlaywright()

export const CHROMIUM = process.env.E2E_CHROMIUM || path.join(process.env.HOME, '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome')

const secrets = []
export function masquer(texte) {
  let t = String(texte)
  for (const s of secrets) if (s) t = t.split(s).join('***')
  return t
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '***')
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer ***')
    .replace(/(__clerk\w*|__session\w*|__client\w*|token|ticket)=[^&;\s"']+/gi, '$1=***')
    .replace(/(sk|pk)_(test|live)_[\w$-]+/g, '$1_$2_***')
}

function lireEnv(fichier, cle) {
  if (!existsSync(fichier)) return ''
  const ligne = readFileSync(fichier, 'utf8').split('\n').find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}

async function clerk(racine, methode, url, corps) {
  const sk = lireEnv(path.join(racine, 'backend/.env'), 'CLERK_SECRET_KEY')
  const pk = lireEnv(path.join(racine, 'frontend/.env'), 'VITE_CLERK_PUBLISHABLE_KEY')
  secrets.push(sk, pk)
  if (!sk.startsWith('sk_test_') || !pk.startsWith('pk_test_')) throw new Error('clés Clerk hors instance de développement : connexion refusée')
  const r = await fetch('https://api.clerk.com/v1' + url, {
    method: methode,
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', 'User-Agent': 'synorix-e2e/1.0' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!r.ok) throw new Error(`API Clerk ${methode} ${url.split('?')[0]} : HTTP ${r.status}`)
  return r.json()
}

/** Connexion par jeton Clerk à usage unique (instance de développement seulement), trois essais. */
export async function seConnecter(page, base, racine, email) {
  let derniere
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const [u] = await clerk(racine, 'GET', `/users?email_address=${encodeURIComponent(email)}`)
      if (!u) throw new Error(`compte Clerk introuvable : ${email}`)
      const { token } = await clerk(racine, 'POST', '/sign_in_tokens', { user_id: u.id, expires_in_seconds: 120 })
      secrets.push(token)
      await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(() => window.Clerk && window.Clerk.loaded, null, { timeout: 60000 })
      const erreur = await page.evaluate(async (t) => {
        try {
          if (window.Clerk.session) return null
          const si = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: t })
          if (si.status !== 'complete') return `connexion incomplète (${si.status})`
          await window.Clerk.setActive({ session: si.createdSessionId })
          return null
        } catch (e) {
          return (e && e.errors && e.errors[0] && e.errors[0].code) || 'erreur de connexion'
        }
      }, token)
      if (!erreur) return
      derniere = new Error(masquer(erreur))
    } catch (e) { derniere = e }
    await page.waitForTimeout(2000)
  }
  throw derniere
}

/**
 * Garde des requêtes /api : chaque réponse est notée (événement « response » : il voit aussi les dépôts multipart et les
 * flux), les 5xx et les 401 sont comptées. Aucune interception : route.fetch() bloquait les requêtes derrière le
 * mandataire de Vite. La tolérance d'horloge du jeton de Clerk est dans le serveur ; la reprise de connexion est dans
 * seConnecter (trois essais) et dans le parcours (une 401 relance la connexion puis l'étape).
 */
export function garderRequetes(page, journal) {
  page.on('response', (rep) => {
    const req = rep.request()
    const u = new URL(req.url())
    if (!u.pathname.startsWith('/api/')) return
    journal.requetes.push({ m: req.method(), p: u.pathname, s: rep.status(), t: Date.now() })
    if (rep.status() >= 500) journal.erreurs5xx.push(`${req.method()} ${u.pathname} → ${rep.status()}`)
    if (rep.status() === 401) journal.reprises401 += 1
  })
}

export function dossier(d) { mkdirSync(d, { recursive: true }); return d }
