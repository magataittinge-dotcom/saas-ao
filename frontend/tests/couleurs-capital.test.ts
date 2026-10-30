// Phase C (écrans « capital ») — aucune couleur écrite en dur sur les écrans refaits : tout passe par les jetons
// (styles/theme.css) et les composants de base (components/ui). Un seul test, paramétré par la liste des fichiers
// de chaque écran ; on ajoute un écran à la liste au moment où il est refait.
//
// Refusé : hex (#fff, #E4E9F2…), rgb()/rgba()/hsl()/hsla(), classes Tailwind de palette fixe (bg-slate-900,
// text-white, text-cyan-400, bg-[#…]), anciens noms du système (Lumen ds-*, Edge edge-*, Calque encre / ligne /
// prusse…, classes glass-* / pill-* / signature-btn) et anciens noms de variables (--bg, --ink, --calque-*…).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

export const ECRANS: Record<string, string[]> = {
  'Tableau de bord': [
    'src/routes/Dashboard.tsx',
    'src/components/dashboard/AOCard.tsx',
    'src/components/dashboard/AlertCard.tsx',
    'src/components/dashboard/DeadlinePill.tsx',
    'src/components/dashboard/PipelineRail.tsx',
    'src/components/dashboard/StatCard.tsx',
  ],
  'Nouvel AO': [
    'src/routes/NewProject.tsx',
  ],
  'Coffre-fort': [
    'src/routes/Vault.tsx',
    'src/components/vault/ClassifyDocumentModal.tsx',
    'src/components/vault/VaultSavePrompt.tsx',
  ],
}

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black'
const UTILITAIRES = 'bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|decoration|shadow|accent|caret|border-[trblxy]|ring-offset'

// anciens noms de variables : tout ce que theme.css déclare dans le bloc « ALIAS DES ANCIENS NOMS »
function aliasVariables(): Set<string> {
  const css = lire('src/styles/theme.css')
  const bloc = css.slice(css.indexOf('ALIAS DES ANCIENS NOMS'))
  return new Set([...bloc.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
}

const INTERDITS: [string, RegExp][] = [
  ['couleur hexadécimale', /(?<![\w&/])#[0-9a-fA-F]{3,8}\b/],
  ['rgb / rgba / hsl / hsla', /\b(?:rgba?|hsla?)\(/],
  ['classe Tailwind de palette fixe', new RegExp(`(?<![\\w-])(?:${UTILITAIRES})-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`)],
  ['valeur arbitraire de couleur', /-\[(?:#|rgb|hsl|var\(--(?:bg|ink|line|calque|edge|lum))/],
  ['ancien nom Lumen / Edge', /(?<![\w-])(?:ds|edge)-[a-z]/],
  ['ancien nom Calque', /(?<![\w-])(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|shadow)-(?:encre|ligne|prusse|papier|attention|bloquant|ok|surligneur|sur-encre|voile|compagnon)(?![\w])/],
  ['ancienne classe de composant', /(?<![\w-])(?:glass-(?:card|stat|header|sidebar)|pill(?:-[a-z]+)?|signature-btn|steps-track|top-lit|sheen)(?![\w-])/],
]

for (const [ecran, fichiers] of Object.entries(ECRANS)) {
  test(`${ecran} : aucune couleur écrite en dur, tout passe par les jetons`, () => {
    const alias = aliasVariables()
    const fautes: string[] = []
    for (const f of fichiers) {
      const lignes = sansCommentaires(lire(f)).split('\n')
      lignes.forEach((ligne, i) => {
        for (const [nom, motif] of INTERDITS) {
          const m = ligne.match(motif)
          if (m) fautes.push(`${f}:${i + 1} — ${nom} : ${m[0]}`)
        }
        for (const m of ligne.matchAll(/var\((--[\w-]+)/g)) {
          if (alias.has(m[1])) fautes.push(`${f}:${i + 1} — ancien nom de variable : ${m[1]}`)
        }
      })
    }
    assert.deepEqual(fautes, [])
  })
}
