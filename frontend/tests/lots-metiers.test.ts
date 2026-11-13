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
  assert.match(code, /\{aOuvrir \? 'Ouvrir ce lot' : libelleBoutonLire\(nbChoisis, lots\.length\)\}/)
  assert.match(code, /const lectureBloquee = isAnalyzing \|\| isSuccess \|\| !peutLancer\(selectedIds\)/)
  assert.match(code, /<Bouton variante="principal" onClick=\{handleLaunch\} disabled=\{lectureBloquee\}>/)
  // COR-B1 : l'état « Analysé » se dessine (icône et mot) à la place du coût
  assert.match(code, /analyse=\{project\.lots_analyses\?\.includes\(lot\.id\)\}/, 'un lot déjà lu ne coûte plus rien à rouvrir (E2E-2)')
  assert.match(code, /\{analyse \? \(\s*<span data-etat="analyse"[\s\S]*?Analysé\s*<\/span>\s*\) : cout &&/)
  assert.match(code, /cout=\{libelleUnites\(lots\.length\)\}/)
  assert.match(code, /<SectionEtape titre="Dans vos métiers"/)
  assert.match(code, /autres\.some\(\(l\) => selectedIds\.has\(l\.id\)\)/, 'un lot choisi parmi les autres n’est jamais caché')
  assert.doesNotMatch(code, /€|euros?\b/)
  assert.match(code, /<ActionsBarreTel>\{actionLire\}<\/ActionsBarreTel>/, 'au téléphone, le même bouton est dans la barre du bas')
})

test('la carte d’un lot : case visible de 44 px, numéro, désignation, métiers reconnus, pièces du lot avec « Voir », 1 unité, état en petit', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /grid size-11 shrink-0 place-items-center/, 'case à cocher visible dans une cible de 44 px')
  assert.match(code, />Lot \{lotNum\}</, 'le numéro en casse de phrase et en chiffres tabulaires, plus « LOT 01 » en chasse fixe')
  assert.doesNotMatch(code, /LOT \{lotNum\}/)
  assert.match(code, /Métiers? reconnus?/)
  assert.match(code, /pièces lues' : 'pièce lue'/)
  assert.match(code, /\{voirPieces \? 'Masquer' : 'Voir'\}/)
  // FIN-B1 : une liste ne marque que l'exception ; plus de « Prêt » ni de « Source : … » sur chaque lot
  assert.doesNotMatch(code, /<EtatElement|'pret'/)
  assert.match(code, /\{aVerifier && \(\s*<span data-etat="a-verifier"/)
  assert.doesNotMatch(code, /libelle="Retour"/, 'FIN-B1 : la barre du bas ne porte que l’action de l’étape (au téléphone) ; le fil des étapes ramène au dépôt')
  assert.doesNotMatch(code, /AiTipsBlock|Vérifiez que tous les lots/, 'plus de bandeau qui double « Ajouter un lot »')
  assert.match(code, /Ajouter un lot à la main/)
})
