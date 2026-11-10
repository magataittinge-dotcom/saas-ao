// Défaut 7 du fondateur : le bandeau « Nouveau » devient une ligne congédiable de l'Accueil, sous l'en-tête ; il n'existe plus
// ailleurs (la coquille ne le pose plus). Congédiée, la ligne ne revient pas dans ce navigateur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LigneNouveauSelonAge } from '@/components/dashboard/LigneNouveau'
import { cleNouveaute, fermerNouveaute, NOUVEAUTE, nouveauteFermee, nouveauteVisible } from '@/lib/bandeauNouveau'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const rendre = (organisation: { created_at?: string } | null) =>
  renderToStaticMarkup(<MemoryRouter><LigneNouveauSelonAge organisation={organisation} /></MemoryRouter>)

test('la ligne « Nouveau » : une phrase, un lien, une croix nommée ; rien tant que l’organisation n’est pas chargée ou trop jeune', () => {
  const html = rendre({ created_at: '2026-01-01T00:00:00Z' })
  assert.ok(html.includes('data-ligne-nouveau') && html.includes('>Nouveau<') && html.includes(NOUVEAUTE.texte))
  assert.ok(html.includes(`href="${NOUVEAUTE.lien.to}"`) && html.includes(NOUVEAUTE.lien.libelle))
  assert.ok(html.includes('aria-label="Fermer le bandeau"'), 'la croix a un nom')
  assert.ok(html.includes('data-message="info"'), 'le message du système, pas un composant maison')
  assert.equal(rendre(null), '', 'organisation pas encore chargée : rien')
  assert.equal(rendre({ created_at: new Date().toISOString() }), '', 'première semaine : rien')
  assert.ok(!/!/.test(NOUVEAUTE.texte), 'aucun point d’exclamation')
})

test('congédiée, la ligne ne revient pas : la fermeture est mémorisée par identifiant de nouveauté', () => {
  const stock = new Map<string, string>()
  const rangement = { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => { stock.set(k, v) } }
  assert.equal(nouveauteFermee(rangement), false)
  fermerNouveaute(rangement)
  assert.equal(stock.get(cleNouveaute()), 'ferme')
  assert.equal(nouveauteFermee(rangement), true)
  assert.equal(nouveauteVisible({ created_at: '2026-01-01T00:00:00Z' }, true), false)
  assert.equal(nouveauteVisible({ created_at: '2026-01-01T00:00:00Z' }, false, new Date('2026-11-10T09:00:00Z')), true)
  assert.equal(nouveauteFermee(null), false, 'stockage indisponible : la ligne reviendra')
})

test('la ligne « Nouveau » n’existe que sur l’Accueil', () => {
  assert.match(sansCommentaires(lire('src/routes/Dashboard.tsx')), /<LigneNouveau \/>/)
  const ailleurs = fichiersSource().filter((f) => f !== 'src/routes/Dashboard.tsx' && f !== 'src/components/dashboard/LigneNouveau.tsx'
    && /LigneNouveau|<BandeauNouveau|<BandeauSelonAge/.test(sansCommentaires(lire(f))) && !f.endsWith('layout/BandeauNouveau.tsx'))
  assert.deepEqual(ailleurs, [])
})
