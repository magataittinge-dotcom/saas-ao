// Restes 2 — un dialogue, une palette ou un tiroir fermé rend le focus à ce qui l'a ouvert (recette : Échap sur « Supprimer
// mon compte » et sur la palette ouverte au clic laissait le focus sur <body>). Radix ne le rend qu'à son Trigger ; nos
// dialogues s'ouvrent par un état. La preuve navigateur est dans le rapport RESTES-2 (banc, Chromium).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { elementARetenir, useRetourFocus } from '@/components/ui/retourFocus'
import { lire, sansCommentaires } from './outils/sources'

type Factice = { ownerDocument: { body: unknown; documentElement: unknown; activeElement: unknown }; isConnected: boolean; focus: (o?: FocusOptions) => void; appels: number }

function page() {
  const doc = { body: {}, documentElement: {}, activeElement: null as unknown }
  const bouton: Factice = { ownerDocument: doc, isConnected: true, appels: 0, focus() { bouton.appels += 1 } }
  ;(doc.body as { ownerDocument: unknown }).ownerDocument = doc
  return { doc, bouton }
}

function gestionnaires(ouverture?: (e: Event) => void, fermeture?: (e: Event) => void) {
  let g: ReturnType<typeof useRetourFocus> | undefined
  function Sonde() { g = useRetourFocus(ouverture, fermeture); return null }
  renderToStaticMarkup(<Sonde />)
  return g!
}

function avecDocument<T>(doc: unknown, f: () => T): T {
  const avant = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = doc
  try { return f() } finally { (globalThis as { document?: unknown }).document = avant }
}

test('le focus revient au bouton qui a ouvert le dialogue (fermeture par Échap, voile ou Annuler)', () => {
  const { doc, bouton } = page()
  const g = gestionnaires()
  doc.activeElement = bouton
  avecDocument(doc, () => g.onOpenAutoFocus(new Event('ouverture', { cancelable: true })))
  const fermeture = new Event('fermeture', { cancelable: true })
  g.onCloseAutoFocus(fermeture)
  assert.equal(bouton.appels, 1)
  assert.equal(fermeture.defaultPrevented, true, 'Radix ne repasse pas derrière (son Trigger absent = focus sur body)')
})

test('rien de retenu (focus sur body, Safari) : Radix garde la main ; ouvreur parti de la page : rien', () => {
  const { doc, bouton } = page()
  const g = gestionnaires()
  doc.activeElement = doc.body
  avecDocument(doc, () => g.onOpenAutoFocus(new Event('ouverture')))
  const fermeture = new Event('fermeture', { cancelable: true })
  g.onCloseAutoFocus(fermeture)
  assert.equal(fermeture.defaultPrevented, false)

  doc.activeElement = bouton
  avecDocument(doc, () => g.onOpenAutoFocus(new Event('ouverture')))
  bouton.isConnected = false
  const fermeture2 = new Event('fermeture', { cancelable: true })
  g.onCloseAutoFocus(fermeture2)
  assert.equal(bouton.appels, 0)
  assert.equal(fermeture2.defaultPrevented, false)
})

test("les gestionnaires de l'appelant passent d'abord ; s'il empêche le défaut, on ne touche à rien", () => {
  const { doc, bouton } = page()
  const vus: string[] = []
  const g = gestionnaires(() => vus.push('ouverture'), (e) => { vus.push('fermeture'); e.preventDefault() })
  doc.activeElement = bouton
  avecDocument(doc, () => g.onOpenAutoFocus(new Event('ouverture', { cancelable: true })))
  g.onCloseAutoFocus(new Event('fermeture', { cancelable: true }))
  assert.deepEqual(vus, ['ouverture', 'fermeture'])
  assert.equal(bouton.appels, 0)
})

test('elementARetenir : ni body, ni html, ni rien', () => {
  const { doc, bouton } = page()
  assert.equal(elementARetenir(null), null)
  assert.equal(elementARetenir(doc.body as Element), null)
  assert.equal(elementARetenir(bouton as unknown as Element), bouton)
})

test('les trois enveloppes de Radix (dialogue du système, palette Ctrl K, tiroirs) rendent le focus', () => {
  for (const f of ['src/components/ui/dialogue.tsx', 'src/components/ui/dialog.tsx', 'src/components/ui/sheet.tsx']) {
    assert.match(sansCommentaires(lire(f)), /useRetourFocus\(/, f)
  }
  // le bouton du système reprend le focus après « en cours » (désactivé, il l'avait perdu sur body)
  assert.match(sansCommentaires(lire('src/components/ui/bouton.tsx')), /useFocusGardeEnCours\(enCours, ref\)/)
})
