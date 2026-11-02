// R23 — l'écran de préparation du mémoire compte le profil comme Mon entreprise : les 34 informations indispensables.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RUBRIQUES, avancement, avancementTotal, libelleAvancement, type DonneesEntreprise } from '@/lib/entreprise/avancement'
import { lire, sansCommentaires } from './outils/sources'

test('le total est la somme des trois rubriques de Mon entreprise (34 indispensables)', () => {
  const vide: DonneesEntreprise = { organisation: {}, profil: {}, equipe: [], references: [], documents: [], qualifications: [] }
  assert.deepEqual(avancementTotal(vide), { rempli: 0, total: 34 })
  const d: DonneesEntreprise = { ...vide, organisation: { name: 'Entreprise Test', siret: '00000000000000' }, profil: { gerant_nom: 'A. Exemple' } }
  const somme = RUBRIQUES.reduce((n, r) => n + avancement(d, r.id).rempli, 0)
  assert.equal(avancementTotal(d).rempli, somme)
  assert.equal(avancementTotal(d).rempli, 3)
  assert.equal(libelleAvancement(avancementTotal(d)), '3 informations sur 34')
})

test('FormulaireMemoire lit le même compte que Mon entreprise, plus l’ancien « filled/total » de 18', () => {
  const code = sansCommentaires(lire('src/components/project/FormulaireMemoire.tsx'))
  assert.match(code, /useDonneesEntreprise\(\)/)
  assert.match(code, /avancementTotal\(/)
  assert.doesNotMatch(code, /stats\.filled|stats\.total/)
})
