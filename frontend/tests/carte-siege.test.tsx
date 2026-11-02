// Carte IGN du siège sur « Mon entreprise » (D3) : elle remplace l'image Google (qui n'a jamais pu s'afficher : API non activée).
// Le serveur compose la carte à partir de l'adresse enregistrée ; le front l'affiche avec sa légende (source IGN, date) et n'affiche
// rien s'il n'y a pas d'adresse ou pas de carte. Aucune clé Google dans le front. Adresses et image INVENTÉES.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CarteSiegeVue } from '@/components/entreprise/CarteSiege'
import { adresseCartographiable, lireCarteSiege, sourceImage } from '@/lib/carteSiege'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const CARTE = { image_base64: 'aW1hZ2UtaW52ZW50ZWU=', legende: 'Situation de l\'entreprise — 12 avenue du Port, 51100 Reims. Source : IGN – Plan IGN v2 (Géoplateforme), extrait du 02/11/2026' }

test('une adresse trop courte n\'est pas cartographiée', () => {
  assert.equal(adresseCartographiable(undefined), false)
  assert.equal(adresseCartographiable(null), false)
  assert.equal(adresseCartographiable('  51100 Reims  '), true)
  assert.equal(adresseCartographiable('Paris'), false)
  assert.equal(adresseCartographiable('12 avenue du Port, 51100 Reims'), true)
})

test('la réponse du serveur : une carte, ou rien (204, corps vide, forme inattendue)', () => {
  assert.deepEqual(lireCarteSiege(CARTE), CARTE)
  for (const vide of ['', null, undefined, {}, { image_base64: '', legende: 'x' }, { image_base64: 'abc' }, { image_base64: 1, legende: 'x' }]) {
    assert.equal(lireCarteSiege(vide), null, JSON.stringify(vide))
  }
})

test('la vue montre l\'image du plan IGN et sa légende sourcée', () => {
  const html = renderToStaticMarkup(<CarteSiegeVue carte={CARTE} />)
  assert.ok(html.includes(`src="${sourceImage(CARTE)}"`))
  assert.ok(sourceImage(CARTE).startsWith('data:image/png;base64,'))
  assert.ok(html.includes('alt="Carte de situation du siège de l&#x27;entreprise"'))
  assert.ok(html.includes('Source : IGN – Plan IGN v2'), 'la source et la date accompagnent la carte (Licence Ouverte 2.0)')
  assert.ok(html.includes('Aperçu de la carte insérée dans vos mémoires techniques'))
})

test('la page « Mon entreprise » n\'appelle plus Google : la carte vient du serveur, sans clé', () => {
  const identite = sansCommentaires(lire('src/components/entreprise/FormIdentite.tsx'))
  assert.ok(identite.includes('<CarteSiege adresse='), 'la carte IGN est branchée')
  assert.ok(!/GMAPS|googleapis|staticmap/i.test(identite))
  for (const f of fichiersSource()) assert.ok(!/GOOGLE_MAPS|maps\.googleapis/i.test(sansCommentaires(lire(f))), f)
  assert.ok(!/GOOGLE_MAPS/.test(lire('.env.example')))
})
