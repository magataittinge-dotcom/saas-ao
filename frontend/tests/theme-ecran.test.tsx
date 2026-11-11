// T5 d — les fenêtres, infobulles et notifications (rendues en portail, hors de <main>) suivent le thème
// effectif de l'écran : nuit forcée tant que l'écran n'est pas refait, thème global sinon.
// Sans navigateur dans les tests, on vérifie (1) le contexte rendu côté serveur, (2) que chaque portail
// pose bien l'attribut lu dans ce contexte, (3) que Layout le publie pour <main> ET pour la zone des notifications.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeEcranProvider, useThemeEcran } from '@/lib/themeEcran'
import { estThemee } from '@/components/layout/Layout'
import { lire, sansCommentaires } from './outils/sources'

function Sonde() {
  return <i data-theme={useThemeEcran()} />
}

test('hors écran forcé, aucun thème n\'est imposé', () => {
  assert.equal(renderToStaticMarkup(<Sonde />), '<i></i>')
  assert.equal(renderToStaticMarkup(<ThemeEcranProvider value={undefined}><Sonde /></ThemeEcranProvider>), '<i></i>')
})

test('sur un écran en nuit forcée, le portail lit « dark »', () => {
  assert.equal(renderToStaticMarkup(<ThemeEcranProvider value="dark"><Sonde /></ThemeEcranProvider>), '<i data-theme="dark"></i>')
})

test('aucun écran de la coquille n\'est en nuit forcée : une adresse inconnue suit le thème choisi, comme les autres', () => {
  for (const p of ['/team', '/references', '/adresse-inconnue', '/projets', '/entreprise/fiche', '/x/y/z']) assert.equal(estThemee(p), true, p)
  for (const p of ['/dashboard', '/vault', '/company', '/projects/abc', '/settings', '/settings/billing', '/outils']) assert.equal(estThemee(p), true, p)
})

const PORTAILS: [string, number][] = [
  ['src/components/ui/dialog.tsx', 2],     // voile + fenêtre
  ['src/components/ui/sheet.tsx', 2],      // voile + volet
  ['src/components/ui/tooltip.tsx', 1],
]
for (const [fichier, attendu] of PORTAILS) {
  test(`${fichier} pose le thème de l'écran sur ses nœuds de portail`, () => {
    const code = sansCommentaires(lire(fichier))
    assert.equal(code.split('data-theme={useThemeEcran()}').length - 1, attendu)
  })
}

test('Layout publie le thème de l\'écran dans <main>, autour de l\'écran, et à la zone des notifications', () => {
  const code = sansCommentaires(lire('src/components/layout/Layout.tsx'))
  assert.match(code, /const themeEcran: ThemeForce = themee \? undefined : 'dark'/)
  assert.match(code, /data-theme=\{themee \? undefined : 'dark'\}/)
  assert.match(code, /<ThemeEcranProvider value=\{themeEcran\}>[\s\S]*<Outlet \/>[\s\S]*<\/ThemeEcranProvider>/)
  assert.match(code, /<ToastContainer theme=\{themeEcran\} \/>/)
  const toast = sansCommentaires(lire('src/components/ui/toast.tsx'))
  assert.match(toast, /<div data-theme=\{theme\} data-zone-toasts=""/)
})

// C11 — Paramètres, Abonnement et Outils suivent le thème : plus aucune couleur écrite en dur (sinon un aplat sombre
// resterait posé sur un écran clair : texte illisible).
test('C11 : Paramètres, Abonnement (et sa grille d’offres) et Outils lisent les jetons, sans couleur en dur', async () => {
  const { lire, sansCommentaires } = await import('./outils/sources')
  const enDur = ['src/routes/Settings.tsx', 'src/routes/Billing.tsx', 'src/routes/Tools.tsx', 'src/components/offres/GrilleOffres.tsx'].flatMap((f) => {
    const code = sansCommentaires(lire(f))
    return [...code.matchAll(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])|rgba?\(|hsla?\(/g)].map((m) => `${f} : ${m[0]}`)
  })
  assert.deepEqual(enDur, [])
})
