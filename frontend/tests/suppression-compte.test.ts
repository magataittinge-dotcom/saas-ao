// D23 (12/11) — « Supprimer mon compte » dit la vérité selon le cas : immédiate et définitive sans abonnement payé ;
// avec un abonnement, l'arrêt à l'échéance, le compte ouvert jusque-là, pas de remboursement du mois entamé. La rangée
// dit « Suppression prévue le … » avec « Annuler la suppression » ; un 502 ou un 500 montre la phrase du serveur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import {
  PHRASE_IMMEDIATE, dateSuppression, libelleConfirmer, libelleSuppressionPrevue, messageRefusCompte, phraseDialogue,
} from '@/lib/suppressionCompte'
import { lire, sansCommentaires } from './outils/sources'

const refus = (status: number, detail: unknown) => new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
  status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail },
})

test('date du serveur (UTC sans fuseau) lue en heure de Paris, avec l’année', () => {
  assert.equal(dateSuppression('2030-03-14T10:00:00'), '14 mars 2030')
  assert.equal(dateSuppression('2030-03-31T23:30:00'), '1 avril 2030')       // déjà le 1er à Paris
  assert.equal(dateSuppression(null), '')
})

test('sans abonnement payé : immédiate et définitive', () => {
  assert.equal(phraseDialogue({ immediate: true, fin_de_periode: null }), PHRASE_IMMEDIATE)
  assert.match(PHRASE_IMMEDIATE, /tout de suite/)
  assert.match(PHRASE_IMMEDIATE, /définitive/)
  assert.equal(libelleConfirmer({ immediate: true }), 'Supprimer définitivement')
})

test('avec un abonnement : la phrase de D23, date comprise', () => {
  assert.equal(phraseDialogue({ immediate: false, fin_de_periode: '2030-03-14T10:00:00' }),
    'Votre abonnement s’arrête le 14 mars 2030. Votre compte reste ouvert jusqu’à cette date, puis toutes vos données '
    + 'sont supprimées. Le mois entamé n’est pas remboursé.')
  assert.equal(libelleConfirmer({ immediate: false }), 'Programmer la suppression')
})

test('rangée du compte une fois la demande faite', () => {
  assert.equal(libelleSuppressionPrevue('2030-03-14T10:00:00'), 'Suppression prévue le 14 mars 2030')
})

test('502 et 500 : la phrase du serveur telle quelle ; sinon la phrase de l’écran', () => {
  const phrase = 'L’abonnement n’a pas pu être résilié : rien n’a été supprimé. Réessayez dans quelques minutes ou écrivez-nous.'
  assert.equal(messageRefusCompte(refus(502, phrase), 'défaut'), phrase)
  assert.equal(messageRefusCompte(refus(500, 'Le compte n’a pas pu être supprimé.'), 'défaut'), 'Le compte n’a pas pu être supprimé.')
  assert.equal(messageRefusCompte(refus(502, ''), 'défaut'), 'défaut')
  assert.equal(messageRefusCompte(new Error('x'), 'défaut'), 'défaut')
})

test('aucun mot interdit ni point d’exclamation dans les phrases', () => {
  const src = lire('src/lib/suppressionCompte.ts') + lire('src/components/parametres/SuppressionCompte.tsx')
  assert.doesNotMatch(src, /manquant|incomplet|absent|!\s*['’`]/i)
})

test('Paramètres > Compte porte la rangée, dans la carte du compte, avec les composants du système', () => {
  const settings = sansCommentaires(lire('src/routes/Settings.tsx'))
  const carteCompte = settings.slice(settings.indexOf('>Compte<'), settings.indexOf('>Entreprise<'))
  assert.match(carteCompte, /<SuppressionCompte \/>/)
  const comp = sansCommentaires(lire('src/components/parametres/SuppressionCompte.tsx'))
  assert.match(comp, /from '@\/components\/ui\/dialogue'/)
  assert.match(comp, /DialogueConfirmation/)
  assert.match(comp, /api\.get<ApercuSuppression>\('\/users\/me\/suppression'\)/)
  assert.match(comp, /api\.delete<[^>]+>\('\/users\/me'\)/)
  assert.match(comp, /api\.post\('\/users\/me\/annuler-suppression'\)/)
  assert.match(comp, /Annuler la suppression/)
  assert.match(comp, /suppression_prevue_le/)
})

// Point 74 de DECISIONS.md : supprimer le compte efface toute l'organisation ; le serveur le réserve à l'administrateur
// (backend/tests/test_suppression_reservee_admin.py). Un membre ne voit pas le bouton : une phrase dit à qui s'adresser.
test('point 74 : un membre ne voit ni « Supprimer mon compte » ni « Annuler la suppression » ; la phrase dit à qui s’adresser', async () => {
  const { PHRASE_MEMBRE } = await import('@/lib/suppressionCompte')
  assert.match(PHRASE_MEMBRE, /réservée à l’administrateur de votre entreprise/)
  assert.doesNotMatch(PHRASE_MEMBRE, /!/)
  const comp = sansCommentaires(lire('src/components/parametres/SuppressionCompte.tsx'))
  assert.match(comp, /const membre = useAuthStore\(\(s\) => s\.user\?\.role === 'member'\)/)
  // les deux boutons ne sont rendus que hors du cas « membre »
  assert.match(comp, /\{membre \? \(\s*<span[^>]*>\{PHRASE_MEMBRE\}<\/span>\s*\) : prevue \?/)
})
