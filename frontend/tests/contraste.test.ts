// 1.12 — Contraste minimal en thème sombre : chaque gris de texte dépasse
// 4,5:1 sur chaque fond de l'application, et aucun texte ne descend sous 12 px.
// (La mesure à l'écran, texte par texte sur fond réel, complète ce garde-fou.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'
import { contrasteJetons, type Theme } from './outils/jetons'

/** Luminance relative WCAG 2 d'une couleur #RRGGBB. */
function luminance(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (clair + 0.05) / (sombre + 0.05)
}

const CSS = ['src/index.css', 'src/styles/tokens.css', 'src/styles/theme.css']

test('chaque gris de texte dépasse 4,5:1 sur chaque fond de l\'application, en clair comme en nuit', () => {
  // anciens noms (alias des jetons du système) : fonds Lumen / Edge, écritures ink / text
  const fonds = ['--bg-deep', '--bg', '--surface', '--surface-2', '--surface-3', '--edge-void', '--edge-graphite', '--edge-panel', '--edge-slate']
  const textes = ['--ink', '--ink-2', '--ink-3', '--ink-4', '--text-muted', '--text-primary', '--text-secondary', '--text-tertiary', '--edge-text', '--edge-text-2', '--edge-text-3']
  const faibles: string[] = []
  for (const theme of ['light', 'dark'] as Theme[]) {
    for (const t of textes) for (const f of fonds) {
      const { minimum } = contrasteJetons(theme, t, f)
      if (minimum < 4.5) faibles.push(`${theme} ${t} sur ${f} : ${minimum.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(faibles, [])
})

test('les anciens gris illisibles (#6B6C6F, #55565A) ont disparu', () => {
  const fichiers = [...fichiersSource('src'), ...CSS, 'tailwind.config.js']
  const restes = fichiers.filter((f) => /#6B6C6F|#55565A/i.test(sansCommentaires(lire(f))))
  assert.deepEqual(restes, [])
})

test('aucun texte sous 12 px', () => {
  const petits: string[] = []
  const enPx = (valeur: string, unite = 'px') => (unite === 'rem' ? Number(valeur) * 16 : unite === 'px' ? Number(valeur) : Infinity)
  for (const f of fichiersSource('src')) {
    const code = sansCommentaires(lire(f))
    for (const m of code.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]|fontSize:\s*'?(\d*\.?\d+)(px|rem|em)?'?/g)) {
      const px = m[1] !== undefined ? enPx(m[1], m[2]) : enPx(m[3], m[4])
      if (px < 12) petits.push(`${f} : ${m[0]}`)
    }
  }
  for (const f of CSS) {
    for (const m of sansCommentaires(lire(f)).matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)/g)) {
      const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
      if (px < 12) petits.push(`${f} : ${m[0]}`)
    }
  }
  assert.deepEqual(petits, [])
})

test('le code cité dans le mémoire s\'affiche à 12 px (prose-sm le réduit à 10,3 px)', () => {
  const memoire = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(memoire, /prose prose-sm [^"]*prose-code:text-xs/)
})

test('accueil : les textes se lisent sur leur fond', () => {
  const accueil = sansCommentaires(lire('src/routes/Landing.tsx'))
  // pas de texte blanc sur les boutons clairs
  assert.doesNotMatch(accueil, /className="[^"]*\btext-white\b[^"]*"\s*style=\{\{\s*background:\s*'#E4E9F2'/)
  // le texte sombre ne sert que sur ces boutons clairs ; tout autre texte se lit sur la carte la plus claire
  const couleurs = new Set([...accueil.matchAll(/text-\[(#[0-9A-Fa-f]{6})\]|color:\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => (m[1] ?? m[2]).toUpperCase()))
  assert.ok(contraste('#0A0C11', '#E4E9F2') >= 4.5)
  const faibles = [...couleurs]
    .filter((c) => c !== '#0A0C11' && contraste(c, '#0F1218') < 4.5)
    .map((c) => `${c} : ${contraste(c, '#0F1218').toFixed(2)}:1`)
  assert.deepEqual(faibles, [])
})
