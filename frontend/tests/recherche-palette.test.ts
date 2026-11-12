// Recette finale, parcours Ctrl K (banc) : la palette cherchait en « sous-suite » de lettres sur une valeur qui contient
// l'identifiant de l'AO (lettres a à f) et l'adresse de l'acheteur. « coffre » mettait un AO en tête (Entrée ouvrait son
// Export au lieu du Coffre-fort), « nouvel » aussi, et « nouvel appel » (le libellé du bouton) ne trouvait rien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scorePalette } from '../src/lib/recherchePalette'

// Noms et adresses inventés.
const AO = 'Groupe scolaire des Tilleuls Commune de Valbrune — 12 place du Marché 99000 VALBRUNE Lot 05 — Revêtement de façade 372ba4d9-2ba9-47fe-b450-055abad62819'
const AO2 = 'Création d’un atelier de découpe Ardenne Communauté inventée 2730df2a-ed35-4539-acb1-1ff9023ab9af'

test('un mot qui n’est dans aucun mot de la valeur ne la retient pas (ni l’identifiant, ni une sous-suite de lettres)', () => {
  assert.equal(scorePalette(AO, 'coffre'), 0)
  assert.equal(scorePalette(AO2, 'nouvel'), 0)
  assert.equal(scorePalette(AO, 'b450'), 0)
})

test('les pages et l’action se trouvent par leur nom, sans accents ni capitales', () => {
  assert.ok(scorePalette('Coffre-fort', 'coffre') > 0)
  assert.ok(scorePalette('Nouvel AO nouvel appel d’offres déposer un dossier DCE', 'nouvel appel') > 0)
  assert.ok(scorePalette('Paramètres', 'parametres') > 0)
})

test('un AO se trouve par son nom, son acheteur ou son lot', () => {
  assert.ok(scorePalette(AO, 'valbrune') > 0)
  assert.ok(scorePalette(AO2, 'ardenne') > 0)
  assert.ok(scorePalette(AO, 'lot 05') > 0)
  assert.ok(scorePalette(AO, 'facade') > 0)
  assert.equal(scorePalette(AO2, 'lot 05'), 0)
})

test('le début d’un mot compte plus qu’un morceau au milieu ; recherche vide : tout reste', () => {
  assert.ok(scorePalette('Coffre-fort', 'cof') > scorePalette('Le décoffrage', 'cof'))
  assert.equal(scorePalette(AO, '   '), 1)
})
