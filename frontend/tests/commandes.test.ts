// 1.6 — Plus de commande qui ne fait rien : chaque bouton déclenche une action.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

/** Balises ouvrantes `<button …>` d'un fichier (les accolades JSX sont suivies). */
function boutons(code: string): { ligne: number; balise: string }[] {
  const res: { ligne: number; balise: string }[] = []
  for (const m of code.matchAll(/<button\b/g)) {
    let i = m.index! + m[0].length
    let profondeur = 0
    for (; i < code.length; i++) {
      const c = code[i]
      if (c === '{') profondeur++
      else if (c === '}') profondeur--
      else if (c === '>' && profondeur === 0) break
    }
    res.push({ ligne: code.slice(0, m.index).split('\n').length, balise: code.slice(m.index, i + 1) })
  }
  return res
}

test('chaque bouton a une action (onClick, envoi de formulaire ou props transmises)', () => {
  const sansAction: string[] = []
  for (const f of fichiersSource().filter((f) => f.endsWith('.tsx'))) {
    for (const b of boutons(lire(f))) {
      if (!/onClick=|type="submit"|\{\.\.\.|onMouseDown=|onPointerDown=/.test(b.balise)) sansAction.push(`${f}:${b.ligne}`)
    }
  }
  assert.deepEqual(sansAction, [])
})

test('les 6 commandes sans action ont disparu', () => {
  const retirees: [string, string][] = [
    ['src/routes/project/StepAnalysis.tsx', 'Générer Rapport PDF'],
    ['src/routes/project/StepVerification.tsx', 'Sauvegarder le brouillon'],
    ['src/routes/project/StepExport.tsx', 'Envoyer par email'],
    ['src/routes/project/StepExport.tsx', 'À corriger'],
    ['src/components/layout/Header.tsx', 'Recherche intelligente'],
    ['src/routes/Team.tsx', 'Ajouter un membre'],
  ]
  for (const [f, libelle] of retirees) {
    assert.ok(!sansCommentaires(lire(f)).includes(libelle), `${f} contient encore « ${libelle} »`)
  }
})
