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

test('Export, exigences relevées : la case du système (rangée de 44 px, toute la rangée est la cible), source sous le texte', () => {
  const c = code('src/components/project/ExigencesDuDossier.tsx')
  // jury, tour 1 : plus de case native ni de bouton maison ; la case, le bouton et le repli sont ceux du système
  assert.match(c, /<CaseACocher/)
  assert.doesNotMatch(c, /<input|<button|glass-btn|uppercase|style=\{\{/)
  assert.match(code('src/components/ui/case.tsx'), /min-h-11/)
  assert.match(c, /<span className=\{`mt-0\.5 block text-xs/)
  assert.match(c, /<Bouton variante="secondaire" disabled=\{enCours\} onClick=\{onConfirmerTout\}>Tout confirmer<\/Bouton>/)
})

test('coquille : liens du pied de page et fil d’Ariane à 44 px ; dans un AO, la barre du haut garde deux actions', () => {
  assert.match(code('src/components/layout/LegalFooter.tsx'), /max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-2\.5/)
  assert.match(code('src/components/ui/sheet.tsx'), /size-10 place-items-center max-\[768px\]:size-11/)
  assert.match(lire('src/styles/pieces.css'), /@media \(max-width: 768px\), \(pointer: coarse\) \{\s*\.piece-note, \.carte-ao-30s__libelle \{ font-size: var\(--taille-12\); \}/)
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
    assert.match(code(f), /max-md:-my-3 max-md:py-3[^"]*"><span className="line-clamp-2">/)
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

test('notifications dans le tiroir du compte : le panneau est calé sur le bord droit du tiroir (il sortait par la gauche à 360 px)', () => {
  assert.match(code('src/components/layout/NotificationBell.tsx'), /versLeHaut \? 'bottom-full -right-12 mb-2'/)
})

test('pied de page du site public : liens élargis au téléphone ; croix d’une puce de filtre qui ne rétrécit pas', () => {
  assert.match(code('src/components/public/CoquillePublique.tsx'), /hover:underline max-md:px-2\.5 \[@media\(pointer:coarse\)\]:min-h-11/)
  assert.match(code('src/components/ui/filtre.tsx'), /grid size-11 shrink-0 place-items-center rounded-r-pilule/)
})

test('téléphone couché (844 × 390, mise en page du bureau) : les champs restent à 16 px sur un écran tactile', () => {
  assert.match(code('src/components/ui/champ.tsx'), /max-\[768px\]:text-saisie \[@media\(pointer:coarse\)\]:text-saisie/)
  assert.match(code('src/components/ui/command.tsx'), /\[@media\(pointer:coarse\)\]:text-saisie/)
  assert.match(code('src/lib/clerkApparence.ts'), /\[@media\(pointer:coarse\)\]:!text-saisie/)
})

test('fil des étapes au téléphone : le nom de l’étape en cours est posé sous le rond, hors du flux (il ne chevauche plus le rond voisin)', () => {
  const c = code('src/components/project/StepProgress.tsx')
  assert.match(c, /'sm:contents max-sm:absolute max-sm:top-full max-sm:flex max-sm:flex-col'/)
  assert.match(c, /index === 0 \? 'max-sm:left-0 max-sm:items-start' : index === STEPS\.length - 1 \? 'max-sm:right-0 max-sm:items-end'/)
  assert.match(c, /data-fil-etapes="" className="pb-6 max-sm:pb-10"/)
})

test('téléphone couché (mise en page du bureau, écran tactile) : fil d’Ariane, pied de page, titres d’AO et « Tout confirmer » à 44 px', () => {
  assert.match(code('src/components/layout/Header.tsx'), /\[@media\(pointer:coarse\)\]:min-h-11/)
  assert.match(code('src/components/layout/LegalFooter.tsx'), /\[@media\(pointer:coarse\)\]:px-2\.5 \[@media\(pointer:coarse\)\]:inline-flex \[@media\(pointer:coarse\)\]:min-h-11/)
  assert.match(code('src/components/project/ExigencesDuDossier.tsx'), /<Bouton variante="secondaire"[^>]*>Tout confirmer/)   // le bouton du système : 44 px partout
  for (const f of ['src/components/mesao/LigneAO.tsx', 'src/components/dashboard/BandeAO.tsx']) {
    assert.match(code(f), /max-md:py-3 \[@media\(pointer:coarse\)\]:-my-3 \[@media\(pointer:coarse\)\]:py-3/)
  }
})
