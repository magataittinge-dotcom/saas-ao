// FIN-ECR (jury, tour 4 : etape-decider-chargement, etape-lots-chargement, etape-pieces-chargement, bloquants) — à 390 px,
// les cartes et les barres des squelettes d'étape sortaient de l'écran. Cause : une barre de largeur fixe (w-80, w-96)
// posée dans une GRILLE sans colonnes déclarées. La colonne implicite d'une grille (`auto`) prend la largeur fixe de la
// barre ; son `max-w-full` se résout contre cette colonne déjà élargie et ne borne rien : la barre, puis la carte, débordent.
// Mesuré au navigateur (outils-fin-ecr/mesure.sh) : Dépôt, Lots, Pièces, Décider sortaient de l'écran ; Plan, Rédiger, Export non.
// Garde-fou : dans un squelette d'étape, toute grille déclare ses colonnes (`grid-cols-1` = `minmax(0, 1fr)` : la colonne
// tient dans la carte), et toute barre plus large que l'intérieur d'une carte à 390 px porte une borne (`max-w-…`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

/** L'intérieur d'une carte à 390 px : 390 − 2 × 16 (bords de page) − 2 × 1 (trait) − 2 × 20 (marge intérieure). */
const INTERIEUR_CARTE_390 = 316

function extrait(code: string, debut: string, fin: string): string {
  const i = code.indexOf(debut)
  assert.ok(i >= 0, `repère introuvable : ${debut}`)
  const j = code.indexOf(fin, i + debut.length)
  assert.ok(j > i, `fin introuvable après : ${debut}`)
  return code.slice(i, j)
}

const SQUELETTES: Record<string, string> = {
  'Squelettes communs (Plan, Export)': sansCommentaires(lire('src/components/etape/SqueletteEtape.tsx')),
  'Squelette des listes (Dépôt, Lots, Pièces)': sansCommentaires(lire('src/components/project/SqueletteListe.tsx')),
  'Squelette de Décider': extrait(sansCommentaires(lire('src/routes/project/StepAnalysis.tsx')), 'function SqueletteDecider', '\n}\n'),
  'Squelette de Rédiger': extrait(sansCommentaires(lire('src/routes/project/StepMemoire.tsx')), 'if (isLoading) {', '</GabaritEtape>'),
}

/** Les listes de classes du morceau (chaînes et gabarits de `className`). */
function classes(code: string): string[] {
  return [...code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{([^}]*)\}/g, (_, x: string) => ` ${x.replace(/['"]/g, ' ')} `))
}

function largeurFixePx(liste: string): number | null {
  for (const t of liste.split(/\s+/)) {
    let m = /^w-(\d+(?:\.\d+)?)$/.exec(t)
    if (m) return Number(m[1]) * 4
    m = /^w-\[(\d+(?:\.\d+)?)rem\]$/.exec(t)
    if (m) return Number(m[1]) * 16
    m = /^w-\[(\d+)px\]$/.exec(t)
    if (m) return Number(m[1])
  }
  return null
}

test('les squelettes d’étape sont trouvés et posent des barres', () => {
  for (const [nom, code] of Object.entries(SQUELETTES)) assert.match(code, /<Squelette\b/, nom)
})

test('toute grille d’un squelette d’étape déclare ses colonnes : une barre fixe n’élargit jamais sa colonne au-delà de la carte', () => {
  for (const [nom, code] of Object.entries(SQUELETTES)) {
    for (const liste of classes(code)) {
      const jetons = liste.split(/\s+/)
      if (!jetons.includes('grid')) continue
      // des colonnes à toutes les largeurs : un `grid-cols-*` sans préfixe, ou la paire `max-md:grid-cols-*` + `md:grid-cols-*`
      const prefixes = jetons.map((t) => /^(?:([\w-]+):)?grid-cols-/.exec(t)).filter((m): m is RegExpExecArray => m !== null).map((m) => m[1] ?? '')
      const couvert = prefixes.includes('') || prefixes.some((p) => p.startsWith('max-') && prefixes.includes(p.slice(4)))
      assert.ok(couvert, `${nom} : grille sans colonnes déclarées (« ${liste.trim()} ») : ajouter grid-cols-1`)
    }
  }
})

test(`une barre plus large que l’intérieur d’une carte à 390 px (${INTERIEUR_CARTE_390} px) porte une borne`, () => {
  for (const [nom, code] of Object.entries(SQUELETTES)) {
    for (const m of code.matchAll(/<Squelette\s+className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const liste = m[1] ?? m[2]
      const px = largeurFixePx(liste)
      if (px === null || px <= INTERIEUR_CARTE_390) continue
      assert.match(liste, /(^|\s)max-w-/, `${nom} : barre de ${px} px sans borne (« ${liste.trim()} »)`)
    }
  }
})
