// 1.17 — La photo du compte en bas de la barre latérale : la photo Clerk si
// le compte en a une ; sinon, ou si elle ne charge pas, les initiales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

test('la barre latérale montre la photo du compte, et les initiales sans photo', () => {
  const code = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.match(code, /const \{ user: compte \} = useUser\(\)/)
  // imageUrl donne toujours une image (avatar générique de Clerk) : seul
  // hasImage dit si le compte a une vraie photo
  assert.match(code, /const photo = compte\?\.hasImage && compte\.imageUrl !== photoEnEchec \? compte\.imageUrl : null/)
  assert.match(code, /\{photo\s*\?\s*<img src=\{photo\} alt="" [^>]*onError=\{\(\) => setPhotoEnEchec\(photo\)\} \/>\s*:\s*initials\}/)
})
