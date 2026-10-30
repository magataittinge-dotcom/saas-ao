// Phase C (sprint Ozcan, nuit du 30/10) — la page d'un AO suit le thème clair / nuit : aucune couleur écrite
// en dur (hex, rgb, hsl, classes de palette fixe) dans les écrans listés, tout passe par les jetons
// (styles/theme.css) et les composants de base. Un seul balayage, enrichi à chaque tranche.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { estThemee } from '@/components/layout/Layout'

const TRANCHES: Record<string, string[]> = {
  'analyse (exigences, carte 30 s, filtres, panneau « Voir dans le DCE »)': [
    'src/routes/project/StepAnalysis.tsx',
    'src/components/project/CarteAO30s.tsx',
    'src/components/project/CriticalBanner.tsx',
    'src/components/project/TresorerieCard.tsx',
    'src/components/project/SynorixScoreCard.tsx',
    'src/components/project/RetroPlanning.tsx',
    'src/components/project/AnalysisProgress.tsx',
    'src/components/common/ProgressDisplay.tsx',
    'src/components/common/EchecAction.tsx',
    'src/components/project/source/FeuilleSource.tsx',
    'src/components/project/source/NavigationPages.tsx',
    'src/components/project/source/PanneauSource.tsx',
    'src/components/project/source/VueDocument.tsx',
    'src/components/project/source/VueTableau.tsx',
    'src/components/project/source/VuesSource.tsx',
  ],
  'pièces (vérification, coffre-fort, modèles du DCE, composants communs)': [
    'src/routes/project/StepVerification.tsx',
    'src/components/project/CandidatureSectionVault.tsx',
    'src/components/project/CandidatureSectionTemplates.tsx',
    'src/components/project/VaultPickerModal.tsx',
    'src/components/project/NonConcerne.tsx',
    'src/components/project/SignatureLigne.tsx',
    'src/components/common/StatusBadge.tsx',
    'src/components/common/FileCard.tsx',
    'src/components/common/ExpiryAlert.tsx',
    'src/components/common/DeleteConfirmModal.tsx',
    'src/components/common/AiTip.tsx',
    'src/components/common/Toast.tsx',
    'src/components/common/Skeleton.tsx',
    'src/components/common/SubscriptionWall.tsx',
    'src/components/common/EcranEnChargement.tsx',
    'src/styles/pieces.css',
  ],
  'mémoire (éditeur, contrôle avant génération, réécriture ciblée)': [
    'src/routes/project/StepMemoire.tsx',
    'src/components/project/MemoirePreflight.tsx',
    'src/components/project/RewritePassageBar.tsx',
    'src/components/project/PoidsMemoire.tsx',
  ],
  'export (ZIP, Word, PDF, visionneuse de pièce)': [
    'src/routes/project/StepExport.tsx',
    'src/components/project/ExigencesDuDossier.tsx',
    'src/components/project/DocumentViewer.tsx',
  ],
}

// hex (3, 4, 6 ou 8 chiffres), fonctions rgb/hsl, classes Tailwind de palette fixe (bg-slate-900, text-white/90…)
const COULEUR_EN_DUR = new RegExp(
  [
    String.raw`(?<![&\w])#[0-9A-Fa-f]{8}\b`, String.raw`(?<![&\w])#[0-9A-Fa-f]{6}\b`, String.raw`(?<![&\w])#[0-9A-Fa-f]{3,4}\b(?![\w-])`,
    String.raw`\brgba?\(`, String.raw`\bhsla?\(`,
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d+)?(?![\w-])`,
  ].join('|'),
  'g',
)

for (const [ecran, fichiers] of Object.entries(TRANCHES)) {
  test(`${ecran} : aucune couleur écrite en dur, tout passe par les jetons`, () => {
    const enDur = fichiers.flatMap((f) => {
      const code = sansCommentaires(lire(f))
      return [...code.matchAll(COULEUR_EN_DUR)].map((m) => `${f} : ${m[0]}`)
    })
    assert.deepEqual(enDur, [])
  })
}

test('les routes /projects/:id/… suivent le thème ; la liste, Nouvel AO restent comme avant', () => {
  for (const p of ['/projects/p1', '/projects/p1/upload', '/projects/abc-123/analysis', '/projects/p1/export']) assert.equal(estThemee(p), true, p)
  assert.equal(estThemee('/projects'), true)
  assert.equal(estThemee('/projects/new'), false)
  assert.equal(estThemee('/vault'), false)
})
