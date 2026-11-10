// Refonte, groupe A — le menu du compte et l'accueil ne montrent jamais le début de l'e-mail comme nom : prénom ou rien,
// raison sociale seulement quand le SIRET est vérifié, sinon « Mon entreprise ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialeDuPrenom, raisonSociale } from '@/lib/raisonSociale'
import { prenomAffichable } from '@/lib/prenom'
import { lire, sansCommentaires } from './outils/sources'

test('raison sociale : le nom de l\'organisation si le SIRET est vérifié, sinon « Mon entreprise »', () => {
  assert.equal(raisonSociale({ name: 'Façades Taittinger SARL', siret_verified: true }), 'Façades Taittinger SARL')
  assert.equal(raisonSociale({ name: 'maga.taittinge', siret_verified: false }), 'Mon entreprise')
  assert.equal(raisonSociale({ name: 'maga.taittinge' }), 'Mon entreprise')
  assert.equal(raisonSociale({ name: '  ', siret_verified: true }), 'Mon entreprise')
  assert.equal(raisonSociale({ name: 'x@y.fr', siret_verified: true }), 'Mon entreprise')
  assert.equal(raisonSociale(null), 'Mon entreprise')
  assert.equal(raisonSociale(undefined), 'Mon entreprise')
})

test('initiales : celles du prénom, sinon « — » ; jamais celles de l\'e-mail', () => {
  assert.equal(initialeDuPrenom(prenomAffichable('Élodie Martin', 'e@x.fr')), 'É')
  assert.equal(initialeDuPrenom(prenomAffichable('maga.taittinge', 'maga.taittinge@gmail.com')), null)
  assert.equal(initialeDuPrenom(null), null)
})

test('le menu du compte et le tiroir du téléphone lisent prénom et raison sociale, plus user.name brut', () => {
  for (const f of ['src/components/layout/MenuCompte.tsx', 'src/components/layout/BarreOnglets.tsx']) {
    const code = sansCommentaires(lire(f))
    assert.match(code, /prenomAffichable\(/, f)
    assert.match(code, /raisonSociale\(/, f)
    assert.doesNotMatch(code, /user\?\.name \?\?|user\?\.name \|\||'Utilisateur'/, f)
  }
})

test('acheteur court : le nom de l\'acheteur sans son adresse', async () => {
  const { acheteurCourt } = await import('@/lib/mesAO')
  assert.equal(acheteurCourt('Commune de VILLEBOIS – 12 rue des Tilleuls, 10000 VILLEBOIS (mandataire : ATELIER NORD)'), 'Commune de VILLEBOIS')
  assert.equal(acheteurCourt('Horizon Habitat, 8 avenue des Peupliers'), 'Horizon Habitat')
  assert.equal(acheteurCourt(null), '')
})
