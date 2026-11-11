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
  // Mission MOTS (10/11/2026) : une seule voix sur tous les écrans
  [/erreur fatale/i, '« erreur fatale »'],
  [/\binvalides?\b/i, '« invalide » (dire ce qui n’a pas pu se faire)'],
  [/\bveuillez\b/i, '« veuillez » (une phrase dit le geste)'],
  [/\bcliquez\b/i, '« cliquez » (le verbe du geste : ouvrez, choisissez…)'],
  [/\boups\b/i, '« oups »'],
  [/révolutionnaire|en un clic/i, 'vantardise'],
  [/\bSynorix IA\b/, '« Synorix IA » (Synorix suffit)'],
  [/\.\.\.(?!\.)/, '« ... » → « … »'],
]

// Typographie française : espace insécable (U+00A0 ou &nbsp;) avant « : », « ; », « ? » et à l'intérieur des guillemets.
// Les requêtes média (« (prefers-reduced-motion: reduce) ») ne sont pas des textes.
const TYPO: [RegExp, string][] = [
  [/(\p{L}|[)»]) ?:(\s|$)/u, 'espace insécable avant « : »'],
  [/(?<!&[a-z]+|&#\w+)(\p{L}|[)»]) ?[;?](\s|$)/u, 'espace insécable avant « ; » ou « ? »'],
  [/«(?![  ]|&nbsp;)|(?<![  ]|&nbsp;)»/u, 'espace insécable à l’intérieur des guillemets'],
]

// D20 (décision du fondateur, 10/11/2026) : l'opération lancée et comptée s'appelle « analyse », son verbe « analyser ».
// « relecture » (le client relit son mémoire) et la lecture d'un mémoire importé (Mon entreprise) ne sont pas l'opération.
const LECTURE_AUTORISEE: [RegExp, RegExp][] = [
  [/ImportMemoire\.tsx$/, /./], // lecture d'un mémoire importé, pas l'analyse du dossier
  [/lotsSource\.ts$/, /lectures? (assistées|directe)/], // repérage des lots au dépôt
  [/StepLotSelection\.tsx$/, /lecture des pièces est terminée/], // extraction du texte, avant l'analyse
]
test('D20 : l’opération s’appelle « analyse » — plus de « lecture », « Analyser le dossier », « non lu » à l’écran', () => {
  const fautes: string[] = []
  for (const f of fichiersSource()) {
    for (const t of textesAffiches(f)) {
      if (!/\b[Ll]ectures?\b|Lire (le|ce) dossier|\bnon lu\b/.test(t.texte)) continue
      if (LECTURE_AUTORISEE.some(([fic, txt]) => fic.test(f) && txt.test(t.texte))) continue
      fautes.push(`${t.fichier}:${t.ligne} « ${t.texte.trim().slice(0, 90)} »`)
    }
  }
  assert.deepEqual(fautes, [])
})

test('typographie française dans les textes affichés : insécables avant « : ; ? » et dans « »', () => {
  const fautes: string[] = []
  for (const f of fichiersSource()) {
    if (/moteurVisage\.ts$|\/ui\/(sidebar|command)\.tsx$/.test(f)) continue
    for (const t of textesAffiches(f)) {
      if (/\((prefers-|min-|max-|pointer|hover|orientation)/.test(t.texte)) continue
      if (/^\[\w+\]|^(ancre|apercu): /.test(t.texte)) continue // journaux de la console, jamais à l’écran
      for (const [re, nom] of TYPO) {
        if (re.test(t.texte)) fautes.push(`${t.fichier}:${t.ligne} ${nom} — « ${t.texte.trim().slice(0, 90)} »`)
      }
    }
  }
  assert.deepEqual(fautes, [])
})

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
    ['src/routes/project/StepVerification.tsx', 'Plan'],
    ['src/routes/project/StepMemoire.tsx', 'Export'],
  ]
  const anciennes = ['Suivant &gt;', 'Passer à la vérification', 'Étape Suivante', 'Aller au mémoire', 'Vérification finale']
  for (const [f, etape] of suites) {
    const textes = textesAffiches(f).map((t) => t.texte)
    // S10 : le bouton est BoutonSuite — « Étape suivante » sur ordinateur, « Suivant » au téléphone, puis « : étape »
    assert.match(lire(f), new RegExp(`<BoutonSuite\\s+etape="${etape}"`), `${f} : « Étape suivante : ${etape} »`)
    for (const a of anciennes) assert.ok(!textes.some((t) => t.includes(a)), `${f} contient encore « ${a} »`)
  }
  const lancement = textesAffiches('src/lib/coutLecture.ts').map((t) => t.texte)
  assert.ok(lancement.some((t) => t.includes('Analyser le dossier')))
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
    ['src/routes/project/StepUpload.tsx', 'Reconnu comme'],
    ['src/components/common/StatusBadge.tsx', 'À ranger'],
    ['src/lib/vault.ts', 'À ranger'],
    ['src/components/common/FileCard.tsx', 'Ranger'],
    ['src/components/vault/ClassifyDocumentModal.tsx', 'Ranger le document'],
    ['src/components/company/ProfileFreeTextCard.tsx', 'Décrire avec vos mots'],
    ['src/routes/project/StepExport.tsx', 'Voir le mémoire'],
  ]
  for (const [f, mot] of attendus) {
    assert.ok(textesAffiches(f).some((t) => t.texte.includes(mot)), `${f} : « ${mot} »`)
  }
})

test('S4 : les étapes s\'appellent Dépôt du dossier, Lots, Décider, Pièces, Mémoire, Export — partout pareil', () => {
  assert.deepEqual([...ETAPES_AO], ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Mémoire', 'Export'])
  // le Header reprend les noms de STEPS (titres-etapes-depot.test.ts) : plus de liste écrite en double
  assert.match(lire('src/components/layout/Header.tsx'), /STEPS\.map\(/)
  for (const f of ['src/components/project/StepProgress.tsx']) {
    const textes = textesAffiches(f).map((t) => t.texte)
    assert.ok(textes.includes('Décider') && textes.includes('Pièces'), `${f} : Décider et Pièces`)
    assert.ok(!textes.includes('Analyse IA') && !textes.includes('Vérification'), `${f} : plus d'ancien nom d'étape`)
  }
  assert.ok(textesAffiches('src/routes/project/StepVerification.tsx').some((t) => t.texte.includes('Réunir les pièces')), 'le titre de l’écran Pièces est le verbe du socle')
})

test('S4 : « Retour » à la place d\'« Annuler » quand le bouton ne défait rien (dépôt du dossier)', () => {
  const textes = textesAffiches('src/routes/project/StepUpload.tsx').map((t) => t.texte.trim())
  // FIN-B1 : à la première étape, « Retour » ne menait nulle part (jury, tour 1) : le bouton est parti, « Annuler » ne revient pas
  assert.ok(!textes.includes('Retour'))
  assert.ok(!textes.includes('Annuler'))
})

test('S4 : « Retour » aussi sur le mémoire — fermer le formulaire de régénération ne défait rien', () => {
  const code = lire('src/routes/project/StepMemoire.tsx')
  // le bouton ne fait que replier le formulaire : aucune mutation, aucune suppression
  assert.match(code, /onClick=\{\(\) => setShowForm\(false\)\}[^>]*>\s*Retour\s*<\/Bouton>/)
  assert.ok(!textesAffiches('src/routes/project/StepMemoire.tsx').some((t) => t.texte.trim() === 'Annuler'))
})
