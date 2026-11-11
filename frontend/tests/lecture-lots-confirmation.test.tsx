// G1 + G2 (recette du 4/11) — écran Lots : « 13 unités en un clic, sans confirmation » ; l'unité n'était pas sur le bouton ;
// l'erreur s'affichait en bas de liste, hors vue ; la barre du bas n'avait aucune action sur ordinateur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  doitConfirmerLecture, libelleBoutonLire, titreConfirmationLecture, detailConfirmationLecture, phraseCoutLots,
} from '@/lib/coutLecture'
import { lire, sansCommentaires } from './outils/sources'

test('la confirmation s\'applique dès plus d\'un lot, jamais pour un seul', () => {
  assert.equal(doitConfirmerLecture(0), false)
  assert.equal(doitConfirmerLecture(1), false)
  assert.equal(doitConfirmerLecture(2), true)
  assert.equal(doitConfirmerLecture(13), true)
})

test('l\'unité est écrite sur le bouton, pour toutes les offres (aucune n\'est illimitée depuis le 11/11/2026)', () => {
  assert.equal(libelleBoutonLire(1), 'Analyser 1 lot (1 unité)')
  assert.equal(libelleBoutonLire(13), 'Analyser 13 lots (13 unités)')
  assert.equal(libelleBoutonLire(0), 'Analyser le dossier (1 unité)')
})

test('la confirmation dit « Analyser N lots = N unités » ; chaque lot analysé décompte 1 unité, pour toutes les offres', () => {
  assert.equal(titreConfirmationLecture(13), 'Analyser 13 lots = 13 unités')
  assert.equal(titreConfirmationLecture(2), 'Analyser 2 lots = 2 unités')
  assert.match(detailConfirmationLecture(), /Chaque lot analysé décompte 1 unité/)
  assert.doesNotMatch(detailConfirmationLecture() + phraseCoutLots(13) + phraseCoutLots(1) + phraseCoutLots(0), /illimit/i)
  assert.match(phraseCoutLots(13), /1 unité/)
  assert.match(phraseCoutLots(1), /1 unité/)
  assert.match(phraseCoutLots(0), /1 unité/)
})

test('la confirmation est le dialogue du système : le titre dit le décompte, le bouton dit le geste, sans répéter le titre', () => {
  const code = sansCommentaires(lire('src/components/project/LectureLots.tsx'))
  assert.match(code, /<DialogueConfirmation/)
  assert.match(code, /titre=\{titreConfirmationLecture\(nbLots\)\}/)
  assert.match(code, /libelleConfirmer=\{`Analyser les \$\{nbLots\} lots`\}/)
  assert.doesNotMatch(code, /createPortal|<button\b|style=\{\{|signature-btn/)
})

test('l\'écran Lots confirme avant d\'appeler la lecture ; le bouton « Lire » et le message d\'erreur n\'existent qu\'une fois', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  // l'appel à la lecture ne part que depuis la confirmation ou pour un seul lot
  assert.match(code, /doitConfirmerLecture\(/)
  assert.equal((code.match(/lecture\.lancer\(/g) ?? []).length, 1, 'un seul appel à lecture.lancer')
  assert.match(code, /<ConfirmationLecture\b/)
  // un seul bouton écrit : dans l'en-tête à l'ordinateur, dans la barre du bas au téléphone seulement (ActionsBarreTel)
  assert.equal((code.match(/libelleBoutonLire\(/g) ?? []).length, 1)
  assert.match(code, /actionPrincipale=\{peutLire \? actionLire : undefined\}/)
  assert.match(code, /\{peutLire && <ActionsBarreTel>\{actionLire\}<\/ActionsBarreTel>\}/)
  // l'erreur : une fois, dans le message de l'étape (sous l'en-tête), jamais dans la barre du bas
  assert.equal((code.match(/\{analysisError\}/g) ?? []).length, 1, 'affichée une fois')
  assert.match(code, /message=\{analysisError && <Message ton="erreur"/)
  const barre = code.slice(code.indexOf('<BarreEtape>'), code.indexOf('</BarreEtape>'))
  assert.doesNotMatch(barre, /analysisError|Message/)
})

test('ao-neuf-lots : sans dossier déposé, l\'écran ne demande pas les lots (le serveur répond 400) et invite à déposer', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /const sansDepot = requeteDocuments\.isSuccess && documents\.length === 0/)
  assert.match(code, /const requeteLots = useQuery\(\{\s*enabled: requeteDocuments\.isSuccess && documents\.length > 0,/)
  assert.match(code, /sansDepot \? \(\s*<EtapeSansAnalyse project=\{project\} cas="sans-depot"/)
  assert.match(code, /Les lots du dossier apparaîtront ici/)
  assert.match(code, /const peutLire = !sansDepot && !chargementEchoue && !enDetection/, 'pas de « Analyser le dossier » quand rien n’est déposé')
})

test('une erreur de chargement des lots dit son erreur (jamais « Ce dossier n’a pas de lots ») ; le chargement ne boucle pas', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /\{chargementEchoue \? \(\s*<EtatErreur\s+titre="Les lots n’ont pas pu se charger"/)
  assert.ok(code.indexOf('chargementEchoue ? (') < code.indexOf('Ce dossier n’a pas de lots</p>'), 'l’erreur passe avant le vide')
  assert.doesNotMatch(code, /animate-spin|Loader2|createPortal|<button\b|<input\b|style=\{\{|type="number"|font-mono|num-mono/)
  assert.match(code, /<ChampNombre valeur=\{num\} onChange=\{setNum\} min=\{1\} max=\{30\}/)
})

test('la lecture ne montre jamais un message brut : le hook passe par lib/erreurs', () => {
  const hook = sansCommentaires(lire('src/hooks/useLancerLecture.ts'))
  assert.match(hook, /await messageErreur\(err, /)
  assert.doesNotMatch(hook, /JSON\.stringify|err\.message/)
})
