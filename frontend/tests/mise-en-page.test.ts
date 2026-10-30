// 1.11 — Mise en page : les barres d'action des étapes restent dans la colonne
// de contenu, la barre latérale s'ouvre par un bouton (plus au survol).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const ETAPES = [
  'src/routes/project/StepAnalysis.tsx',
  'src/routes/project/StepVerification.tsx',
  'src/routes/project/StepMemoire.tsx',
  'src/routes/project/StepExport.tsx',
]

test('les barres d\'action des étapes 3 à 6 sont collées au bas du contenu, pas en travers de l\'écran', () => {
  for (const f of ETAPES) {
    const code = sansCommentaires(lire(f))
    assert.ok(!code.includes('fixed bottom-0 left-0 right-0'), `${f} : barre fixe sur toute la largeur`)
    assert.ok(!code.includes('createPortal(bottomBar'), `${f} : barre rendue hors du contenu`)
    assert.match(code, /sticky -bottom-5 z-30/, f)
  }
})

test('la barre d\'icônes est fixe et flottante : rien ne s\'ouvre au survol, le contenu ne saute pas', () => {
  const code = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.ok(!code.includes('hoverExpanded'))
  assert.ok(!/onMouseEnter/.test(code))
  assert.match(code, /fixed bottom-4 left-4 top-4/)
})
