// S2 — « Nouvel appel d'offres » : un bouton avec son texte en haut de chaque écran, qui ouvre directement la
// zone de dépôt. Le nom de l'AO est tiré du nom du fichier ; l'ancien formulaire « Nom du projet » quitte le
// chemin. /projects/new reste une adresse valide (c'est l'écran de dépôt) et suit le thème clair / nuit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewProject from '@/routes/NewProject'
import { nomAODepuisFichier } from '@/lib/nomAO'
import { lire, sansCommentaires } from './outils/sources'

const html = renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><NewProject /></MemoryRouter></QueryClientProvider>)

test('/projects/new est l\'écran de dépôt : une zone ZIP / PDF, plus de formulaire « Nom du projet »', () => {
  assert.ok(/<h1[^>]*>Nouvel appel d&#x27;offres<\/h1>/.test(html), 'un seul h1')
  assert.ok(/<input[^>]*type="file"[^>]*>/.test(html), 'zone de dépôt')
  assert.ok(/accept="[^"]*\.zip[^"]*"/.test(html) && /accept="[^"]*\.pdf[^"]*"/.test(html), 'ZIP et PDF')
  assert.ok(!/<form/.test(html), 'plus de formulaire')
  assert.ok(!html.includes('Nom du projet'), 'plus de champ « Nom du projet »')
  assert.ok(!html.includes('Créer le projet'), 'plus de bouton « Créer le projet »')
  assert.ok(html.includes('Retour'), 'le retour reste')
})

test('le nom de l\'AO est tiré du nom du fichier (extension et séparateurs retirés)', () => {
  assert.equal(nomAODepuisFichier('DCE_Charleville-42_logements.zip'), 'DCE Charleville 42 logements')
  assert.equal(nomAODepuisFichier('Dossier  consultation.PDF'), 'Dossier consultation')
  assert.equal(nomAODepuisFichier('lot_03__gros-oeuvre.zip'), 'lot 03 gros oeuvre')
  assert.equal(nomAODepuisFichier('.zip'), 'Nouvel appel d\'offres', 'un fichier sans nom donne un nom par défaut')
  assert.equal(nomAODepuisFichier('sans-extension'), 'sans extension')
})

test('la zone crée l\'AO avec ce seul nom, passe le fichier à l\'étape de dépôt et ne touche à aucune route', () => {
  const zone = sansCommentaires(lire('src/components/onboarding/ZoneDepotAO.tsx'))
  assert.match(zone, /nomAODepuisFichier\(file\.name\)/)
  assert.match(zone, /createProject\(\{ name \}/, 'la charge utile reste { name }')
  assert.match(zone, /setPendingUpload\(file\)/)
  assert.match(zone, /navigate\(`\/projects\/\$\{project\.id\}\/upload`\)/)
  const bienvenue = sansCommentaires(lire('src/components/onboarding/FirstAOWelcome.tsx'))
  assert.match(bienvenue, /<ZoneDepotAO/, 'l\'écran « Bienvenue » utilise la même zone')
  assert.doesNotMatch(bienvenue, /createProject/)
})

test('l\'en-tête porte un seul bouton « Nouvel appel d\'offres », avec son texte, hors de la barre', () => {
  const entete = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(entete, /Nouvel appel d&apos;offres|Nouvel appel d'offres/)
  assert.equal((entete.match(/navigate\('\/projects\/new'\)/g) ?? []).length, 1, 'un seul bouton')
  assert.match(entete, /bg-accent-fill/)
  const barre = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.doesNotMatch(barre, /projects\/new/, 'rien dans la barre')
})

test('la route /projects/new suit le thème clair / nuit', () => {
  const layout = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(layout, /PAGES_THEMEES = \[[^\]]*'\/projects\/new'/)
})
