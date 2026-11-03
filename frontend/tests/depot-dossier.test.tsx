// Étape « Dépôt du dossier » dans le gabarit : cartes du résumé, lecture visible dans la page (plus de fenêtre qui bloque), pièces
// reconnues au fur et à mesure, phrase « vous pouvez quitter cette page ». Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { BandeResume } from '@/components/etape'
import { cartesDepot, ETATS_LECTURE_SERVEUR } from '@/lib/depotDossier'
import { lire, sansCommentaires } from './outils/sources'

const DOCS = [
  { type: 'rc' as const, file_size: 2_000_000 }, { type: 'ccap' as const, file_size: 1_000_000 }, { type: 'cctp' as const, file_size: 3_000_000 },
  { type: 'autre' as const, file_size: 500_000 },
]

test('sans fichier : aucune carte ; avec fichiers : déposés, pièces clés avec jauge, à classer, lots détectés', () => {
  assert.deepEqual(cartesDepot([]), [])
  const cartes = cartesDepot(DOCS, { lots_detectes: [{ id: 'lot1', nom: 'Lot 1' }, { id: 'lot2', nom: 'Lot 2' }] })
  assert.deepEqual(cartes.map((c) => [c.libelle, c.valeur]), [['Fichiers déposés', '4'], ['Pièces clés reconnues', '3 sur 5'], ['À classer', '1'], ['Lots détectés', '2']])
  assert.deepEqual(cartes[1].jauge, { rempli: 3, total: 5 })
  assert.equal(cartes[2].etat, 'a-verifier')
  assert.equal(cartes[3].detail, 'À choisir à l’étape suivante.')
  assert.doesNotMatch(renderToStaticMarkup(<BandeResume cartes={cartes} />), /manquant|incomplet|absent|!/i)
  assert.equal(cartesDepot(DOCS.slice(0, 3))[2].valeur, '0')
})

test('l’écran : dans le gabarit, la lecture est une section de la page, les pièces apparaissent pendant la lecture, on peut partir', () => {
  const code = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
  assert.match(code, /<GabaritEtape\s+titre="Dépôt du dossier"/)
  assert.ok(!code.includes('createPortal') && !code.includes('fixed inset-0'), 'plus de fenêtre qui recouvre la page')
  assert.match(code, /<SectionEtape titre="Lecture du dossier">/)
  assert.match(code, /refetchInterval: phase === 'processing' \|\| lectureServeur \? 3000 : false/)
  assert.match(code, /Vous pouvez quitter cette page : la lecture continue/)
  assert.match(code, /Gardez cette page ouverte pendant l’envoi/)
  assert.equal((code.match(/actionPrincipale=/g) ?? []).length, 1)
  assert.match(code, /<ActionsBarreTel>[\s\S]*<BoutonSuite\s+etape="Lots"/)      // plusieurs lots : l'écran Lots reste l'étape suivante
  assert.ok(ETATS_LECTURE_SERVEUR.includes('extracting_text') && ETATS_LECTURE_SERVEUR.includes('detecting_lots'))
})
