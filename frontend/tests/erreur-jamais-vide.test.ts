// F-03 (audit QUALITE-FRONT) — une erreur du serveur n'est jamais un vide. Ce test COMPTE les lectures (`useQuery`, et les
// crochets maison qui en rendent une) dont l'écran ne distingue pas l'erreur du vide : ni `isError`, ni `error`, ni
// `status`, ni `isSuccess` lus, ni la requête confiée à <EtatRequete> / `phaseRequete`. Le compte, fichier par fichier,
// est un garde-fou qui ne peut que BAISSER : une lecture nouvelle sans état d'erreur fait échouer le test ; une lecture
// corrigée aussi, tant que son plafond n'est pas baissé ici.
//
// Ce qui reste sous plafond n'affiche jamais un état vide à la place d'une erreur (vérifié un par un le 12/11/2026) : ce
// sont des compléments qui, sans réponse, ne s'affichent pas du tout (un repère, une pastille, un compteur, un libellé),
// jamais une phrase « aucun… ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const SIGNES = 'isError|error|status|isSuccess'

export interface LectureMuette { fichier: string; nom: string }

/** Les lectures dont l'écran ne sait pas dire « le chargement a échoué ». */
export function lecturesMuettes(): LectureMuette[] {
  const codes = new Map(fichiersSource('src').map((f) => [f, sansCommentaires(lire(f))] as const))
  // Les crochets maison qui rendent une requête telle quelle : on juge leurs appelants, pas le crochet.
  const crochets = new Set<string>()
  for (const code of codes.values()) {
    for (const m of code.matchAll(/function (use\w+)\([^)]*\)[^{]*\{\s*return useQuery\b/g)) crochets.add(m[1])
  }
  const appel = new RegExp(`const\\s+(\\{[^}]*\\}|\\w+)\\s*=\\s*(?:useQuery|${[...crochets].join('|')})\\b`, 'g')
  const muettes: LectureMuette[] = []
  for (const [fichier, code] of codes) {
    for (const m of code.matchAll(appel)) {
      const gauche = m[1]
      if (gauche.startsWith('{')) {
        if (!new RegExp(`\\b(${SIGNES})\\b`).test(gauche)) muettes.push({ fichier, nom: gauche.replace(/\s+/g, ' ') })
        continue
      }
      const v = gauche
      const lue = new RegExp(`\\b${v}\\.(${SIGNES})\\b|requete=\\{${v}\\}|phaseRequete\\(${v}\\b`).test(code)
      // Confiée à une liste de lectures jugée d'un bloc : `const lectures = [a, b]` puis `lectures.some((r) => r.isError …)`.
      const enListe = [...code.matchAll(/const (\w+) = \[([^\]]*)\]/g)].some(([, liste, membres]) =>
        new RegExp(`\\b${v}\\b`).test(membres)
        && new RegExp(`\\b${liste}\\.(?:some|every|filter|find)\\(\\(?(\\w+)\\)?\\s*=>\\s*\\1\\.(?:${SIGNES})\\b`).test(code))
      if (!lue && !enListe) muettes.push({ fichier, nom: v })
    }
  }
  return muettes
}

// Plafond par fichier (12/11/2026 : 48 lectures muettes, 40 après correction de la veille de Mes AO, de la cloche, des
// dépôts de Mon entreprise et de Ctrl K). Ne se relève jamais ; se baisse quand une lecture passe par <EtatRequete>.
const PLAFONDS: Record<string, number> = {
  'src/components/entreprise/CarteSiege.tsx': 1,
  'src/components/entreprise/CasesDepot.tsx': 1,
  'src/components/layout/Header.tsx': 1,
  'src/components/layout/QuotaGauge.tsx': 2,
  'src/components/layout/useUrgents.ts': 2,
  'src/components/memoire/RelectureMemoire.tsx': 1,
  'src/components/mesao/VideMesAO.tsx': 1,
  'src/components/parametres/SuppressionCompte.tsx': 1,
  'src/components/project/CarteAO30s.tsx': 3,
  'src/components/project/CriticalBanner.tsx': 1,
  'src/components/project/MemoirePreflight.tsx': 2,
  'src/components/project/PointsAEclaircir.tsx': 1,
  'src/components/project/RetroPlanning.tsx': 1,
  'src/components/project/SynorixScoreCard.tsx': 1,
  'src/components/project/TresorerieCard.tsx': 1,
  'src/components/veille/AvisPourVous.tsx': 1,
  'src/hooks/useAvisAttente.ts': 1,
  'src/hooks/useLotsDuDepot.ts': 1,
  'src/hooks/useSourceChamp.tsx': 1,
  'src/hooks/useVeille.ts': 1,
  'src/routes/Dashboard.tsx': 1,
  'src/routes/Projects.tsx': 1,
  'src/routes/project/StepAnalysis.tsx': 2,
  'src/routes/project/StepExport.tsx': 1,
  'src/routes/project/StepLotSelection.tsx': 3,
  'src/routes/project/StepMemoire.tsx': 6,
  'src/routes/project/StepPlan.tsx': 1,
}

test('F-03 — total : 40 lectures muettes au plus', () => {
  assert.ok(Object.values(PLAFONDS).reduce((a, b) => a + b, 0) <= 40)
})

test('F-03 — aucune lecture nouvelle ne confond l’erreur et le vide ; le compte ne fait que baisser', () => {
  const parFichier: Record<string, string[]> = {}
  for (const l of lecturesMuettes()) (parFichier[l.fichier] ??= []).push(l.nom)
  const depassements = Object.entries(parFichier)
    .filter(([f, noms]) => noms.length > (PLAFONDS[f] ?? 0))
    .map(([f, noms]) => `${f} : ${noms.length} (plafond ${PLAFONDS[f] ?? 0}) → ${noms.join(' ; ')}`)
  assert.deepEqual(depassements, [], 'lecture sans état d’erreur : passez par <EtatRequete> (components/ui/etats.tsx)')
  const baisses = Object.entries(PLAFONDS)
    .filter(([f, n]) => (parFichier[f]?.length ?? 0) < n)
    .map(([f, n]) => `${f} : ${parFichier[f]?.length ?? 0} < plafond ${n}`)
  assert.deepEqual(baisses, [], 'bravo : baissez le plafond de ces fichiers dans ce test')
})

test('F-03 — le compteur voit une lecture muette et reconnaît une lecture qui dit son erreur', () => {
  const muettes = lecturesMuettes()
  // Exemples tenus : la liste des AO (Mes AO) passe par <EtatRequete> ; Mon entreprise juge ses cinq lectures d'un bloc.
  assert.ok(!muettes.some((l) => l.fichier === 'src/routes/Projects.tsx' && l.nom === 'requete'))
  assert.ok(!muettes.some((l) => l.fichier === 'src/components/entreprise/useDonneesEntreprise.ts'))
  assert.ok(muettes.length > 0, 'le compteur ne voit plus rien : son motif est cassé')
})
