// Recette du 4/11, puis refonte du 10/11 — plus de vingt « À renseigner » ambre sous les champs : l'ambre ne voulait plus rien
// dire. Un champ vide est un champ à remplir, sans pastille ni mention ; l'ambre est gardé pour ce qui est à surveiller
// (pièce à renouveler, refus d'un fichier). La bulle « Moyens » (lib, plus affichée) garde son titre et sa valeur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { construireBulles } from '@/lib/entreprise/synthese'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'

test('« À renseigner » ne s\'écrit plus sous les champs de Mon entreprise : ni en ambre, ni en bleu d\'accent', () => {
  const fichiers = [
    'src/components/entreprise/SceneVisage.tsx', 'src/components/entreprise/champs.tsx',
    'src/components/entreprise/FormCertifications.tsx', 'src/components/entreprise/RubriquesEntreprise.tsx',
    'src/components/entreprise/FormIdentite.tsx', 'src/components/entreprise/FormMoyens.tsx', 'src/components/entreprise/ChampSiret.tsx',
    'src/components/entreprise/ListesMoyens.tsx', 'src/components/entreprise/EditeursCertifications.tsx',
  ]
  for (const f of fichiers) {
    const code = sansCommentaires(lire(f))
    assert.doesNotMatch(code, /A_RENSEIGNER|À renseigner/, f)
  }
  // l'ambre reste là où il dit quelque chose : une pièce à renouveler
  assert.match(sansCommentaires(lire('src/components/entreprise/FormCertifications.tsx')), /a_renouveler: 'ambre'/)
})

test('la bulle « Moyens » : titre « Moyens », valeur en phrase dessous (« Échafaudage »), sans « Moyens : »', () => {
  const donnees = { organisation: null, profil: { materiel_liste: [{ designation: 'Échafaudage de façade', quantite: 1, unite: null }] }, equipe: [], references: [], documents: [] } as unknown as DonneesEntreprise
  const bulle = construireBulles(donnees).find((b) => b.id === 'moyens')!
  assert.equal(bulle.libelle, 'Moyens')
  assert.match(bulle.valeur, /^É/)
  assert.doesNotMatch(bulle.valeur, /Moyens\s*:/)
})
