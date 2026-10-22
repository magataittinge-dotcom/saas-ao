// 1.5 — Le ton « premium silencieux » partout : aucun mot interdit, aucun
// franglais, aucun cri dans les textes affichés de l'application.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource } from './outils/sources'
import { textesAffiches } from './outils/textes'

export const INTERDITS: [RegExp, string][] = [
  [/manquant/i, '« manquant »'],
  [/incompl[eè]t/i, '« incomplet »'],
  [/\babsente?s?\b/i, '« absent »'],
  [/❌/u, '« ❌ »'],
  [/automatiquement rejet/i, '« automatiquement rejetée »'],
  [/\bAttention\s*:/, '« Attention : »'],
  [/\bupload/i, '« upload » (franglais)'],
  [/\bdeadline\b/i, '« deadline » (franglais)'],
  [/\bfree\b/i, '« free » (franglais)'],
  [/\bupgrade\b/i, '« upgrade » (franglais)'],
  [/[A-ZÀ-Ü]{2,}[^a-zà-ü]*'[A-ZÀ-Ü]{3,}/u, 'capitales criées'],
  [/\S\s*(\s>|&gt;)\s*$/, 'chevron « > » en fin de libellé'],
]

test('aucun mot interdit, franglais ni capitales criées dans les textes affichés', () => {
  const fautes: string[] = []
  for (const f of fichiersSource()) {
    for (const t of textesAffiches(f)) {
      for (const [re, nom] of INTERDITS) {
        if (re.test(t.texte)) fautes.push(`${t.fichier}:${t.ligne} ${nom} — « ${t.texte.trim().slice(0, 90)} »`)
      }
    }
  }
  assert.deepEqual(fautes, [])
})

test("une seule formule pour passer à l'étape suivante, qui nomme la bonne étape", () => {
  const suites: [string, string][] = [
    ['src/routes/project/StepUpload.tsx', 'Lots'],
    ['src/routes/project/StepAnalysis.tsx', 'Vérification'],
    ['src/routes/project/StepVerification.tsx', 'Mémoire'],
    ['src/routes/project/StepMemoire.tsx', 'Export'],
  ]
  const anciennes = ['Suivant &gt;', 'Passer à la vérification', 'Étape Suivante', 'Aller au mémoire', 'Vérification finale']
  for (const [f, etape] of suites) {
    const textes = textesAffiches(f).map((t) => t.texte)
    assert.ok(textes.some((t) => t.includes(`Étape suivante : ${etape}`)), `${f} : « Étape suivante : ${etape} »`)
    for (const a of anciennes) assert.ok(!textes.some((t) => t.includes(a)), `${f} contient encore « ${a} »`)
  }
  const lancement = textesAffiches('src/routes/project/StepLotSelection.tsx').map((t) => t.texte)
  assert.ok(lancement.includes("Lancer l'analyse"))
})
