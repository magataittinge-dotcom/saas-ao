// 1.13 — Aucune perte en un clic : chaque suppression passe par une
// confirmation qui nomme ce qui va disparaître.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeleteConfirmContenu } from '@/components/common/DeleteConfirmModal'
import { lire, sansCommentaires } from './outils/sources'

test('la fenêtre de confirmation nomme l\'élément et se présente comme un dialogue', () => {
  const html = renderToStaticMarkup(
    <DeleteConfirmContenu
      title="Supprimer « CCTP_lot05.pdf » ?"
      detail="Le fichier ne sera plus dans le dossier de cet AO."
      libelleConfirmer="Supprimer"
      enCours={false}
      erreur={null}
      onConfirmer={() => {}}
      onCancel={() => {}}
    />,
  )
  assert.ok(html.includes('role="dialog"'))
  assert.ok(html.includes('aria-modal="true"'))
  assert.ok(html.includes('Supprimer « CCTP_lot05.pdf » ?'))
  assert.ok(html.includes('Annuler'))
})

test('chaque écran qui supprime passe par une confirmation nommée', () => {
  const ecrans: [string, RegExp][] = [
    ['src/routes/Projects.tsx', /title=\{`Supprimer « \$\{deleteTarget\.name\} » \?`\}/],
    ['src/routes/project/StepUpload.tsx', /`Supprimer « \$\{aSupprimer\.doc\.file_name\} » \?`/],
    ['src/routes/project/StepUpload.tsx', /`Supprimer les \$\{documents\.length\} fichiers du dossier \?`/],
    ['src/routes/Vault.tsx', /`Supprimer « \$\{pieceASupprimer\.file_name\} » du coffre-fort \?`/],
    ['src/routes/project/StepLotSelection.tsx', /`Retirer « \$\{lotARetirer\.user_label \|\| lotARetirer\.nom\} » de la liste \?`/],
  ]
  for (const [f, motif] of ecrans) assert.match(sansCommentaires(lire(f)), motif, f)
})

test('plus aucune suppression déclenchée directement par un clic', () => {
  const directs: [string, string][] = [
    ['src/routes/project/StepUpload.tsx', 'documents.forEach((d) => deleteDoc(d.id))'],
    ['src/routes/project/StepUpload.tsx', 'onClick={() => deleteDoc(doc.id)}'],
    ['src/routes/Vault.tsx', 'onDelete={deleteDocument}'],
    ['src/routes/project/StepLotSelection.tsx', 'onDelete={() => handleDelete(lot.id)}'],
  ]
  for (const [f, extrait] of directs) assert.ok(!lire(f).includes(extrait), `${f} : ${extrait}`)
})

test('« Sans suite » se défait depuis le tableau de bord', () => {
  const code = sansCommentaires(lire('src/routes/Dashboard.tsx'))
  assert.match(code, /est classé sans suite\./)
  assert.match(code, /status: 'analyzed'/)
})
