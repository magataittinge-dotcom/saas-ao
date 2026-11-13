// B4 — dans « Relire mon mémoire » : chaque exigence de contenu du règlement et le paragraphe qui la traite
// (GET /projects/{id}/memoire/relecture, bloc `exigences`), sinon « À couvrir ». Lien par les ancres du mémoire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ExigencesMemoire from '@/components/memoire/ExigencesMemoire'
import { phraseExigences, rangerExigences, type BlocExigences } from '@/lib/exigencesMemoire'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const lien = (statut: 'traitee' | 'a_couvrir', ancre: string | null, section: string | null, extrait: string | null) => ({
  statut, libelle: statut === 'traitee' ? 'Traitée' : 'À couvrir', ancre, section, paragraphe: extrait ? 2 : null, extrait,
})
const BLOC: BlocExigences = {
  traitees: 1, a_couvrir: 1,
  lignes: [
    { id: 'e1', texte: 'Décrire les moyens humains affectés au chantier (inventé)', source: { type: 'exigence', id: 'e1', document: 'RC', page: 7 },
      ...lien('traitee', 'sec-moyens_humains', 'Partie B · 1. Moyens humains', 'Une équipe de quatre compagnons, conduite par un chef de chantier.'), elements: [] },
    { id: 'e2', texte: 'Le mémoire présente : le planning, la gestion des déchets (inventé)', source: { type: 'exigence', id: 'e2', document: 'RC', page: 8 },
      ...lien('a_couvrir', null, null, null),
      elements: [
        { texte: 'le planning', ...lien('traitee', 'sec-planning', 'Partie C · 2. Planning', 'Le planning tient en douze semaines.') },
        { texte: 'la gestion des déchets', ...lien('a_couvrir', null, null, null) },
      ] },
  ],
}

test('la phrase de tête : ce qui est traité, ce qui reste à couvrir', () => {
  assert.equal(phraseExigences({ traitees: 4, a_couvrir: 1 }), '5 exigences de contenu du règlement : 4 traitées, 1 à couvrir.')
  assert.equal(phraseExigences({ traitees: 5, a_couvrir: 0 }), 'Les 5 exigences de contenu du règlement sont traitées dans le mémoire.')
  assert.equal(phraseExigences({ traitees: 1, a_couvrir: 0 }), 'L’exigence de contenu du règlement est traitée dans le mémoire.')
  assert.equal(phraseExigences({ traitees: 0, a_couvrir: 1 }), '1 exigence de contenu du règlement : 1 à couvrir.')
})

test('« À couvrir » d’abord, puis ce qui est traité, sans changer l’ordre du règlement', () => {
  assert.deepEqual(rangerExigences(BLOC.lignes).map((l) => l.id), ['e2', 'e1'])
})

test('chaque exigence : son texte, son état en mots, le passage qui la traite, sa source', () => {
  const html = renderToStaticMarkup(<ExigencesMemoire exigences={BLOC} onAller={RIEN} onSource={RIEN} />)
  assert.match(html, /Ce que le règlement demande dans le mémoire/)
  assert.match(html, /Traitée/)
  assert.match(html, /À couvrir/)
  assert.match(html, /Aller à : Partie B · 1\. Moyens humains/)
  assert.match(html, /« Une équipe de quatre compagnons, conduite par un chef de chantier\. »/)
  // une exigence qui énumère : chaque élément a son état
  assert.match(html, /le planning/)
  assert.match(html, /la gestion des déchets/)
  assert.match(html, /Aller à : Partie C · 2\. Planning/)
  assert.equal((html.match(/Source : RC · page/g) ?? []).length, 2, 'une source par exigence')
  assert.equal((html.match(/Voir dans le dossier/g) ?? []).length, 2)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('aucune exigence de contenu relevée : rien (pas de bloc vide)', () => {
  assert.equal(renderToStaticMarkup(<ExigencesMemoire exigences={{ lignes: [], traitees: 0, a_couvrir: 0 }} onAller={RIEN} onSource={RIEN} />), '')
  assert.equal(renderToStaticMarkup(<ExigencesMemoire exigences={undefined} onAller={RIEN} onSource={RIEN} />), '')
})

test('le tiroir de la relecture appelle le bloc en une ligne et mène au passage par les ancres du mémoire', () => {
  const src = sansCommentaires(lire('src/components/memoire/RelectureMemoire.tsx'))
  assert.match(src, /<ExigencesMemoire exigences=\{data\.exigences\} onAller=\{\(ancre\) => aller\(\{ ancre \}\)\} onSource=\{ouvrirSource\} \/>/)
  assert.match(src, /allerALAncre\(l\.ancre\)/)
})
