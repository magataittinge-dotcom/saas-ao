// G1 + G2 (recette du 4/11) — écran Lots : « 13 unités en un clic, sans confirmation » ; l'unité n'était pas sur le bouton ;
// l'erreur s'affichait en bas de liste, hors vue ; la barre du bas n'avait aucune action sur ordinateur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  doitConfirmerLecture, libelleBoutonLire, titreConfirmationLecture, detailConfirmationLecture, phraseCoutLots,
} from '@/lib/coutLecture'
import { BoutonLireDossier, ErreurLecture, ConfirmationLectureContenu } from '@/components/project/LectureLots'
import { lire, sansCommentaires } from './outils/sources'

test('la confirmation s\'applique dès plus d\'un lot, jamais pour un seul', () => {
  assert.equal(doitConfirmerLecture(0), false)
  assert.equal(doitConfirmerLecture(1), false)
  assert.equal(doitConfirmerLecture(2), true)
  assert.equal(doitConfirmerLecture(13), true)
})

test('l\'unité est écrite sur le bouton ; en offre illimitée, aucune unité n\'est annoncée', () => {
  assert.equal(libelleBoutonLire(1, false), 'Lire 1 lot (1 unité)')
  assert.equal(libelleBoutonLire(13, false), 'Lire 13 lots (13 unités)')
  assert.equal(libelleBoutonLire(0, false), 'Lire ce dossier (1 unité)')
  assert.equal(libelleBoutonLire(13, true), 'Lire 13 lots')
  assert.equal(libelleBoutonLire(0, true), 'Lire ce dossier')
})

test('la confirmation dit « Lire N lots = N unités » ; illimité : sans unités décomptées', () => {
  assert.equal(titreConfirmationLecture(13, false), 'Lire 13 lots = 13 unités')
  assert.equal(titreConfirmationLecture(2, false), 'Lire 2 lots = 2 unités')
  assert.equal(titreConfirmationLecture(3, true), 'Lire 3 lots')
  assert.match(detailConfirmationLecture(true), /offre est illimitée/)
  assert.doesNotMatch(detailConfirmationLecture(true), /unité|décompte/)
  assert.match(phraseCoutLots(13, true), /illimitée/)
  assert.doesNotMatch(phraseCoutLots(13, true) + phraseCoutLots(1, true) + phraseCoutLots(0, true), /unité|décompte/)
  assert.match(phraseCoutLots(13, false), /1 unité/)
})

test('le bouton, l\'erreur et la fenêtre de confirmation se rendent', () => {
  const bouton = renderToStaticMarkup(<BoutonLireDossier nbLots={3} illimite={false} onClick={() => {}} />)
  assert.match(bouton, /Lire 3 lots \(3 unités\)/)
  const erreur = renderToStaticMarkup(<ErreurLecture message="Service IA momentanément indisponible" />)
  assert.match(erreur, /role="alert"/)
  assert.match(erreur, /Service IA momentanément indisponible/)
  const fenetre = renderToStaticMarkup(<ConfirmationLectureContenu nbLots={13} illimite={false} onConfirmer={() => {}} onAnnuler={() => {}} />)
  assert.match(fenetre, /Lire 13 lots = 13 unités/)
  assert.match(fenetre, /Annuler/)
  assert.match(fenetre, /Lire 13 lots<\/button>/)
})

test('l\'écran Lots confirme avant d\'appeler la lecture, met le bouton aussi dans la barre du bas et l\'erreur sous le bouton', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  // l'appel à la lecture ne part que depuis la confirmation ou pour un seul lot
  assert.match(code, /doitConfirmerLecture\(/)
  assert.equal((code.match(/lecture\.lancer\(/g) ?? []).length, 1, 'un seul appel à lecture.lancer')
  assert.match(code, /<ConfirmationLecture\b/)
  // le bouton est dans l'en-tête ET dans la barre du bas (sans ActionsBarreTel : visible sur ordinateur)
  assert.equal((code.match(/<BoutonLireDossier\b/g) ?? []).length, 2)
  assert.match(code, /<ActionsBarre>[\s\S]*<BoutonLireDossier variante="default"/)
  assert.doesNotMatch(code, /<ActionsBarreTel>/)
  // l'erreur est sous le bouton : plus de bloc d'erreur en bas de liste
  assert.match(code, /<ErreurLecture\b/)
  assert.doesNotMatch(code, /\{\/\* Error \*\/\}/)
})
