// Restes 2, point 6 — l'entrée du front ne charge plus date-fns : `cn` (lib/utils.ts), importé par presque tous les
// composants, vivait avec les dates de date-fns et sa locale (7,7 Ko de plus dans l'entrée). Les dates sont dans
// lib/dates.ts. Mesure avant/après (npm run build, brotli de l'entrée) : rapport RESTES-2.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cn, formatMontant } from '@/lib/utils'
import { daysUntil, formatDate } from '@/lib/dates'
import { lire, sansCommentaires } from './outils/sources'

test('lib/utils.ts ne tire plus date-fns ; les dates vivent dans lib/dates.ts', () => {
  assert.doesNotMatch(sansCommentaires(lire('src/lib/utils.ts')), /date-fns/)
  assert.match(sansCommentaires(lire('src/lib/dates.ts')), /from 'date-fns'/)
  assert.equal(cn('px-2', 'px-4'), 'px-4')
  assert.equal(formatDate('2026-11-12T10:00:00'), '12/11/2026')
  assert.equal(daysUntil(new Date(Date.now() + 3.5 * 86_400_000)), 3)
  assert.match(formatMontant(1490), /^1\s490\s€$/)
})
