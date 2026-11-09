// Phase C (premier lancement, décision du 30/10) — le bandeau « Nouveau » reste caché la première semaine :
// un patron qui découvre Synorix n'a pas encore de « nouveauté » à voir. Il apparaît à partir du 7e jour
// de l'organisation, comme avant (fermeture mémorisée dans ce navigateur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { organisationAssezAncienne, JOURS_SANS_BANDEAU } from '@/lib/bandeauNouveau'
import { BandeauSelonAge } from '@/components/layout/BandeauNouveau'
import { lire, sansCommentaires } from './outils/sources'

const MAINTENANT = new Date('2026-11-09T10:00:00Z')
const ilYa = (jours: number, heures = 0) => new Date(MAINTENANT.getTime() - (jours * 24 + heures) * 3600_000).toISOString()

test('la première semaine, le bandeau est caché ; le 7e jour, il apparaît', () => {
  assert.equal(JOURS_SANS_BANDEAU, 7)
  assert.equal(organisationAssezAncienne(ilYa(0), MAINTENANT), false)
  assert.equal(organisationAssezAncienne(ilYa(6, 23), MAINTENANT), false)
  assert.equal(organisationAssezAncienne(ilYa(7), MAINTENANT), true)
  assert.equal(organisationAssezAncienne(ilYa(40), MAINTENANT), true)
})

test('la date du serveur sans fuseau est lue en UTC ; date absente ou illisible : le bandeau reste comme avant', () => {
  assert.equal(organisationAssezAncienne('2026-11-09T09:00:00', MAINTENANT), false)
  assert.equal(organisationAssezAncienne('2026-11-01T09:00:00', MAINTENANT), true)
  assert.equal(organisationAssezAncienne(undefined, MAINTENANT), true)
  assert.equal(organisationAssezAncienne('pas une date', MAINTENANT), true)
})

const rendu = (organisation: { created_at?: string } | null) =>
  renderToStaticMarkup(<MemoryRouter><BandeauSelonAge organisation={organisation} /></MemoryRouter>)

test('à l\'écran : rien pour un compte de 2 jours ni tant que l\'organisation n\'est pas chargée', () => {
  assert.equal(rendu(null), '')
  assert.equal(rendu({ created_at: new Date(Date.now() - 2 * 24 * 3600_000).toISOString() }), '')
})

test('à l\'écran : le bandeau « Nouveau » s\'affiche pour un compte de plus de 7 jours', () => {
  const html = rendu({ created_at: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() })
  assert.ok(html.includes('Nouveau'))
  assert.ok(html.includes('Fermer le bandeau'))
})

test('le bandeau de la mise en page lit l\'organisation du compte connecté', () => {
  const code = sansCommentaires(lire('src/components/layout/BandeauNouveau.tsx'))
  assert.match(code, /useAuthStore\(\(s\) => s\.organization\)/)
})

// C13 — à 390 px le texte du bandeau est lu en entier ; refonte groupe A : sur une seule ligne, donc une phrase courte
// (qui est le lien), jamais tronquée. Seul l'écran large tronque la phrase longue.
test('bandeau : une ligne au téléphone, phrase courte lue en entier, pas de troncature sous 768 px', async () => {
  const src = sansCommentaires(lire('src/components/layout/BandeauNouveau.tsx'))
  assert.doesNotMatch(src, /line-clamp/)
  assert.match(src, /min-\[769px\]:truncate/)
  assert.doesNotMatch(src, /\btruncate\b(?<!min-\[769px\]:truncate)/)
  const court = src.match(/court: '([^']+)'/)?.[1] ?? ''
  assert.ok(court.length > 0 && court.length <= 36, 'phrase courte : tient sur une ligne à 390 px')
  assert.match(src, /whitespace-nowrap[^"]*min-\[769px\]:hidden">\{NOUVEAUTE\.court\}/)
})
