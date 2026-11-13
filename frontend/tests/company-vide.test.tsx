// Mon entreprise vide (C9, décision 3 du 2/11) — un profil vide ne voit qu'une première action, « Commencer par votre SIRET » ;
// dès que le SIRET est validé ou qu'une information est saisie, la page normale revient.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Company from '@/routes/Company'
import { entrepriseVide } from '@/lib/entreprise/vide'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { useAuthStore } from '@/stores/authStore'

const ORG_VIDE = { id: 'o1', name: '', siret: null, siret_verified: false, address: null, plan: 'free' as const, created_at: '2026-01-01' }
const VIDE: DonneesEntreprise = { organisation: ORG_VIDE, profil: {}, equipe: [], references: [], documents: [], qualifications: [] }

test('entrepriseVide : un profil sans aucune information est vide', () => {
  assert.equal(entrepriseVide(VIDE), true)
  assert.equal(entrepriseVide({}), true)
  assert.equal(entrepriseVide({ ...VIDE, profil: { gerant_nom: '   ' } }), true)
})

test('entrepriseVide : le SIRET validé, ou une seule information saisie, le rend non vide', () => {
  assert.equal(entrepriseVide({ ...VIDE, organisation: { ...ORG_VIDE, siret_verified: true } }), false)
  assert.equal(entrepriseVide({ ...VIDE, organisation: { ...ORG_VIDE, siret: '12345678900011' } }), false)
  assert.equal(entrepriseVide({ ...VIDE, organisation: { ...ORG_VIDE, name: 'Entreprise inventée' } }), false)
  assert.equal(entrepriseVide({ ...VIDE, profil: { gerant_nom: 'Camille Démo' } }), false)
  assert.equal(entrepriseVide({ ...VIDE, documents: [{ type: 'kbis', status: 'valid' }] }), false)
  assert.equal(entrepriseVide({ ...VIDE, references: [{ id: 'r1', intitule: 'École (exemple)' }] }), false)
})

function page(organisation: typeof ORG_VIDE & Record<string, unknown>, profil: Record<string, unknown>): string {
  const client = new QueryClient()
  client.setQueryData(['memoire-config'], profil)
  client.setQueryData(['team'], [])
  client.setQueryData(['references'], [])
  client.setQueryData(['documents'], [])
  client.setQueryData(['qualifications'], [])
  useAuthStore.setState({ organization: organisation as never })
  const g = globalThis as unknown as { window?: unknown }
  const avant = g.window
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Company /></MemoryRouter></QueryClientProvider>)
  } finally { g.window = avant }
}

test('Mon entreprise vide : une seule première action, pas les rubriques', () => {
  const html = page(ORG_VIDE, {})
  assert.match(html, /Commencer par votre SIRET/)
  assert.match(html, /aria-label="Numéro SIRET"/)
  assert.doesNotMatch(html, /role="tablist"/)
  // les trois rubriques sont annoncées (ce qui apparaîtra), sans être proposées : aucun onglet, aucun compteur
  assert.match(html, /data-ensuite=""[\s\S]*Moyens humains et matériels/)
  assert.doesNotMatch(html, /role="tab"|information[s]? sur/)
  assert.match(html, />Commencer<\/button>/, 'le verbe du bouton répond au titre')
  assert.match(html, /data-visage=""/, 'le visage de Synorix signe le premier écran')
  assert.doesNotMatch(html, /manquant|incomplet|absent/i)
})

// (Le SIRET validé est couvert par entrepriseVide ci-dessus : le rendu serveur lit l'état initial du magasin, pas setState.)
test('Mon entreprise : une information saisie, la page normale revient', () => {
  const html = page(ORG_VIDE, { gerant_nom: 'Camille Démo' })
  assert.doesNotMatch(html, /Commencer par votre SIRET/)
  assert.match(html, /Moyens humains et matériels/)
})
