// Une seule façon de bouger (VEILLE-DESIGN P15 à P19, P21 ; règle du fondateur : rien ne boucle, sauf l'aurore et le visage).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const index = sansCommentaires(lire('src/index.css'))
const tokens = sansCommentaires(lire('src/styles/tokens.css'))
const theme = sansCommentaires(lire('src/styles/theme.css'))

test('trois durées et une courbe : aucune durée ni courbe écrite en dur dans une transition ou une animation', () => {
  for (const [nom, css] of [['index.css', index], ['tokens.css', tokens]] as const) {
    const ecarts = [...css.matchAll(/(?:transition|animation)\s*:[^;{}]+;/g)].map((m) => m[0])
      .filter((d) => /(?<![\w.-])\d*\.?\d+m?s\b|cubic-bezier|\bease(?:-in|-out|-in-out)?\b(?!-)|\blinear\b/.test(d.replace(/var\([^)]*\)/g, '')))
    assert.deepEqual(ecarts, [], nom)
    assert.doesNotMatch(css, /transition\s*:\s*all\b/, `${nom} : transition: all`)
  }
})

test('rien ne boucle hors l\'aurore et le visage : aucune animation infinie dans index.css, tokens.css ni la configuration Tailwind', () => {
  for (const [nom, css] of [['index.css', index], ['tokens.css', tokens], ['tailwind.config.js', sansCommentaires(lire('tailwind.config.js'))]] as const) {
    assert.doesNotMatch(css, /\binfinite\b/, nom)
  }
  for (const k of ['dropzone-pulse', 'pulse-cyan', 'shimmer-slow', 'skeleton-shimmer', 'top-lit-travel', 'pulse-ring', 'badge-pulse', 'card-shine', 'dash-march', 'shimmer-slide', 'confetti-burst', 'halo-breathe']) {
    assert.doesNotMatch(index + tokens, new RegExp(`@keyframes ${k}\\b`), k)
  }
  // les seules boucles du produit : les trois rubans de l'aurore et le clin d'œil du visage
  assert.equal((sansCommentaires(lire('src/components/layout/aurore.css')).match(/\binfinite\b/g) ?? []).length, 3)
})

test('un changement d\'écran : un fondu de 100 ms, opacité seule, sans translation ni cascade', () => {
  assert.match(index, /@keyframes fondu-ecran \{ from \{ opacity: 0; \} \}/)
  assert.match(index, /\.animate-fade-in-delay-6 \{ animation: fondu-ecran var\(--dur-fast\) var\(--ease-survol\) both; \}/)
  assert.doesNotMatch(index, /fade-in-up/)
  for (const f of ['src/routes/Project.tsx', 'src/routes/Design.tsx', 'src/components/layout/Layout.tsx']) assert.doesNotMatch(sansCommentaires(lire(f)), /animate-fade-in/, f)
})

test('« réduire les animations » : tout est instantané, sans exception ; l\'aurore devient une image fixe', () => {
  const bloc = theme.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(bloc, /\*, \*::before, \*::after \{/)
  for (const d of ['animation-duration: .01ms !important', 'animation-iteration-count: 1 !important', 'transition-duration: .01ms !important']) assert.ok(bloc.includes(d), d)
  assert.doesNotMatch(bloc, /animate-spin/, 'plus d\'exception pour une roue qui tourne')
  assert.match(sansCommentaires(lire('src/components/layout/aurore.css')), /@media \(prefers-reduced-motion: reduce\) \{\s*\.aurore-ruban \{ animation: none !important; \}/)
})

test('appui : scale(.98) sur ce qui se clique ; survol : aucune translation (boutons du système et anciens boutons CSS)', () => {
  assert.match(index, /\.signature-btn:active:not\(:disabled\) \{ transform: scale\(\.98\); \}/)
  const bouton = sansCommentaires(lire('src/components/ui/bouton.tsx'))
  assert.match(bouton, /active:scale-\[\.98\]/)
  assert.doesNotMatch(bouton + sansCommentaires(lire('src/components/layout/Header.tsx')) + sansCommentaires(lire('src/components/layout/Sidebar.tsx')), /hover:-?translate|hover:scale/)
})
