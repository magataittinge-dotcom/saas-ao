// Recette du 4/11 — « À renseigner » est ambre (COULEURS.md : informations à renseigner = à surveiller) partout dans
// Mon entreprise, jamais en bleu d'accent ; la bulle « Moyens » porte son titre, sa valeur se lit dessous.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'
import { construireBulles } from '@/lib/entreprise/synthese'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'

test('« À renseigner » n\'est jamais en bleu d\'accent dans Mon entreprise', () => {
  const fichiers = [
    'src/components/entreprise/SceneVisage.tsx', 'src/components/entreprise/champs.tsx',
    'src/components/entreprise/FormCertifications.tsx', 'src/components/entreprise/RubriquesEntreprise.tsx',
  ]
  for (const f of fichiers) {
    const code = sansCommentaires(lire(f))
    assert.doesNotMatch(code, /text-accent-text[^\n]*(A_RENSEIGNER|À renseigner)/, f)
    assert.doesNotMatch(code, /(A_RENSEIGNER|À renseigner)[^\n]*text-accent-text/, f)
  }
  assert.match(sansCommentaires(lire('src/components/entreprise/SceneVisage.tsx')), /A_RENSEIGNER[^\n]*text-ambre-ink/)
  assert.match(sansCommentaires(lire('src/components/entreprise/champs.tsx')), /text-ambre-ink">\{A_RENSEIGNER\}/)
  assert.match(sansCommentaires(lire('src/components/entreprise/FormCertifications.tsx')), /text-ambre-ink">À renseigner/)
})

test('la bulle « Moyens » : titre « Moyens », valeur en phrase dessous (« Échafaudage »), sans « Moyens : »', () => {
  const donnees = { organisation: null, profil: { materiel_liste: [{ designation: 'Échafaudage de façade', quantite: 1, unite: null }] }, equipe: [], references: [], documents: [] } as unknown as DonneesEntreprise
  const bulle = construireBulles(donnees).find((b) => b.id === 'moyens')!
  assert.equal(bulle.libelle, 'Moyens')
  assert.match(bulle.valeur, /^É/)
  assert.doesNotMatch(bulle.valeur, /Moyens\s*:/)
})
