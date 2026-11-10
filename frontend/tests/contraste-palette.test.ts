// Matrice complète des contrastes de la palette (WCAG 2), en clair et en nuit, sur le repli sRGB ET sur les valeurs
// display-p3 : texte ≥ 4,5:1, marques (bords de champ, points, barres, anneau de focus) ≥ 3:1. Le test échoue au
// moindre couple sous le seuil. La luminance d'une couleur display-p3 est calculée dans son espace (Y, D65).
//   CONTRASTES_MD=/chemin/CONTRASTES.md npm test -- contraste-palette   → écrit la matrice
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { type Theme } from './outils/jetons'
import { ETATS, SURFACES, THEMES, contrasteMin, jetonsP3 } from './outils/palette'

type Couple = { quoi: string; avant: string; fond: string; sur?: string; seuil: number }
const POP = [...SURFACES, '--surface-pop']
const couples: Couple[] = []
const texte = (quoi: string, avant: string, fonds: string[]) => fonds.forEach((fond) => couples.push({ quoi, avant, fond, seuil: 4.5 }))
const marque = (quoi: string, avant: string, fonds: string[]) => fonds.forEach((fond) => couples.push({ quoi, avant, fond, seuil: 3 }))

// ── Texte : 4,5:1 ────────────────────────────────────────────────
texte('texte principal', '--text-1', POP)
texte('texte secondaire', '--text-2', POP)
texte('méta, texte d\'aide des champs', '--text-3', POP)
texte('texte d\'accent, liens', '--accent-text', [...SURFACES, '--accent-tint'])
texte('texte d\'aurore', '--aurore-ink', SURFACES)
for (const k of ETATS) {
  texte(`état ${k} : texte`, `--${k}-ink`, SURFACES)
  for (const sur of SURFACES) couples.push({ quoi: `état ${k} : texte sur sa pastille`, avant: `--${k}-ink`, fond: `--${k}-soft`, sur, seuil: 4.5 })
}
// anciens noms (alias des six sens) : mêmes couples que leur sens, le fond translucide de nuit posé sur chaque surface
for (const m of ['info', 'success', 'warning', 'danger']) {
  texte(`message ${m}`, `--${m}-fg`, SURFACES)
  for (const sur of SURFACES) couples.push({ quoi: `message ${m} : texte sur son fond`, avant: `--${m}-fg`, fond: `--${m}-bg`, sur, seuil: 4.5 })
}
texte('texte sur l\'aplat d\'accent', '--on-accent', ['--accent-fill', '--accent-fill-hover', '--accent-fill-solid', '--primary'])
texte('texte sur le rouge plein', '--destructive-foreground', ['--destructive'])
texte('texte inversé', '--text-inverse', ['--text-1'])
texte('texte surligné', '--highlight-text', ['--highlight'])
texte('texte sur teinte d\'accent ou surlignage doux', '--text-1', ['--accent-tint', '--accent-tint-2', '--highlight-soft'])
texte('barre latérale', '--sidebar-foreground', ['--sidebar-background'])
for (const t of ['--text-1', '--text-2']) for (const sur of SURFACES) couples.push({ quoi: 'texte sur le verre', avant: t, fond: '--glass-fill', sur, seuil: 4.5 })

// ── Marques : 3:1 ────────────────────────────────────────────────
marque('bord de champ', '--border-field', SURFACES)
marque('interface d\'accent', '--accent-ui', SURFACES)
marque('anneau de focus', '--accent-ring', SURFACES)
marque('bouton plein sur son fond', '--accent-fill', ['--surface-page', '--surface-0'])
marque('marque d\'aurore (fil, anneau du visage)', '--aurore-mark', SURFACES)
for (const k of ETATS) {
  marque(`état ${k} : marque`, `--${k}-mark`, SURFACES)
  for (const sur of SURFACES) couples.push({ quoi: `état ${k} : point sur sa pastille`, avant: `--${k}-mark`, fond: `--${k}-soft`, sur, seuil: 3 })
}
for (const m of ['info', 'success', 'warning', 'danger']) {
  marque(`message ${m} : bord`, `--${m}-border`, SURFACES)
  for (const sur of SURFACES) couples.push({ quoi: `message ${m} : bord sur son fond`, avant: `--${m}-border`, fond: `--${m}-bg`, sur, seuil: 3 })
}

type Mesure = Couple & { theme: Theme; gamut: 'srgb' | 'p3'; rapport: number }
function mesurer(): Mesure[] {
  const sortie: Mesure[] = []
  for (const theme of THEMES) {
    const p3 = Object.keys(jetonsP3(theme))
    for (const c of couples) {
      sortie.push({ ...c, theme, gamut: 'srgb', rapport: contrasteMin(theme, c.avant, c.fond, c.sur, 'srgb') })
      if (p3.includes(c.avant) || p3.includes(c.fond)) sortie.push({ ...c, theme, gamut: 'p3', rapport: contrasteMin(theme, c.avant, c.fond, c.sur, 'p3') })
    }
    // 500 en display-p3 (points, traits, lueurs) : une marque en nuit seulement, là où 500 est la couleur d'interface
    if (theme === 'dark') for (const fond of SURFACES) sortie.push({ quoi: 'accent vif (display-p3)', avant: '--accent-vif', fond, seuil: 3, theme, gamut: 'p3', rapport: contrasteMin(theme, '--accent-vif', fond, undefined, 'p3') })
  }
  return sortie
}

test('contrastes : 0 couple sous le seuil, en clair et en nuit, sur le repli sRGB et sur display-p3', () => {
  const mesures = mesurer()
  const echecs = mesures.filter((m) => m.rapport < m.seuil).map((m) => `${m.theme} ${m.gamut} ${m.avant} sur ${m.fond}${m.sur ? ` (posé sur ${m.sur})` : ''} : ${m.rapport.toFixed(2)}:1 < ${m.seuil}`)
  if (process.env.CONTRASTES_MD) {
    const fr = (v: number) => v.toFixed(2).replace('.', ',')
    const md = ['# Matrice des contrastes de la palette (test `frontend/tests/contraste-palette.test.ts`)', '',
      `${mesures.length} couples vérifiés (${mesures.filter((m) => m.gamut === 'p3').length} sur les valeurs display-p3), ${echecs.length} sous le seuil. Calcul WCAG 2 ; une couleur translucide est d'abord posée sur sa surface ; un dégradé est mesuré à chacun de ses paliers (le plus faible compte).`, '']
    for (const theme of THEMES) {
      for (const seuil of [4.5, 3]) {
        const lot = mesures.filter((m) => m.theme === theme && m.seuil === seuil)
        md.push(`## ${theme === 'light' ? 'Clair' : 'Nuit'} : ${seuil === 4.5 ? 'texte (≥ 4,5:1)' : 'marques (≥ 3:1)'}, ${lot.length} couples, minimum ${fr(Math.min(...lot.map((m) => m.rapport)))}:1`, '',
          '| Rôle | Devant | Fond | Posé sur | Gamut | Rapport |', '|---|---|---|---|---|---|')
        for (const m of lot) md.push(`| ${m.quoi} | \`${m.avant}\` | \`${m.fond}\` | ${m.sur ? `\`${m.sur}\`` : ''} | ${m.gamut === 'p3' ? 'display-p3' : 'sRGB'} | ${fr(m.rapport)}:1 |`)
        md.push('')
      }
    }
    writeFileSync(process.env.CONTRASTES_MD, md.join('\n'))
  }
  assert.ok(mesures.length > 300, `matrice trop courte (${mesures.length})`)
  assert.ok(mesures.some((m) => m.gamut === 'p3'), 'aucun couple mesuré sur display-p3')
  assert.deepEqual(echecs, [])
})
