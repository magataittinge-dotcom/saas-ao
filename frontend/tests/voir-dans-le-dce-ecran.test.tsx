// « Voir dans le DCE » sur l'écran d'analyse : le panneau remplace la modale PDF à 780 px, et
// l'écran n'envoie plus de texte du DCE dans l'URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('« Voir dans le DCE » : plus de highlight= dans l’URL, plus de PdfSourceViewer appelé', () => {
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.ok(!/highlight/.test(analyse) && !/PdfSourceViewer/.test(analyse))
  for (const f of fichiersSource()) {
    if (f.endsWith('PdfSourceViewer.tsx')) continue
    assert.ok(!/PdfSourceViewer/.test(sansCommentaires(lire(f))), `${f} importe encore PdfSourceViewer`)
  }
})
