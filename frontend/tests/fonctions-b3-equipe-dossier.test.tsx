// B3 — « Votre équipe face au dossier » (GET /projects/{id}/equipe) : les habilitations et qualifications que le dossier
// cite, en face de celles du profil : « Dans votre profil » ou « À confirmer », chaque ligne avec ses sources.
// Un rapprochement de mots, jamais un jugement : aucune règle, aucun sigle défini sans source vérifiée.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ListeEquipeDossier } from '@/components/project/EquipeDossier'
import { gesteEquipe, phraseEquipe, sourceEquipe, type ReponseEquipe } from '@/lib/equipeDossier'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const DONNEES: ReponseEquipe = {
  dans_profil: 1, a_confirmer: 1,
  lignes: [
    { cle: 'sst', libelle: 'Sauveteur secouriste du travail', sigle: 'SST', statut: 'dans_profil', etat: 'Dans votre profil',
      profil: '3 personnes déclarées (SST)', detail: null, codes: [],
      sources: [{ type: 'exigence', id: 'x1', document: 'CCTP', page: 4, extrait: 'Un sauveteur secouriste est présent sur le chantier (inventé).' }],
      lien: '/company?rubrique=moyens' },
    { cle: 'qualibat', libelle: 'Qualibat', sigle: null, statut: 'a_confirmer', etat: 'À confirmer',
      profil: null, detail: 'Le dossier cite 7131 ; votre profil indique : Qualibat 2111.', codes: ['7131'],
      sources: [
        { type: 'exigence', id: 'x2', document: 'RC', page: 19, extrait: 'Qualification Qualibat 7131 ou équivalent (inventé).' },
        { type: 'exigence', id: 'x3', document: 'CCTP', page: 1, extrait: null },
      ],
      lien: '/company?rubrique=certifications' },
  ],
}
const rendre = (d: ReponseEquipe) => renderToStaticMarkup(<MemoryRouter><ListeEquipeDossier donnees={d} onSource={RIEN} /></MemoryRouter>)

test('la phrase de tête dit les faits, sans juger', () => {
  assert.equal(phraseEquipe({ dans_profil: 1, a_confirmer: 1 }), '2 habilitations ou qualifications citées par le dossier\u00a0: 1 dans votre profil, 1 à confirmer.')
  assert.equal(phraseEquipe({ dans_profil: 2, a_confirmer: 0 }), 'Les 2 habilitations ou qualifications citées par le dossier sont dans votre profil.')
  assert.equal(phraseEquipe({ dans_profil: 0, a_confirmer: 1 }), '1 habilitation ou qualification citée par le dossier, à confirmer dans votre profil.')
})

test('la source d’une ligne : la pièce et la page ; le geste mène à la bonne rubrique de Mon entreprise', () => {
  assert.equal(sourceEquipe(DONNEES.lignes[1].sources[0]), 'RC · page 19')
  assert.equal(sourceEquipe({ type: 'exigence', id: 'z', document: '', page: null, extrait: null }), null)
  assert.deepEqual(gesteEquipe(DONNEES.lignes[0]), { libelle: 'Voir le profil', vers: '/company?rubrique=moyens' })
  assert.deepEqual(gesteEquipe(DONNEES.lignes[1]), { libelle: 'Compléter le profil', vers: '/company?rubrique=certifications' })
  // un lien qui ne mène pas à Mon entreprise ne se suit pas
  assert.equal(gesteEquipe({ ...DONNEES.lignes[1], lien: 'https://exemple.invalid' }), null)
})

test('chaque ligne : le nom, l’état en mots, ce que dit le profil, le détail, ses sources', () => {
  const html = rendre(DONNEES)
  assert.match(html, /Votre équipe face au dossier/)
  assert.match(html, /Sauveteur secouriste du travail/)
  assert.match(html, /Dans votre profil/)
  assert.match(html, /3 personnes déclarées \(SST\)/)
  assert.match(html, /À confirmer/)
  assert.match(html, /Le dossier cite 7131/)
  assert.match(html, /RC · page 19/)
  assert.match(html, /CCTP · page 1/)
  assert.equal((html.match(/Voir dans le dossier/g) ?? []).length, 3, 'une ouverture par source')
  assert.match(html, /href="\/company\?rubrique=certifications"/)
  assert.match(html, /rapprochement de mots/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('le dossier ne cite aucune habilitation : rien (pas de section vide)', () => {
  assert.equal(rendre({ lignes: [], dans_profil: 0, a_confirmer: 0 }), '')
})

test('l’écran Pièces appelle la section en une ligne ; aucune définition de sigle sans source vérifiée', () => {
  assert.match(sansCommentaires(lire('src/routes/project/StepVerification.tsx')), /<EquipeDossier projectId=\{project\.id\} onSource=\{\(id, titre\) => setSelection\(\{ type: 'exigence', id, titre \}\)\} \/>/)
  assert.match(sansCommentaires(lire('src/lib/equipeDossier.ts')), /\/equipe`/)
  const lexique = lire('src/lib/lexique.ts')
  for (const sigle of ['CACES', 'SST', 'AIPR', 'RGE']) assert.doesNotMatch(lexique, new RegExp(`sigle: '${sigle}'`), `${sigle} : pas de définition sans source vérifiée`)
})
