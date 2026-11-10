// R6 — écran des lots : aucun choix par défaut quand l'AO a plusieurs lots,
// « Lancer l'analyse » désactivé tant qu'aucun choix n'est fait.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { choixParDefaut, basculerLot, peutLancer } from '@/lib/choixLots'
import { lire, sansCommentaires } from './outils/sources'

test('plusieurs lots : aucun lot choisi par défaut, lancement impossible', () => {
  const choix = choixParDefaut(null, 13)
  assert.equal(choix.size, 0)
  assert.equal(peutLancer(choix), false)
})

test('lot unique ou marché sans lot : comportement inchangé (l\'ensemble est pris)', () => {
  assert.deepEqual([...choixParDefaut(null, 1)], ['all'])
  assert.deepEqual([...choixParDefaut(null, 0)], ['all'])
  assert.equal(peutLancer(choixParDefaut(null, 1)), true)
})

test('un lot déjà retenu pour ce projet reste retenu', () => {
  assert.deepEqual([...choixParDefaut('5', 13)], ['5'])
})

test('« tout analyser » est un choix explicite ; en retirant le dernier lot on revient à aucun choix', () => {
  let choix = basculerLot(choixParDefaut(null, 13), 'all', 13)
  assert.deepEqual([...choix], ['all'])
  assert.equal(peutLancer(choix), true)
  choix = basculerLot(choix, '5', 13)               // choisir un lot retire « tout »
  assert.deepEqual([...choix], ['5'])
  choix = basculerLot(choix, '7', 13)
  assert.deepEqual([...choix].sort(), ['5', '7'])
  choix = basculerLot(basculerLot(choix, '5', 13), '7', 13)
  assert.equal(choix.size, 0)
  assert.equal(peutLancer(choix), false)
})

test('lot unique : retirer le lot revient à l\'ensemble, comme avant', () => {
  const choix = basculerLot(new Set(['1']), '1', 1)
  assert.deepEqual([...choix], ['all'])
})

test('l\'écran branche le choix : bouton désactivé sans choix, pied de page honnête', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /const lectureBloquee = isAnalyzing \|\| isSuccess \|\| !peutLancer\(selectedIds\)/)
  assert.match(code, /disabled=\{lectureBloquee\}/)
  assert.ok(!code.includes("new Set([project.selected_lot ?? 'all'])"))
  assert.ok(code.includes('Aucun lot choisi'))
})

// R8 — la source d'un lot est une phrase de patron ; la ligne « nom de pièce » ne revient pas sous le titre.
import { etiquettesSourceLot } from '@/lib/lotsSource'

test('R8 : les sources d’un lot sont dites en phrases, sans doublon, jamais en capitales isolées', () => {
  assert.deepEqual(etiquettesSourceLot(['rc_table', 'rc_text', 'filename']), ['Vu dans le règlement', 'Vu dans le nom d’une pièce'])
  assert.deepEqual(etiquettesSourceLot(['excel']), ['Vu dans le tableau des prix'])
  assert.deepEqual(etiquettesSourceLot(['ia_fallback']), [])
  assert.deepEqual(etiquettesSourceLot(undefined), [])
  assert.deepEqual(etiquettesSourceLot(['inconnue']), [])
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.doesNotMatch(code, /uppercase tracking-wide/)
  assert.doesNotMatch(code, /RÈGLEMENT|FICHIER|TABLEAU DES PRIX/)
})

test('R8 : sous le titre d’un lot, plus de ligne « nom de pièce » (description_long)', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.doesNotMatch(code, /description_long/)
})

// R9 — « 13 lots détectés » : une ligne sobre dit combien d'autres lots cités ne sont pas proposés, et pourquoi.
import { phraseLotsEcartes } from '@/lib/lotsSource'

test('R9 : la ligne donne le nombre et la raison, jamais un nom de lot', () => {
  assert.equal(phraseLotsEcartes({ hors_liste: 3, sans_intitule: 0 }), '3 autres lots cités dans le dossier ne figurent pas dans la liste du règlement : ils ne sont pas proposés.')
  assert.equal(phraseLotsEcartes({ hors_liste: 1, sans_intitule: 0 }), '1 autre lot cité dans le dossier ne figure pas dans la liste du règlement : il n’est pas proposé.')
  assert.equal(phraseLotsEcartes({ hors_liste: 0, sans_intitule: 2 }), '2 autres lots cités sans intitulé ne sont pas proposés.')
  assert.match(phraseLotsEcartes({ hors_liste: 2, sans_intitule: 1 })!, /^2 autres lots .* 1 autre lot cité sans intitulé/)
  for (const rien of [null, undefined, {}, { hors_liste: 0, sans_intitule: 0 }]) assert.equal(phraseLotsEcartes(rien), null)
})

test('R9 : l’écran affiche la ligne sous le compte des lots', () => {
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(code, /phraseLotsEcartes\(lotsData\?\.ecartes\)/)
  assert.match(code, /data-lots-ecartes/)
})
