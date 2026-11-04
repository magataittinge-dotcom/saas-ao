// Recette du 4/11 — l'accueil disait « Bonjour, maga.taittinge » (le début de l'e-mail) et gardait dans « Vos AO en cours »
// (et dans le compteur) des AO dont la remise est passée.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prenomAffichable } from '@/lib/prenom'
import { estEnCoursOuvert } from '@/lib/echeance'
import { aoDeLaBande } from '@/components/dashboard/BandeAO'
import { projet, remise } from './outils/projetsFactices'

test('« Bonjour » + prénom s\'il existe ; sinon « Bonjour » seul ; jamais le début de l\'e-mail', () => {
  assert.equal(prenomAffichable('Mohamed Omarov', 'mohamed@exemple.fr'), 'Mohamed')
  assert.equal(prenomAffichable('Élodie', 'e@exemple.fr'), 'Élodie')
  assert.equal(prenomAffichable('maga.taittinge', 'maga.taittinge@gmail.com'), null)
  assert.equal(prenomAffichable('Maga.Taittinge', 'maga.taittinge@gmail.com'), null)
  assert.equal(prenomAffichable('jdupont42', 'autre@exemple.fr'), null)
  assert.equal(prenomAffichable('contact@entreprise.fr', null), null)
  assert.equal(prenomAffichable('', 'a@b.fr'), null)
  assert.equal(prenomAffichable(undefined, undefined), null)
})

test('un AO dont la remise est passée sort de « Vos AO en cours » ; il reste en cours s\'il n\'a pas de date ou si la remise est à venir', () => {
  const passe = projet('p', { status: 'analyzed', current_step: 3, ...remise('2020-01-15') })
  const avenir = projet('f', { status: 'analyzed', current_step: 3, ...remise('2099-01-15') })
  const sansDate = projet('s', { status: 'en_cours', current_step: 1 })
  assert.equal(estEnCoursOuvert(passe), false)
  assert.equal(estEnCoursOuvert(avenir), true)
  assert.equal(estEnCoursOuvert(sansDate), true)
  assert.deepEqual(aoDeLaBande([passe, avenir, sansDate]).map((p) => p.id).sort(), ['f', 's'])
})
