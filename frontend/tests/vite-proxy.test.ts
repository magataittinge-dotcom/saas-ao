// La cible du proxy /api du serveur de développement vient de VITE_PROXY_API (8000 par défaut) ; le build n'en dépend pas.
// La configuration est résolue par Vite lui-même, dans un processus à part (le lanceur de tests ne peut pas embarquer Vite).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { RACINE, lire } from './outils/sources'

const SCRIPT = `
import { resolveConfig } from 'vite'
const [commande] = process.argv.slice(1)
const c = await resolveConfig({ configFile: 'vite.config.ts', root: process.cwd(), logLevel: 'silent' }, commande)
console.log(JSON.stringify({ cible: c.server.proxy?.['/api']?.target ?? null, define: c.define ?? {} }))
`

function resoudre(valeur: string | undefined, commande: 'serve' | 'build' = 'serve'): { cible: string | null; define: object } {
  const env = { ...process.env }
  delete env.VITE_PROXY_API
  if (valeur !== undefined) env.VITE_PROXY_API = valeur
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', SCRIPT, commande], { cwd: RACINE, env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}')
}

test('sans variable, le proxy vise le port 8000', () => {
  assert.equal(resoudre(undefined).cible, 'http://localhost:8000')
  assert.equal(resoudre('  ').cible, 'http://localhost:8000')
})

test('avec VITE_PROXY_API, le proxy vise le port choisi', () => {
  assert.equal(resoudre('http://localhost:8102').cible, 'http://localhost:8102')
})

test('le build de production ne dépend pas de la variable ; elle est notée dans .env.example', () => {
  assert.deepEqual(resoudre('http://localhost:8102', 'build').define, resoudre(undefined, 'build').define)
  assert.match(lire('.env.example'), /VITE_PROXY_API=http:\/\/localhost:8000/)
})
