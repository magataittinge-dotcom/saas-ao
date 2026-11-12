// Vague 1 — l'éditeur du mémoire : la barre d'outils en mots pose les signes à la place de l'utilisateur, sans jamais toucher
// aux titres qui découpent le mémoire (« # PARTIE… », « ## 1. Section » : lib/memoireMarkdown.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GESTES, appliquerGeste } from '@/lib/memoireEdition'
import { lire, sansCommentaires } from './outils/sources'

test('la barre d’outils est écrite en mots : Titre, Gras, Italique, Liste, Liste numérotée', () => {
  assert.deepEqual(GESTES.map((g) => g.libelle), ['Titre', 'Gras', 'Italique', 'Liste', 'Liste numérotée'])
})

test('Gras entoure la sélection et la garde sélectionnée ; un second appui retire les signes', () => {
  const s = appliquerGeste('gras', { texte: 'un mot important ici', debut: 7, fin: 16 })
  assert.equal(s.texte, 'un mot **important** ici')
  assert.equal(s.texte.slice(s.debut, s.fin), 'important')
  const retour = appliquerGeste('gras', s)
  assert.equal(retour.texte, 'un mot important ici')
})

test('sans sélection, Gras et Italique posent un mot d’exemple, sélectionné', () => {
  const g = appliquerGeste('gras', { texte: 'ab', debut: 1, fin: 1 })
  assert.equal(g.texte, 'a**texte en gras**b')
  assert.equal(g.texte.slice(g.debut, g.fin), 'texte en gras')
  assert.equal(appliquerGeste('italique', { texte: '', debut: 0, fin: 0 }).texte, '*texte en italique*')
})

test('Titre pose un « ### » sur la ligne (jamais « # » ni « ## », réservés au découpage) et se défait', () => {
  const s = appliquerGeste('titre', { texte: 'avant\nNotre méthode\naprès', debut: 8, fin: 8 })
  assert.equal(s.texte, 'avant\n### Notre méthode\naprès')
  assert.equal(appliquerGeste('titre', s).texte, 'avant\nNotre méthode\naprès')
})

test('Liste et Liste numérotée prennent toutes les lignes de la sélection, sauf les lignes vides', () => {
  const texte = 'tri\n\nbennes\nbordereaux'
  assert.equal(appliquerGeste('liste', { texte, debut: 0, fin: texte.length }).texte, '- tri\n\n- bennes\n- bordereaux')
  assert.equal(appliquerGeste('numeros', { texte, debut: 0, fin: texte.length }).texte, '1. tri\n\n2. bennes\n3. bordereaux')
  // une liste à puces devient numérotée sans doubler les signes
  assert.equal(appliquerGeste('numeros', { texte: '- a\n- b', debut: 0, fin: 7 }).texte, '1. a\n2. b')
})

test('les titres de partie et de section ne sont jamais touchés par la barre d’outils', () => {
  const texte = '# PARTIE A — PRÉSENTATION GÉNÉRALE\n\n## 1. Implantation géographique\n\nReims.'
  for (const geste of ['titre', 'liste', 'numeros'] as const) {
    const s = appliquerGeste(geste, { texte, debut: 0, fin: texte.length })
    assert.ok(s.texte.startsWith('# PARTIE A — PRÉSENTATION GÉNÉRALE\n\n## 1. Implantation géographique\n\n'), geste)
  }
})

test('l’éditeur : une surface d’écriture (serif, colonne de 72 caractères), « Modifications non enregistrées », aucune chasse fixe', () => {
  const code = sansCommentaires(lire('src/components/memoire/EditeurMemoire.tsx'))
  assert.match(code, /lecteur-memoire[^"]*text-lg/)
  assert.match(code, /72ch/)
  assert.match(code, /Modifications non enregistrées/)
  assert.doesNotMatch(code, /font-mono|createPortal|<textarea|<button/)
  assert.match(code, /role="toolbar"/)
})

test('la barre de réécriture annonce son plafond et passe par les composants du système', () => {
  const code = sansCommentaires(lire('src/components/project/RewritePassageBar.tsx'))
  for (const mot of ['Reformuler', 'Plus technique', 'Plus concis', 'Insister sur…']) assert.ok(code.includes(mot), mot)
  assert.match(code, /par jour au plus/)
  assert.doesNotMatch(code, /createPortal|<button|<input|animate-spin|style=\{\{/)
  assert.doesNotMatch(code, /par l’IA/)
})

test('Rédiger : une panne de lecture du mémoire n’est jamais « pas de mémoire » (le formulaire de rédaction ne revient pas)', () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  const iErreur = code.indexOf('requeteMemoire.isError')
  const iFormulaire = code.indexOf('if (!hasMemoire) {')
  assert.ok(iErreur > 0 && iFormulaire > iErreur, 'l’erreur est traitée avant le formulaire')
  // RESTES-4 — le formulaire ne revient qu'en l'absence de mémoire : plus d'état `showForm` (jamais mis à vrai).
  assert.doesNotMatch(code, /showForm/)
  assert.match(code, /<EtatErreur[\s\S]{0,200}Le mémoire n’a pas pu s’ouvrir/)
  assert.match(code, /Contrôles du texte|ControlesTexte/)
  assert.doesNotMatch(code, /Compagnon Synorix/)
})
