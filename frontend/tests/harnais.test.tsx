// Témoin du harnais : l'alias @ se résout et un composant React se rend en HTML statique.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '@/lib/utils'

test("l'alias @ pointe vers src", () => {
  assert.equal(cn('a', false && 'b', 'c'), 'a c')
})

test('un composant React se rend en HTML statique', () => {
  assert.equal(renderToStaticMarkup(<p>Bonjour</p>), '<p>Bonjour</p>')
})
