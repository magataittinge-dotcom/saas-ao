// Chaque fichier que index.html réclame au premier chargement existe : sinon le navigateur reçoit
// un 404 (c'était le cas de /favicon.svg). Sont exclus : le point d'entrée du build (/src/…) et les
// polices servies depuis node_modules par Vite en développement (reprises dans dist/assets au build).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { RACINE, lire } from './outils/sources'

function fichiersReferences(html: string): string[] {
  const refs = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\b(?:href|src)="(\/[^"#?]+)"/g)].map((m) => m[1])
  return refs.filter((r) => !r.startsWith('/src/') && !r.startsWith('/node_modules/'))
}

test('chaque fichier référencé par index.html existe dans public/', () => {
  const refs = fichiersReferences(lire('index.html'))
  assert.ok(refs.includes('/favicon.svg') && refs.includes('/theme-init.js'), refs.join(', '))
  const absents = refs.filter((r) => !existsSync(path.join(RACINE, 'public', r)))
  assert.deepEqual(absents, [])
})

test('l’icône est un dessin à nous, en bleu Synorix #008cf8', () => {
  const svg = lire('public/favicon.svg')
  assert.ok(svg.includes('#008cf8'))
  assert.ok(!/<image|href=|<text/.test(svg), 'aucune image ni police externe')
})
