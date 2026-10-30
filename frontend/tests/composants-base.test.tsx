// Socle — composants de base sur les jetons (boutons, champs, cartes, pastilles, onglets, infobulles,
// fenêtres, tiroirs, palette) : API inchangée, états présents, classes réellement générées par Tailwind,
// aucune couleur en dur, anneau de focus jamais supprimé sans remplacement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RACINE, lire, sansCommentaires } from './outils/sources'

const FICHIERS = ['button', 'input', 'card', 'badge', 'tabs', 'tooltip', 'dialog', 'sheet', 'command', 'GlassButton'].map((f) => `src/components/ui/${f}.tsx`)

test('Button : API conservée (variant, size, asChild), états survol / actif / désactivé / focus', () => {
  const html = renderToStaticMarkup(<Button variant="default" size="lg" disabled>Enregistrer</Button>)
  assert.match(html, /<button[^>]*disabled/)
  assert.match(html, /bg-accent-fill/)
  assert.match(html, /text-accent-on/)
  assert.match(html, /hover:\[background-image:var\(--accent-fill-hover\)\]/)
  assert.match(html, /active:scale-\[\.985\]/)
  assert.match(html, /disabled:opacity-50/)
  assert.match(html, /\[@media\(pointer:coarse\)\]:min-h-11/, 'cible tactile 44 px')
  for (const variant of ['default', 'signature', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const) {
    assert.ok(buttonVariants({ variant }).length > 20, variant)
  }
  assert.match(buttonVariants({ variant: 'signature' }), /shadow-cta/)
  const lien = renderToStaticMarkup(<Button asChild><a href="/x">Ouvrir</a></Button>)
  assert.match(lien, /^<a href="\/x"/)
})

test('Input / Textarea : bord 3:1, survol, focus, erreur et désactivé', () => {
  const html = renderToStaticMarkup(<Input placeholder="Nom" aria-invalid="true" />)
  for (const c of ['border-input', 'hover:border-fg-3', 'focus-visible:border-accent-ring', 'aria-[invalid=true]:border-danger', 'disabled:bg-surface-1', 'placeholder:text-fg-3']) assert.ok(html.includes(c), c)
  assert.match(renderToStaticMarkup(<Textarea defaultValue="a" />), /<textarea/)
})

test('Card, Badge, Tabs : rendu et variantes', () => {
  const carte = renderToStaticMarkup(<Card interactive><CardHeader><CardTitle>Titre</CardTitle></CardHeader><CardContent>Corps</CardContent></Card>)
  assert.match(carte, /rounded-carte bg-surface-1/)
  assert.match(carte, /<h3[^>]*font-display/)
  const variantes = { neutral: 'text-fg-2', accent: 'text-accent-text', info: 'text-info', success: 'text-success', warning: 'text-warning', danger: 'text-danger' } as const
  for (const [v, classe] of Object.entries(variantes)) assert.match(renderToStaticMarkup(<Badge variant={v as keyof typeof variantes}>À joindre</Badge>), new RegExp(classe))
  const onglets = renderToStaticMarkup(
    <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">Identité</TabsTrigger><TabsTrigger value="b">Moyens</TabsTrigger></TabsList><TabsContent value="a">A</TabsContent></Tabs>)
  assert.match(onglets, /role="tablist"/)
  assert.match(onglets, /role="tab"[^>]*aria-selected="true"/)
})

test('aucune couleur en dur dans les composants de base, anneau de focus jamais supprimé', () => {
  const trouves: string[] = []
  for (const f of FICHIERS) {
    const code = sansCommentaires(lire(f))
    // hex, rgb(), hsl() : seuls les reflets blancs internes du bouton (SYSTEME-DESIGN §7) sont admis
    for (const m of code.matchAll(/#[0-9A-Fa-f]{3,8}\b|hsla?\(|rgba?\((?!255,\.?\s*255,\.?\s*255)/g)) trouves.push(`${f} : ${m[0]}`)
    if (/focus-visible:outline-none|focus:outline-none/.test(code) && !/focus-visible:outline-|focus-visible:ring|focus-visible:border/.test(code)) trouves.push(`${f} : focus supprimé`)
    if (/\bring-offset-background\b/.test(code)) trouves.push(`${f} : ancien anneau`)
  }
  assert.deepEqual(trouves, [])
})

test('les classes de jetons des composants existent vraiment dans le CSS généré par Tailwind', () => {
  const script = `
    const postcss = require('postcss'); const tailwind = require('tailwindcss');
    postcss([tailwind({ config: './tailwind.config.js', content: ${JSON.stringify(FICHIERS)} })])
      .process('@tailwind utilities;', { from: undefined }).then((r) => process.stdout.write(r.css))`
  const css = execFileSync(process.execPath, ['-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const attendues = ['bg-accent-fill', 'text-accent-on', 'bg-surface-0', 'bg-surface-1', 'bg-surface-2', 'text-fg', 'text-fg-2', 'text-fg-3', 'border-bord', 'border-bord-2',
    'text-info', 'bg-info-bg', 'border-info-border', 'text-success', 'text-warning', 'text-danger', 'bg-danger-solid', 'text-accent-text', 'bg-accent-tint', 'rounded-carte', 'rounded-pilule',
    'shadow-cta', 'shadow-pop', 'shadow-toast', 'duration-base', 'duration-pop', 'ease-lien', 'ease-pop', 'bg-popover', 'bg-voile', 'border-input', 'font-display']
  const absentes = attendues.filter((c) => !css.includes(`.${c.replace(/[:/[\]]/g, '\\$&')}`))
  assert.deepEqual(absentes, [])
  assert.ok(!/NaN/.test(css), 'valeur d\'opacité invalide')
})
