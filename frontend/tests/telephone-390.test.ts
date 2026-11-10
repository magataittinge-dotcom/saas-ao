// Mission TELEPHONE (10/11/2026) — à 390 px, au pouce : ce que la mesure sur le banc a corrigé, gardé ici par les classes
// qui l'assurent (la mesure elle-même : TELEPHONE=1 node design/scenarios/grille.mjs, échoue si un écran déborde).
// Toutes ces classes ne valent que sous 768 px : rien ne bouge au bureau.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lire, sansCommentaires } from './outils/sources'

const code = (f: string) => sansCommentaires(lire(f))

test('dialogue du socle : au téléphone, une feuille plafonnée à l’écran ; le contenu seul défile, titre et actions restent', () => {
  const c = code('src/components/ui/dialogue.tsx')
  assert.match(c, /max-\[768px\]:max-h-\[calc\(100dvh-1rem\)\] max-\[768px\]:flex-col/)
  assert.match(c, /data-dialogue-corps="" className="contents max-\[768px\]:-mx-6 max-\[768px\]:grid max-\[768px\]:min-h-0 max-\[768px\]:flex-1[^"]*max-\[768px\]:overflow-y-auto max-\[768px\]:overscroll-contain/)
  assert.match(c, /data-dialogue-actions="" className="[^"]*max-\[768px\]:shrink-0/)
})

test('cases de résumé : deux colonnes au téléphone (quatre cases sur deux rangées), le bureau garde ses colonnes', () => {
  const c = code('src/components/ui/case-resume.tsx')
  assert.match(c, /max-md:grid-cols-2/)
  assert.match(c, /max-md:\[&>\*:last-child:nth-child\(odd\)\]:col-span-2/)
  assert.match(c, /n >= 4 \? 'md:grid-cols-4' : n === 3 \? 'md:grid-cols-3'/)
})

test('pastille d’état : un long libellé passe à la ligne au téléphone au lieu de sortir de l’écran', () => {
  assert.match(code('src/components/ui/pastille.tsx'), /whitespace-nowrap[^']*max-md:max-w-full max-md:whitespace-normal/)
})

test('Export, exigences relevées : rangées empilées, case de 44 px, source sous le texte', () => {
  const c = code('src/components/project/ExigencesDuDossier.tsx')
  assert.match(c, /<label className="contents max-md:-my-2\.5 max-md:-ml-2\.5 max-md:grid max-md:size-11/)
  assert.match(c, /max-md:flex-wrap/)
  assert.match(c, /whitespace-nowrap max-md:ml-\[2\.375rem\] max-md:min-w-0 max-md:shrink max-md:whitespace-normal/)
  assert.match(c, /disabled:opacity-50 max-md:min-h-11 max-md:px-3/)
})

test('coquille : liens du pied de page et fil d’Ariane à 44 px ; dans un AO, la barre du haut garde deux actions', () => {
  assert.match(code('src/components/layout/LegalFooter.tsx'), /max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-2\.5/)
  assert.match(code('src/components/ui/sheet.tsx'), /size-10 place-items-center max-\[768px\]:size-11/)
  assert.match(lire('src/styles/pieces.css'), /@media \(max-width: 768px\) \{\s*\.piece-note, \.carte-ao-30s__libelle \{ font-size: var\(--taille-12\); \}/)
  const h = code('src/components/layout/Header.tsx')
  assert.match(h, /LIEN_PARENT = '[^']*max-\[768px\]:min-h-11/)
  assert.match(h, /parent && 'max-\[768px\]:hidden'/)
})

test('champs à 16 px au téléphone (sinon le téléphone zoome à la saisie) : palette Ctrl K et connexion', () => {
  assert.match(code('src/components/ui/command.tsx'), /max-\[768px\]:text-saisie/)
  assert.match(code('src/lib/clerkApparence.ts'), /max-\[768px\]:!text-saisie/)
})

test('listes d’AO : le titre est une cible de 44 px au téléphone, la rangée ne bouge pas', () => {
  for (const f of ['src/components/mesao/LigneAO.tsx', 'src/components/dashboard/BandeAO.tsx']) {
    assert.match(code(f), /max-md:-my-3 max-md:py-3"><span className="line-clamp-2">/)
  }
})

test('Décider : au téléphone, les catégories d’exigences arrivent repliées', () => {
  const c = code('src/routes/project/StepAnalysis.tsx')
  assert.match(c, /matchMedia\?\.\('\(max-width: 768px\)'\)/)
  assert.match(c, /defaultOpen=\{\(sectionIdx === 0 && !auTelephone\)/)
})

test('Rédiger : un tableau du mémoire devient une liste de rangées au téléphone, chaque cellule redit sa colonne (P28)', () => {
  const c = code('src/components/memoire/LecteurMarkdown.tsx')
  assert.match(c, /<thead className="max-md:sr-only">/)
  assert.match(c, /data-colonne=\{titreColonne\(table\.entetes\[k\]\)\}/)
  assert.match(c, /max-md:before:content-\[attr\(data-colonne\)\]/)
})
