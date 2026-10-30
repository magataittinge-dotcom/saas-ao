// Phase C — Mon entreprise : trois onglets (Identité / Moyens / Certifications), onglets du socle, étiquettes
// associées, sections repliables annoncées, barre d'enregistrement qui ne masque rien au téléphone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Company from '@/routes/Company'
import { lire, sansCommentaires } from './outils/sources'

const CONFIG = { nom_entreprise: 'Entreprise de démonstration', activites: 'Ravalement (inventé)', zone_intervention: 'Calvados' }
const html = (() => {
  const client = new QueryClient()
  client.setQueryData(['memoire-config'], CONFIG)
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Company /></MemoryRouter></QueryClientProvider>)
})()

test('les trois onglets gardent leurs libellés et viennent du socle (rôle tablist, onglet actif)', () => {
  assert.ok(/<h1[^>]*>Mon entreprise<\/h1>/.test(html), 'un seul h1')
  assert.ok(html.includes('role="tablist"'))
  for (const t of ['Identité', 'Moyens humains &amp; matériels', 'Certifications &amp; références']) assert.ok(html.includes(t), t)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3)
  assert.ok(/role="tab"[^>]*aria-selected="true"[^>]*>Identité</.test(html) || /aria-selected="true"[^>]*data-state="active"[^>]*>Identité</.test(html) || html.includes('data-state="active"'), 'onglet actif')
  assert.ok(html.includes('role="tabpanel"'))
})

test("l'onglet Identité : champs légaux du socle avec étiquettes associées, bouton Enregistrer du socle", () => {
  for (const [id, label] of [['org-name', "Nom de l&#x27;entreprise"], ['org-siret', 'SIRET'], ['org-address', 'Adresse'], ['org-presentation', 'Présentation']]) {
    assert.ok(html.includes(`for="${id}"`) && html.includes(`id="${id}"`), id)
    assert.ok(html.includes(label), label)
  }
  const bouton = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? ''
  assert.ok(bouton.includes('bg-accent-fill'), 'Enregistrer = bouton du socle')
  assert.ok(html.includes('Coordonnées légales — pré-remplies depuis le répertoire Sirene à l&#x27;inscription.'))
})

test('les sections du profil sont repliables et annoncées (aria-expanded / aria-controls), compteurs en Badge', () => {
  assert.ok(/aria-expanded="true"/.test(html), 'la section Entreprise est ouverte')
  assert.ok(/aria-controls="[^"]+"/.test(html))
  assert.ok(html.includes('Entreprise'))
  assert.ok(/<span[^>]*rounded-pilule[^>]*>\d+\/8<\/span>/.test(html), 'compteur « n/8 » en Badge')
  assert.ok(html.includes('role="progressbar"'))
})

test('la barre d\'enregistrement reste dans la zone de défilement (sticky), plus de barre fixed sous les onglets du téléphone', () => {
  const code = sansCommentaires(lire('src/routes/MemoireConfig.tsx'))
  assert.match(code, /sticky bottom-0/)
  assert.doesNotMatch(code, /fixed bottom-0/)
})

test('/company suit le thème clair / nuit', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Layout.tsx')), /PAGES_THEMEES = \[[^\]]*'\/company'/)
})
