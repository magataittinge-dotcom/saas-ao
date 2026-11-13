// B6 — la prochaine information à donner sur Mon entreprise : la première information indispensable encore à
// renseigner, dans l'ordre de la liste (INFORMATIONS-ENTREPRISE.md), et le lien qui ouvre le bon champ.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INFORMATIONS, prochaineInformation } from '@/lib/entreprise/avancement'
import { CHAMPS, CHAMP_DE_INFORMATION, champDepuisRecherche, lienInformation } from '@/lib/entreprise/champsFiche'
import { voixSynorix } from '@/lib/entreprise/voix'
import { lire, sansCommentaires } from './outils/sources'

test('profil vide : la première de la liste (le nom de l’entreprise), et son champ', () => {
  const p = prochaineInformation({})
  assert.deepEqual([p?.id, p?.libelle, p?.rubrique], ['I01', 'Nom de l’entreprise', 'identite'])
  assert.equal(lienInformation(p!), '/company?rubrique=identite&champ=raison_sociale')
})

test('l’ordre est celui de la liste : ce qui est renseigné est passé, la suivante est proposée', () => {
  const d = { organisation: { name: 'Entreprise inventée', siret: '00000000000000', forme_juridique: 'SARL' } }
  const p = prochaineInformation(d)
  assert.equal(p?.id, 'I08')
  assert.equal(lienInformation(p!), '/company?rubrique=identite&champ=adresse_siege')
})

test('tout est renseigné : rien à proposer', () => {
  const tout = INFORMATIONS.map((i) => ({ ...i, rempli: () => true }))
  assert.equal(prochaineInformation({}, tout), null)
})

test('chaque information indispensable mène à un champ connu de sa rubrique, ou à sa rubrique seule', () => {
  for (const i of INFORMATIONS.filter((x) => x.niveau === 'indispensable')) {
    const lien = lienInformation(i)
    const champ = CHAMP_DE_INFORMATION[i.id]
    if (champ) {
      assert.ok(CHAMPS[champ], `${i.id} → ${champ} : champ connu`)
      assert.equal(CHAMPS[champ].rubrique, i.rubrique, `${i.id} : le champ est dans la rubrique de l’information`)
      assert.equal(champDepuisRecherche(lien.slice(lien.indexOf('?'))), champ, `${i.id} : l’adresse est acceptée par la page`)
    } else {
      assert.equal(lien, `/company?rubrique=${i.rubrique}`)
    }
  }
  // au moins les trois quarts des informations ouvrent un champ précis
  const precises = INFORMATIONS.filter((i) => CHAMP_DE_INFORMATION[i.id]).length
  assert.ok(precises >= Math.ceil(INFORMATIONS.length * 0.75), `${precises} sur ${INFORMATIONS.length}`)
})

test('la phrase de Synorix porte le lien, et l’écran le suit', () => {
  assert.equal(voixSynorix({}).prochaine?.lien, '/company?rubrique=identite&champ=raison_sociale')
  assert.match(sansCommentaires(lire('src/components/entreprise/SceneVisage.tsx')), /onChoisir\(voix\.prochaine!\.rubrique, voix\.prochaine!\.lien\)/)
  assert.match(sansCommentaires(lire('src/routes/Company.tsx')), /if \(lien\) navigate\(lien, \{ replace: true \}\)/)
})
