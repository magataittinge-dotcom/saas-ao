// Jury, tour 3 (13/11/2026), lot b1 — les bloquants : coupures à 390 px, carte hors gouttière, case dessinée en 44 px,
// champ de renommage sans le nom du lot, dialogue de quota sans issue.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { LotCard, intituleRenomme } from '@/routes/project/StepLotSelection'
import { phraseDocumentsAnalyses } from '@/lib/analyseLibelles'
import { TitreDepot, ZoneDepot, SUITE_DEPOT } from '@/components/depot/ZoneDepot'
import { lire, sansCommentaires } from './outils/sources'

const rien = () => undefined
const css = lire('src/styles/pieces.css')

test('Décider à 390 px : le poids tient à son signe, « sur 93 » ne se coupe pas, le lien de source a sa ligne', () => {
  assert.match(phraseDocumentsAnalyses({ analyses: 35, informations: 42, autresLots: 16 }).principale, /sur 93$/)
  assert.match(sansCommentaires(lire('src/lib/carteAO.ts')), /\$\{texteNet\(c\.nom\)\}\\u00a0\$\{c\.poids\}\\u00a0%/)
  const lien = css.match(/\.carte-ao-30s__valeur \.carte-ao-30s__source \{[^}]*\}/)?.[0] ?? ''
  assert.match(lien, /display: flex/)
  assert.doesNotMatch(lien, /underline|margin-left|color:/, 'le lien du système, au bord du texte, sans soulignement ni teinte à part')
})

test('Lots : « tout le dossier » tient dans la carte, « Lot 0x » sans chiffres à chasse fixe, colonnes fixes, « Analysé » dessiné', () => {
  const tout = renderToStaticMarkup(<LotCard lot={{ id: 'all', nom: 'Analyser l’ensemble du dossier (tous les lots)' }} selected={false} onSelect={rien} cout="13 unités" pieces={[{ file_name: 'a.pdf' }, { file_name: 'b.pdf' }]} />)
  assert.doesNotMatch(tout, /dans le dossier</)
  assert.match(tout, /max-sm:flex-wrap/)
  assert.match(tout, /pr-14/, 'la place du menu est réservée sur toutes les rangées : la colonne de droite ne bouge pas')
  const lot = renderToStaticMarkup(<LotCard lot={{ id: 'lot1', nom: 'Lot 01 — Charpente inventée' }} selected={false} onSelect={rien} analyse cout="1 unité" pieces={[{ file_name: 'a.pdf' }]} />)
  assert.match(lot, /<span class="shrink-0 font-medium text-fg-2 sm:w-14">Lot 01<\/span>/)
  assert.doesNotMatch(lot, /chiffres/)
  assert.match(lot, /data-etat="analyse"[^>]*>.*Analysé/)
  assert.doesNotMatch(lot, /1 unité/)
  assert.match(lot, /max-sm:flex-col/, 'au téléphone : « Lot 0x » au-dessus, l’intitulé dessous')
})

test('renommer un lot : le champ porte l’intitulé (plus un libellé d’aide), le numéro reste devant', () => {
  assert.equal(intituleRenomme('Lot 01 — Charpente inventée', 'Gros œuvre'), 'Lot 01 — Gros œuvre')
  assert.equal(intituleRenomme('Lot 5', 'Bardage'), 'Lot 5 — Bardage')
  assert.equal(intituleRenomme('Marché unique', 'Toiture'), 'Toiture')
  assert.equal(intituleRenomme('Lot 01 — Charpente inventée', 'Lot 2 — Autre'), 'Lot 2 — Autre')
  const code = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.doesNotMatch(code, /l’intitulé du lot`/)
  assert.match(code, /const intituleActuel = isGeneric \? '' : lotNum \? lotTitle : displayedLabel/)
  assert.match(code, /setDraft\(intituleActuel\)/)
  assert.match(code, /inputRef\.current\?\.select\(\)/)
})

test('Pièces à 390 px : la case du système garde son dessin, « Déposer » tient dans la gouttière', () => {
  assert.match(css, /\.page-ao button:not\(\.cible-libre, \[role='checkbox'\], \[role='radio'\], \[role='switch'\]\) \{ min-width: 44px; \}/)
  assert.match(css, /\):not\(\.cible-libre, \[role='checkbox'\], \[role='radio'\], \[role='switch'\]\) \{\s*min-height: 44px;/)
  const formulaires = sansCommentaires(lire('src/components/project/CandidatureSectionTemplates.tsx'))
  assert.match(formulaires, /\{isPresent \? 'Remplacer' : 'Déposer'\}/)
  assert.match(formulaires, /aria-label=\{isPresent \? `Remplacer\\u00a0: \$\{label\}` : `Déposer le formulaire\\u00a0: \$\{label\}`\}/)
})

test('zone de dépôt : « Choisissez » au téléphone, « Glissez ici » à l’ordinateur ; les deux têtes de colonne partent de la même ligne', () => {
  const html = renderToStaticMarkup(<ZoneDepot racine={{}} entree={null} survol={false} titre={<TitreDepot />} suite={SUITE_DEPOT} />)
  assert.match(html, /<span class="max-sm:hidden">Glissez ici le dossier de l’acheteur<\/span><span class="sm:hidden">Choisissez le dossier de l’acheteur<\/span>/)
  assert.match(html, /class="grid p-8 max-sm:p-5 content-start"/)
  const seule = renderToStaticMarkup(<ZoneDepot racine={{}} entree={null} survol={false} titre="Titre" />)
  assert.match(seule, /content-center/)
})
