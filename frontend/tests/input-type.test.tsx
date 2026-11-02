// R22 — un champ sans type explicite est un champ texte déclaré (les sélecteurs standards, les tests et les lecteurs d'écran le trouvent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Input } from '@/components/ui/input'

test('Input : type="text" par défaut, le type demandé sinon', () => {
  assert.match(renderToStaticMarkup(<Input aria-label="Spécialité" />), /type="text"/)
  assert.match(renderToStaticMarkup(<Input type="email" />), /type="email"/)
  assert.doesNotMatch(renderToStaticMarkup(<Input type="email" />), /type="text"/)
})
