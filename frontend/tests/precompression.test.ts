// Précompression au build (bloc 6) : x.js.gz et x.js.br à côté de chaque texte de dist/, pour
// gzip_static / brotli_static côté nginx. Sans dépendance : zlib de Node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { lire } from './outils/sources'

const SCRIPT = path.join(process.env.FRONTEND_ROOT ?? process.cwd(), 'scripts', 'precompresser.mjs')
const contenu = (n: number) => `export const x = "${'synorix '.repeat(n)}"\n`

test('chaque .js .mjs .css .svg .html .json reçoit un .gz et un .br qui se décompressent à l\'identique', () => {
  const racine = mkdtempSync(path.join(tmpdir(), 'precompression-'))
  try {
    const dist = path.join(racine, 'dist'); mkdirSync(path.join(dist, 'assets'), { recursive: true })
    const textes = ['index.html', 'assets/a.js', 'assets/w.mjs', 'assets/s.css', 'favicon.svg', 'manifest.json']
    for (const f of textes) writeFileSync(path.join(dist, f), contenu(400))
    writeFileSync(path.join(dist, 'assets/police.woff2'), Buffer.from('binaire déjà compressé'.repeat(50)))
    writeFileSync(path.join(dist, 'assets/image.png'), Buffer.from('png'.repeat(500)))
    const r = spawnSync(process.execPath, [SCRIPT, dist], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    for (const f of textes) {
      const source = readFileSync(path.join(dist, f))
      assert.ok(existsSync(path.join(dist, f + '.gz')) && existsSync(path.join(dist, f + '.br')), `${f} : .gz et .br`)
      assert.deepEqual(zlib.gunzipSync(readFileSync(path.join(dist, f + '.gz'))), source)
      assert.deepEqual(zlib.brotliDecompressSync(readFileSync(path.join(dist, f + '.br'))), source)
      assert.ok(readFileSync(path.join(dist, f + '.br')).length < source.length)
    }
    assert.ok(!existsSync(path.join(dist, 'assets/police.woff2.gz')) && !existsSync(path.join(dist, 'assets/image.png.br')), 'binaires non touchés')
    // un deuxième passage ne compresse pas les fichiers compressés
    spawnSync(process.execPath, [SCRIPT, dist])
    assert.ok(!readdirSync(path.join(dist, 'assets')).some((f) => /\.(gz|br)\.(gz|br)$/.test(f)))
    // rien n'a été écrit hors de dist/
    assert.deepEqual(readdirSync(racine), ['dist'])
  } finally { rmSync(racine, { recursive: true, force: true }) }
})

test('un fichier minuscule qui ne gagne rien n\'a pas de version compressée (nginx sert l\'original)', () => {
  const racine = mkdtempSync(path.join(tmpdir(), 'precompression-'))
  try {
    writeFileSync(path.join(racine, 'p.json'), '{}')
    assert.equal(spawnSync(process.execPath, [SCRIPT, racine]).status, 0)
    assert.ok(!existsSync(path.join(racine, 'p.json.gz')) && !existsSync(path.join(racine, 'p.json.br')))
  } finally { rmSync(racine, { recursive: true, force: true }) }
})

test('`npm run build` précompresse après vite build ; le dossier par défaut est dist/', () => {
  const pkg = JSON.parse(lire('package.json'))
  assert.match(pkg.scripts.build, /vite build\s*&&\s*node scripts\/precompresser\.mjs/)
  assert.ok(!('brotli-webpack-plugin' in (pkg.devDependencies ?? {})) && !('vite-plugin-compression' in (pkg.devDependencies ?? {})), 'aucune nouvelle dépendance')
})
