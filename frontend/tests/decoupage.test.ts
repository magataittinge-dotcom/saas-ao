// Livraison du front (bloc 6) : un écran = un morceau chargé à la demande. Ces tests lisent le
// code (comme tests/vocabulaire.test.ts) ; la taille réelle des morceaux est mesurée au build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const importsStatiques = (code: string) =>
  [...code.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1])

test('App.tsx : aucun écran importé en dur, tous en React.lazy, sous un Suspense', () => {
  const app = sansCommentaires(lire('src/App.tsx'))
  const durs = importsStatiques(app).filter((s) => /^@\/(routes|components\/layout)\//.test(s))
  assert.deepEqual(durs, [], `importés en dur : ${durs.join(', ')}`)
  const ecrans = ['Landing', 'Login', 'Register', 'Pricing', 'Legal', 'Dashboard', 'Projects', 'NewProject',
    'Project', 'Vault', 'References', 'Company', 'Team', 'Settings', 'Billing', 'Tools']
  for (const e of ecrans) {
    assert.ok(new RegExp(`const ${e} = lazy\\(\\(\\) => import\\('@/routes/${e}'\\)\\)`).test(app), `${e} n'est pas en lazy`)
  }
  assert.ok(/const Layout = lazy\(\(\) => import\('@\/components\/layout\/Layout'\)\)/.test(app), 'Layout (coquille connectée) en lazy')
  assert.ok(/<Suspense\b/.test(app))
})

test('Project.tsx : les six étapes de l\'AO sont chargées à la demande', () => {
  const projet = sansCommentaires(lire('src/routes/Project.tsx'))
  const durs = importsStatiques(projet).filter((s) => /\.\/project\/Step/.test(s))
  assert.deepEqual(durs, [], `importées en dur : ${durs.join(', ')}`)
  for (const e of ['StepUpload', 'StepLotSelection', 'StepAnalysis', 'StepVerification', 'StepMemoire', 'StepExport']) {
    assert.ok(new RegExp(`const ${e} = lazy\\(\\(\\) => import\\('\\./project/${e}'\\)\\)`).test(projet), `${e} n'est pas en lazy`)
  }
  assert.ok(/<Suspense\b/.test(projet))
})

test('le lecteur PDF (react-pdf, pdfjs-dist) n\'est importé que par VueDocument, lui-même en lazy', () => {
  for (const f of fichiersSource()) {
    const code = sansCommentaires(lire(f))
    if (f.endsWith('source/VueDocument.tsx')) continue
    assert.ok(!/from\s+'(react-pdf|pdfjs-dist)[^']*'|import\s+'(react-pdf|pdfjs-dist)[^']*'/.test(code), `${f} importe le lecteur PDF en dur`)
  }
  const vues = sansCommentaires(lire('src/components/project/source/VuesSource.tsx'))
  assert.ok(/const VueDocument = lazy\(\(\) => import\('\.\/VueDocument'\)\)/.test(vues))
})

test('la coquille connectée garde la barre latérale pendant le chargement d\'un écran', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.ok(/<Suspense fallback=\{<EcranEnChargement[^>]*\/>\}>\s*<Outlet \/>\s*<\/Suspense>/.test(layout))
})
