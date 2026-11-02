// Étape « Décider » dans le gabarit : le résumé, « À vérifier avant de vous engager », « Points à éclaircir ». Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { construireCarteAO } from '@/lib/carteAO'
import { cartesResumeAO, pointsAVerifier, texteACopier, libelleDateQuestions, sourceParMots, type DateQuestions } from '@/lib/resumeAO'
import { PointsAEclaircirVue } from '@/components/project/PointsAEclaircir'
import AVerifierAvantEngagement from '@/components/project/AVerifierAvantEngagement'
import { BandeResume } from '@/components/etape'
import { lire, sansCommentaires } from './outils/sources'

const SOURCE = { document: 'RC-demo.pdf', page: 4, excerpt: 'Les offres sont remises avant le 20 novembre 2026.' }
const DATE_RELATIVE: DateQuestions = { statut: 'trouvee', regle: 'relative', date: '2027-03-12', heure: null, jours: 10, document: 'RC-demo.pdf', extrait: 'au plus tard 10 jours avant la date limite', motif: null, rappel: 'Rappel inventé.' }
const faits = construireCarteAO({
  projet: { name: 'AO inventé' },
  champs: {
    date_limite_remise: { value: { date: '2026-11-20', heure: '12h00' }, source: SOURCE },
    visite_site: { value: { statut: 'obligatoire', date: null }, source: { document: 'RC-demo.pdf', page: 5, excerpt: 'Visite obligatoire.' } },
  },
  pieces: [{ status: 'present', jointe: true, valable_jusqu_au: '2027-03-01' }, { status: 'manquant' }, { status: 'manquant' }],
  maintenant: new Date(2026, 10, 10, 9),
})

test('le résumé : remise (date, jour, heure, temps restant, source), date limite des questions, pièces avec jauge, exigences', () => {
  const voir = () => undefined
  const cartes = cartesResumeAO(faits, { total: 62, obligatoires: 41 }, voir, DATE_RELATIVE)
  assert.deepEqual(cartes.map((c) => c.libelle), ['Remise des offres', 'Questions à l’acheteur jusqu’au', 'Pièces à joindre', 'Exigences relevées'])
  const [remise, questions, pieces, exigences] = cartes
  assert.equal(remise.valeur, '20 novembre 2026')
  assert.equal(remise.detail, 'vendredi · 12h00 · dans 10 jours')
  assert.equal(remise.source?.libelle, 'RC-demo.pdf · page 4')
  assert.deepEqual([questions.valeur, questions.detail], ['12 mars 2027', '10 jours avant la remise des offres'])
  assert.equal(questions.source?.libelle, 'RC-demo.pdf')
  assert.deepEqual([pieces.valeur, pieces.jauge], ['2', { rempli: 1, total: 3 }])
  assert.equal(exigences.valeur, '62')
  const html = renderToStaticMarkup(<BandeResume cartes={cartes} />)
  assert.match(html, /Source : RC-demo\.pdf · page 4/)
  assert.match(html, /Voir dans le dossier/)
  // date des questions illisible : « À vérifier dans le règlement », jamais une date inventée
  const inconnue = cartesResumeAO(faits, null, voir, { ...DATE_RELATIVE, statut: 'a_verifier', date: null, document: null, extrait: null })
  assert.deepEqual(inconnue.find((c) => c.libelle.startsWith('Questions'))?.valeur, 'À vérifier dans le règlement')
})

test('sans remise lisible : « À vérifier dans le règlement », jamais une date inventée ; sans pièces ni exigences : pas de carte vide', () => {
  const cartes = cartesResumeAO([], null)
  assert.deepEqual(cartes.map((c) => [c.libelle, c.valeur, c.etat]), [['Remise des offres', 'À vérifier dans le règlement', 'a-verifier']])
})

test('« À vérifier avant de vous engager » : chaque point avec sa source, les pénalités en une ligne et un lien', () => {
  const exigences = [
    { exigence_text: 'Les variantes sont interdites.', source_document: 'RC-demo.pdf', source_page: 7, source_excerpt: 'Les variantes ne sont pas admises.' },
    { exigence_text: 'Une retenue de garantie est opérée.', source_document: 'CCAP-demo.pdf', source_page: 12, source_excerpt: null },
  ]
  const points = pointsAVerifier(
    {
      penalites: { value: { retard: '1/3000 du montant par jour', plafond: '10 %' }, source: { document: 'CCAP-demo.pdf', page: 13, excerpt: null } },
      delai_execution: { value: '8 mois', source: { document: 'CCAP-demo.pdf', page: 3, excerpt: null } },
      visite_site: { value: { statut: 'obligatoire', date: '2026-11-05' }, source: { document: 'RC-demo.pdf', page: 5, excerpt: null } },
    },
    { variantes_autorisees: false, retenue_garantie_pct: 5, caution_remplacante: true, validite_offres_jours: 120 },
    exigences,
  )
  assert.deepEqual(points.map((p) => p.id), ['penalites', 'delai', 'visite', 'variantes', 'garanties', 'validite'])
  const par = Object.fromEntries(points.map((p) => [p.id, p]))
  assert.equal(par.penalites.valeur, 'Le marché prévoit des pénalités de retard.')
  assert.ok(!/3000|10 %/.test(par.penalites.valeur), 'le détail des pénalités vit dans le bloc trésorerie')
  assert.equal(par.penalites.versTresorerie, true)
  assert.equal(par.visite.valeur, 'Obligatoire, le jeudi 5 novembre 2026')
  assert.equal(par.variantes.valeur, 'Les variantes ne sont pas autorisées.')
  assert.equal(par.variantes.source?.page, 7)
  assert.equal(par.garanties.valeur, 'Retenue de garantie de 5 %, remplaçable par une caution.')
  assert.equal(par.garanties.source?.document, 'CCAP-demo.pdf')
  const html = renderToStaticMarkup(<AVerifierAvantEngagement points={points} onVoir={() => undefined} onVoirPenalites={() => undefined} />)
  assert.match(html, /À vérifier avant de vous engager/)
  assert.equal((html.match(/data-a-verifier=/g) ?? []).length, 6)
  assert.match(html, /Voir les pénalités/)
  assert.doesNotMatch(html, /manquant|incomplet|absent/i)
  assert.deepEqual(pointsAVerifier(null, null, []), [])
  assert.equal(sourceParMots([], /x/), null)
})

const POINT = { question: 'Pourriez-vous préciser le phasage retenu pour fixer le délai d’exécution ?', pourquoi: 'Le délai dépend d’un phasage non décrit.', source_document: 'RC-demo.pdf', source_page: 4, extrait: 'le délai est à préciser selon le phasage' }
const PREP = { onPreparer: () => undefined, enCours: false, erreur: null }

test('le texte à copier : poli, sans le « pourquoi », avec la référence du dossier', () => {
  const t = texteACopier(POINT)
  assert.match(t, /^Bonjour,\n\nPourriez-vous préciser/)
  assert.match(t, /\(Référence : RC-demo\.pdf, page 4\.\)/)
  assert.match(t, /Merci par avance de votre réponse\.$/)
  assert.ok(!t.includes('Le délai dépend'))
})

test('la date limite des questions : calculée avec sa règle, ou « À vérifier dans le règlement »', () => {
  assert.deepEqual(libelleDateQuestions(DATE_RELATIVE), { libelle: 'Date limite des questions', valeur: 'vendredi 12 mars 2027', precision: '10 jours avant la remise des offres' })
  const absente: DateQuestions = { statut: 'a_verifier', regle: null, date: null, heure: null, jours: null, document: null, extrait: null, motif: 'Aucune date…' }
  assert.equal(libelleDateQuestions(absente).valeur, 'À vérifier dans le règlement')
  assert.equal(libelleDateQuestions(undefined).valeur, 'À vérifier dans le règlement')
  const formule = { ...absente, regle: 'relative' as const, jours: 5, document: 'RC-demo.pdf', extrait: 'cinq jours ouvrés avant la date limite' }
  assert.match(libelleDateQuestions(formule).precision ?? '', /formule/)
})

test('points à éclaircir : invitation sans unité décomptée, puis questions sourcées avec « Copier », ou « rien à poser »', () => {
  const avant = renderToStaticMarkup(<PointsAEclaircirVue points={undefined} date={DATE_RELATIVE} preparation={PREP} />)
  assert.match(avant, /Préparer les questions/)
  assert.match(avant, /Ne décompte aucune unité/)
  assert.doesNotMatch(avant, /€|euro/i)
  assert.match(avant, /vendredi 12 mars 2027/)

  const enCours = renderToStaticMarkup(<PointsAEclaircirVue points={undefined} date={null} preparation={{ ...PREP, enCours: true }} />)
  assert.match(enCours, /aria-busy="true"/)
  assert.match(enCours, /Vous pouvez rester sur cette page/)

  const avec = renderToStaticMarkup(<PointsAEclaircirVue points={[POINT, { ...POINT, question: 'Pourriez-vous confirmer la durée du préavis avant intervention ?', source_page: null }]} date={DATE_RELATIVE} onVoir={() => undefined} preparation={PREP} />)
  assert.equal((avec.match(/data-point-a-eclaircir/g) ?? []).length, 2)
  assert.match(avec, /Source : RC-demo\.pdf · page 4/)
  assert.match(avec, /Source : RC-demo\.pdf</)
  assert.equal((avec.match(/Copier la question/g) ?? []).length, 2)
  assert.doesNotMatch(avec, /Préparer les questions/)

  const vide = renderToStaticMarkup(<PointsAEclaircirVue points={[]} date={null} preparation={PREP} />)
  assert.match(vide, /rien à poser à l’acheteur/)
})

test('l’écran Décider passe par le gabarit : une seule action principale en tête, les sections dans l’ordre, aucun doublon des pénalités', () => {
  const code = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.match(code, /<GabaritEtape\s+titre="Décider"/)
  assert.equal((code.match(/actionPrincipale=/g) ?? []).length, 1)
  const ordre = ['Le marché en bref', '<AVerifierAvantEngagement', '<PointsAEclaircir ', 'titre="Décision"', 'Trésorerie et calendrier', 'Les exigences du dossier'].map((m) => code.indexOf(m))
  assert.ok(ordre.every((n, i) => n > 0 && (i === 0 || n > ordre[i - 1])), `ordre des sections : ${ordre}`)
  // l'action principale n'est pas doublée sur ordinateur : la barre ne la porte qu'au téléphone
  assert.match(code, /<ActionsBarreTel>\s*<BoutonSuite\s+etape="Pièces"/)
  // aucune question ni donnée de prix côté écran
  for (const f of ['src/components/project/PointsAEclaircir.tsx', 'src/components/project/AVerifierAvantEngagement.tsx', 'src/lib/resumeAO.ts']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${f} : aucune couleur écrite`)
  }
})

test('réponse de l’acheteur N jours avant la remise : « Réponses de l’acheteur jusqu’au », « Posez vos questions avant cette date », source du règlement', () => {
  const reponse: DateQuestions = { ...DATE_RELATIVE, regle: 'reponse_acheteur', date: '2027-03-16', jours: 6 }
  const l = libelleDateQuestions(reponse)
  assert.equal(l.libelle, 'Réponses de l’acheteur jusqu’au')
  assert.equal(l.valeur, 'mardi 16 mars 2027')
  assert.match(l.precision ?? '', /^Posez vos questions avant cette date : l’acheteur répond 6 jours avant la remise des offres\.$/)
  const html = renderToStaticMarkup(<PointsAEclaircirVue points={[]} date={reponse} onVoir={() => undefined} preparation={PREP} />)
  assert.match(html, /Réponses de l’acheteur jusqu’au/)
  assert.match(html, /Posez vos questions avant cette date/)
  assert.match(html, /Source : RC-demo\.pdf/)
  const carte = cartesResumeAO([], null, undefined, reponse).find((c) => c.libelle.startsWith('Réponses'))
  assert.equal(carte?.valeur, '16 mars 2027')
})
