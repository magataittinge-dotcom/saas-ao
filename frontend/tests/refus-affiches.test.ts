// Finale (12/11), partie 2 de SERVEUR-2 — les nouveaux refus du serveur (CORRECTIFS-SECURITE § 4) s'affichent avec leur
// phrase. Déjà bons à la relecture : 429 (analyse, mémoire, Refaire, Réécrire, questions, import), 402 quota, 413 partout,
// 507 des dépôts de Mon entreprise. Corrigés ici : 507 du dépôt du DCE et du coffre-fort (messageErreur taisait tout 5xx
// sauf 503), 429 de « Reformuler » (phrase fixe), 402 SIRET (ouvrait la grille des offres au lieu de Mon entreprise).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import { messageErreur } from '@/lib/erreurs'
import { estRefusSiret } from '@/lib/refus'
import { lire, sansCommentaires } from './outils/sources'

const refus = (status: number, detail: unknown) => new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
  status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail },
})

const DISQUE = 'Le dépôt est momentanément indisponible. Vos documents déjà déposés sont intacts ; réessayez dans quelques heures.'
const SIRET = 'Pour utiliser votre AO offert, renseignez le SIRET de votre entreprise dans Mon entreprise. '
  + 'Il sera vérifié automatiquement, puis vous pourrez lancer l’analyse.'

test('507 disque presque plein : la phrase du serveur (dépôt du DCE, coffre-fort)', async () => {
  assert.equal(await messageErreur(refus(507, DISQUE), 'défaut'), DISQUE)
  // une panne reste tue : la phrase de l'écran
  assert.equal(await messageErreur(refus(500, 'Internal Server Error'), 'défaut'), 'défaut')
  assert.equal(await messageErreur(refus(502, 'Bad Gateway'), 'défaut'), 'défaut')
})

test('413 stockage plein : la phrase du serveur', async () => {
  assert.equal(await messageErreur(refus(413, 'Votre espace de stockage est plein.'), 'défaut'), 'Votre espace de stockage est plein.')
})

test('402 SIRET reconnu ; 402 quota (même « essai déjà utilisé pour ce SIRET ») non', () => {
  assert.equal(estRefusSiret(SIRET), true)
  assert.equal(estRefusSiret('L’essai gratuit a déjà été utilisé pour ce SIRET. Passez à une offre.'), false)
  assert.equal(estRefusSiret('Quota du mois atteint.'), false)
  assert.equal(estRefusSiret(null), false)
})

test('402 SIRET : le mur mène à Mon entreprise > Identité, pas à la grille des offres', () => {
  const src = sansCommentaires(lire('src/components/common/SubscriptionWall.tsx'))
  assert.match(src, /estRefusSiret\(message\)/)
  // COR-B1 : le lien d'issue est écrit une fois (`versPage`), pour le SIRET comme pour le quota Business
  assert.match(src, /versPage\('\/company\?rubrique=identite', 'Ouvrir Mon entreprise'\)/)
  assert.match(src, /<Link to=\{to\} onClick=\{onClose\}>/)
})

test('429 de « Reformuler » : la phrase du serveur (messageErreur), plus une phrase fixe', () => {
  const src = sansCommentaires(lire('src/components/company/ProfileFreeTextCard.tsx'))
  assert.match(src, /onError: async \(err\) => setError\(await messageErreur\(err,/)
})
