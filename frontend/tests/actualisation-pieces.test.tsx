// R18 — « Actualiser » (régénère la liste des pièces sans IA) dit ce qu'il a fait : en cours, à jour, ou le changement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageActualisation } from '@/lib/actualisation'
import { lire, sansCommentaires } from './outils/sources'

test('messageActualisation : en cours, rien de changé, changement, échec ; rien tant qu’on n’a pas cliqué', () => {
  assert.equal(messageActualisation(null), '')
  assert.equal(messageActualisation({ etat: 'en_cours' }), 'Actualisation…')
  assert.equal(messageActualisation({ etat: 'fait', avant: 19, apres: 19 }), 'Liste à jour : 19 pièces, rien n’a changé')
  assert.equal(messageActualisation({ etat: 'fait', avant: 1, apres: 1 }), 'Liste à jour : 1 pièce, rien n’a changé')
  assert.equal(messageActualisation({ etat: 'fait', avant: 34, apres: 19 }), 'Liste actualisée : 19 pièces au lieu de 34')
  assert.equal(messageActualisation({ etat: 'echec' }), 'L’actualisation n’a pas abouti. Réessayez dans un instant.')
  for (const e of [{ etat: 'fait', avant: 3, apres: 2 }, { etat: 'echec' }] as const) assert.doesNotMatch(messageActualisation(e), /manquant|incomplet|absent|!/i)
})

test('l’écran des pièces affiche ce retour sous « Actualiser »', () => {
  const src = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.match(src, /messageActualisation\(actualisation\)/)
  // le retour est un Message du système (annoncé : role status ou alert), posé une fois sous l'en-tête ; plus de roue qui tourne
  assert.match(src, /<Message ton=\{actualisation\?\.etat === 'echec' \? 'erreur' : 'succes'\}/)
  assert.match(src, /enCours=\{actualisation\?\.etat === 'en_cours'\} libelleEnCours="Actualisation…"/)
  assert.doesNotMatch(src, /animate-spin/)
})

// ── Mission finale (10/11) : l'écran Pièces refait ──
import { renderToStaticMarkup } from 'react-dom/server'
import { BandeResume } from '@/components/etape'
import { cartesPieces, phrasePiecesAutres } from '@/lib/resumePieces'

test('Pièces : « Réunir les pièces », l’erreur de chargement dit son erreur avant l’état « pas encore lu », rien de natif', () => {
  const src = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.match(src, /titre="Réunir les pièces"/)
  assert.match(src, /requetePieces\.isError && requetePieces\.data === undefined\) return \(\s*<GabaritEtape[^>]*>\s*<EtatErreur\s+titre="Les pièces n’ont pas pu se charger"/)
  assert.ok(src.indexOf('<EtatErreur') < src.indexOf('Les pièces à réunir apparaîtront ici'), 'chargement → erreur → vide → contenu')
  assert.doesNotMatch(src, /<button\b|<input\b|<select\b|style=\{\{ (?!width)|Loader2|glass-card|Étape Mémoire|✓|⚠️/)
  assert.match(src, /À l’étape Rédiger/)
})

test('Pièces : « Prêtes : Aucune » (jamais « Aucun ») ; la pièce facultative se nomme, le total est celui des pièces demandées au dépôt', () => {
  const demandee = { document_group: 'fournir', status: 'missing', obligation: 'obligatoire' } as never
  const facultative = { document_group: 'fournir', status: 'missing', obligation: 'facultatif' } as never
  const cartes = cartesPieces([demandee, demandee, facultative], null)
  assert.equal(cartes[0].rien, 'Aucune')
  assert.ok(cartes.every((c) => c.rien === 'Aucune'))
  assert.match(cartes[0].detail ?? '', /^sur 2 pièces demandées au dépôt, plus 1 facultative ou pour l’attribution$/)
  assert.equal(phrasePiecesAutres({ autres: 0 }), null)
  assert.equal(phrasePiecesAutres({ autres: 2 }), '2 facultatives ou pour l’attribution')
  const html = renderToStaticMarkup(<BandeResume cartes={cartes} />)
  assert.ok(html.includes('Aucune') && !/>Aucun</.test(html))
})

test('Pièces : « Choisir une pièce du coffre-fort » est le dialogue du système ; l’échec est une phrase, jamais le message brut', () => {
  const src = sansCommentaires(lire('src/components/project/VaultPickerModal.tsx'))
  assert.match(src, /<Dialogue\s+ouvert/)
  assert.doesNotMatch(src, /createPortal|err\.message|animate-spin|<button\b|<input\b|style=\{\{|uppercase|edge-cta/)
  assert.match(src, /messageErreur\(err, 'La pièce n’a pas pu être rattachée/)
  // le coffre-fort qui ne répond pas dit son erreur, avant « ne contient pas encore de pièce »
  assert.ok(src.indexOf('<EtatErreur') < src.indexOf('ne contient pas encore de pièce'))
  for (const f of ['src/components/project/CandidatureSectionTemplates.tsx', 'src/components/project/NonConcerne.tsx', 'src/components/project/CandidatureSectionVault.tsx']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /err\.message|animate-spin|<button\b|<input\b|title=|style=\{\{/, f)
  }
})
