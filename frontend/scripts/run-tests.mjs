// Lance les tests du frontend sans dépendance supplémentaire :
// esbuild (fourni avec Vite) compile chaque fichier tests/*.test.ts(x) en un
// module Node autonome (alias @ → src, JSX), puis le lanceur intégré de Node
// (`node --test`) les exécute.
//
//   npm test                 → tous les tests
//   npm test -- offres memo  → seulement les fichiers dont le nom contient « offres » ou « memo »
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dossierTests = path.join(racine, 'tests')
const filtres = process.argv.slice(2)

const fichiers = readdirSync(dossierTests)
  .filter((f) => /\.test\.tsx?$/.test(f))
  .filter((f) => filtres.length === 0 || filtres.some((m) => f.includes(m)))
  .sort()

if (fichiers.length === 0) {
  console.error(`Aucun fichier de test trouvé dans tests/ (filtre : ${filtres.join(', ') || 'aucun'}).`)
  process.exit(1)
}

const sortie = mkdtempSync(path.join(tmpdir(), 'synorix-tests-'))
let statut = 1
try {
  await build({
    entryPoints: fichiers.map((f) => path.join(dossierTests, f)),
    outdir: sortie,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { '@': path.join(racine, 'src') },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ MODE: 'test', DEV: false, PROD: false, VITE_API_URL: '' }) },
    // Les dépendances CommonJS (react…) appellent require() : on le fournit au module ESM.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'error',
  })
  const modules = fichiers.map((f) => path.join(sortie, f.replace(/\.tsx?$/, '.mjs')))
  const r = spawnSync(process.execPath, ['--test', ...modules], {
    stdio: 'inherit',
    cwd: racine,
    env: { ...process.env, FRONTEND_ROOT: racine },
  })
  statut = r.status ?? 1
} finally {
  rmSync(sortie, { recursive: true, force: true })
}
process.exit(statut)
