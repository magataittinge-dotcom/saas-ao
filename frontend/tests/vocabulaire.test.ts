// 1.5 — Le ton « premium silencieux » partout : aucun mot interdit, aucun
// franglais, aucun cri dans les textes affichés de l'application.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire } from './outils/sources'
import { textesAffiches } from './outils/textes'
import { ETAPES_AO } from '../src/lib/echeance'

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
    ['src/routes/project/StepAnalysis.tsx', 'Pièces'],
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

// S4 — Renommages (simplification) : les mots du patron, ni plus ni moins.
const RESERVES_S4: string[] = []
const ANCIENS_MOTS: [RegExp, string][] = [
  [/^Synorix Intelligence$/, '« Synorix Intelligence » → « À faire maintenant »'],
  [/^Type détecté$/i, '« TYPE DÉTECTÉ » → « Reconnu comme »'],
  [/^Non classés?\b/, '« Non classé » → « À ranger »'],
  [/^Classer( le document)?$/, '« Classer » → « Ranger »'],
  [/langage libre/, '« langage libre » → « avec vos mots »'],
  [/^Livrables$/, '« Livrables » → « Ce que vous déposez »'],
  [/^Points de contrôle$/, '« Points de contrôle » → « Avant d\'envoyer »'],
]

test('S4 : les anciens libellés ont disparu des écrans (hors fichiers réservés)', () => {
  const fautes: string[] = []
  for (const f of fichiersSource()) {
    if (RESERVES_S4.includes(f)) continue
    for (const t of textesAffiches(f)) {
      for (const [re, nom] of ANCIENS_MOTS) if (re.test(t.texte.trim())) fautes.push(`${f}:${t.ligne} ${nom}`)
    }
  }
  assert.deepEqual(fautes, [])
})

test('S4 : les nouveaux libellés sont à l\'écran', () => {
  const attendus: [string, string][] = [
    ['src/components/intelligence/SynorixIntelligence.tsx', 'À faire maintenant'],
    ['src/routes/project/StepUpload.tsx', 'Reconnu comme'],
    ['src/components/common/StatusBadge.tsx', 'À ranger'],
    ['src/lib/vault.ts', 'À ranger'],
    ['src/components/common/FileCard.tsx', 'Ranger'],
    ['src/components/vault/ClassifyDocumentModal.tsx', 'Ranger le document'],
    ['src/components/company/ProfileFreeTextCard.tsx', 'Décrire avec vos mots'],
    ['src/routes/project/StepExport.tsx', 'Avant d&apos;envoyer'],
  ]
  for (const [f, mot] of attendus) {
    assert.ok(textesAffiches(f).some((t) => t.texte.includes(mot)), `${f} : « ${mot} »`)
  }
})

test('S4 : les étapes s\'appellent Dépôt du dossier, Lots, Décider, Pièces, Mémoire, Export — partout pareil', () => {
  assert.deepEqual([...ETAPES_AO], ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Mémoire', 'Export'])
  for (const f of ['src/components/project/StepProgress.tsx', 'src/components/layout/Header.tsx']) {
    const textes = textesAffiches(f).map((t) => t.texte)
    assert.ok(textes.includes('Décider') && textes.includes('Pièces'), `${f} : Décider et Pièces`)
    assert.ok(!textes.includes('Analyse IA') && !textes.includes('Vérification'), `${f} : plus d'ancien nom d'étape`)
  }
  assert.ok(textesAffiches('src/routes/project/StepVerification.tsx').some((t) => t.texte.includes('Pièces de la candidature')))
})

test('S4 : « Retour » à la place d\'« Annuler » quand le bouton ne défait rien (dépôt du dossier)', () => {
  const textes = textesAffiches('src/routes/project/StepUpload.tsx').map((t) => t.texte.trim())
  assert.ok(textes.includes('Retour'))
  assert.ok(!textes.includes('Annuler'))
})

test('S4 : « Retour » aussi sur le mémoire — fermer le formulaire de régénération ne défait rien', () => {
  const code = lire('src/routes/project/StepMemoire.tsx')
  // le bouton ne fait que replier le formulaire : aucune mutation, aucune suppression
  assert.match(code, /onClick=\{\(\) => setShowForm\(false\)\}[^>]*>\s*Retour\s*<\/button>/)
  assert.ok(!textesAffiches('src/routes/project/StepMemoire.tsx').some((t) => t.texte.trim() === 'Annuler'))
})
