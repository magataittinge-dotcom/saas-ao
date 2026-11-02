// « Dans vos métiers » : lots rattachés aux métiers de Mon entreprise ; coût en unités. Intitulés inventés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metiersDuLot, repartirLotsParMetiers, libelleUnites } from '@/lib/lotsMetiers'

const LOTS = [
  { nom: 'Lot 1 — Gros œuvre' }, { nom: 'Lot 2 — Charpente et couverture' }, { nom: 'Lot 3 — Menuiseries extérieures' },
  { nom: 'Lot 4 — Plâtrerie, cloisons' }, { nom: 'Lot 5 — Divers' },
]

test('l’intitulé d’un lot évoque ses métiers', () => {
  assert.deepEqual(metiersDuLot('Lot 3 — Menuiseries extérieures'), ['menuiseries'])
  assert.deepEqual(metiersDuLot('Lot 2 — Charpente et couverture'), ['couverture'])
  assert.ok(metiersDuLot('Ravalement et isolation par l’extérieur').includes('facade_ite'))
  assert.deepEqual(metiersDuLot('Lot 5 — Divers'), [])
})

test('les lots de vos métiers d’abord, les autres à part ; rien n’est séparé sans raison', () => {
  const r = repartirLotsParMetiers(LOTS, ['gros_oeuvre', 'platrerie'])
  assert.deepEqual(r.dansVosMetiers.map((l) => l.nom), ['Lot 1 — Gros œuvre', 'Lot 4 — Plâtrerie, cloisons'])
  assert.equal(r.autres.length, 3)
  assert.equal(r.separes, true)
  // aucun métier déclaré ou aucun lot reconnu : une seule liste
  for (const metiers of [[], undefined, ['ascenseurs']]) {
    const x = repartirLotsParMetiers(LOTS, metiers)
    assert.equal(x.separes, false)
    assert.equal(x.dansVosMetiers.length, 0)
    assert.equal(x.autres.length, LOTS.length)
  }
  // un lot renommé par l'utilisateur est lu sous son nouveau nom
  assert.equal(repartirLotsParMetiers([{ nom: 'Lot 9', user_label: 'Lot 9 — Peinture' }, { nom: 'Lot 8 — Divers' }], ['peinture']).dansVosMetiers.length, 1)
})

test('le coût se dit en unités', () => {
  assert.deepEqual([libelleUnites(1), libelleUnites(3)], ['1 unité', '3 unités'])
})

import { lire, sansCommentaires } from './outils/sources'

test('l’écran Lots passe par le gabarit : « Lire ce dossier » grisé sans choix, coût en unités, rien de coché par défaut, jamais d’euros', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /<GabaritEtape\s+titre="Lots"/)
  assert.equal((code.match(/actionPrincipale=/g) ?? []).length, 1)
  assert.match(code, /Lire ce dossier\{selectedLotIds\.length > 1/)
  assert.match(code, /disabled=\{isAnalyzing \|\| isSuccess \|\| !peutLancer\(selectedIds\)\}/)
  assert.match(code, /cout=\{libelleUnites\(1\)\}/)
  assert.match(code, /cout=\{libelleUnites\(lots\.length\)\}/)
  assert.match(code, /<SectionEtape titre="Dans vos métiers"/)
  assert.match(code, /autres\.some\(\(l\) => selectedIds\.has\(l\.id\)\)/, 'un lot choisi parmi les autres n’est jamais caché')
  assert.doesNotMatch(code, /€|euros?\b/)
  assert.match(code, /<ActionsBarreTel>/)
})

test('la carte d’un lot : case visible de 44 px, numéro, désignation, métiers reconnus, pièces du lot avec « Voir », 1 unité, état en petit', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /h-11 w-11 shrink-0 items-center justify-center/, 'case à cocher visible dans une cible de 44 px')
  assert.match(code, /LOT \{lotNum\}/)
  assert.match(code, /Métiers? reconnus?/)
  assert.match(code, /pièces lues' : 'pièce lue'/)
  assert.match(code, /\{voirPieces \? 'Masquer' : 'Voir'\}/)
  assert.match(code, /<EtatElement\s+etat=\{aVerifier \? 'a-verifier' : 'pret'\}/)
  assert.match(code, /<BoutonSecondaire libelle="Retour"/)
  assert.doesNotMatch(code, /AiTipsBlock|Vérifiez que tous les lots/, 'plus de bandeau qui double « Ajouter un lot »')
  assert.match(code, /Un lot du dossier manque à la liste \? Ajoutez-le à la main/)
})
