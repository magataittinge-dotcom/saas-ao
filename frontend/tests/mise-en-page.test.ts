// 1.11 — Mise en page : les barres d'action des étapes restent dans la colonne
// de contenu, la barre latérale s'ouvre par un bouton (plus au survol).
// S10 — au téléphone, la barre du bas tient sur une ligne (56 px) et ne recouvre rien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { lire, sansCommentaires } from './outils/sources'
import BarreEtape, { ActionsBarre, BilanBarre, BoutonSecondaire, BoutonSuite, MenuPlus } from '@/components/project/BarreEtape'

const ETAPES = [
  'src/routes/project/StepAnalysis.tsx',
  'src/routes/project/StepVerification.tsx',
  'src/routes/project/StepMemoire.tsx',
  'src/routes/project/StepExport.tsx',
]

// Les étapes dont la barre est migrée vers le composant commun (S10 : T1 = Analyse, T2 = les autres).
const ETAPES_MIGREES = ['src/routes/project/StepAnalysis.tsx']

test('les barres d\'action des étapes 3 à 6 sont collées au bas du contenu, pas en travers de l\'écran', () => {
  for (const f of ETAPES) {
    const code = sansCommentaires(lire(f))
    assert.ok(!code.includes('fixed bottom-0 left-0 right-0'), `${f} : barre fixe sur toute la largeur`)
    assert.ok(!code.includes('createPortal(bottomBar'), `${f} : barre rendue hors du contenu`)
    assert.ok(/sticky -bottom-5 z-30/.test(code) || /<BarreEtape[\s>]/.test(code), f)
  }
  // la règle commune, une seule fois : collée au bas de <main>, au-dessus du contenu
  const commun = sansCommentaires(lire('src/components/project/BarreEtape.tsx'))
  assert.match(commun, /sticky -bottom-5 z-30/)
})

test('S10 : chaque étape migrée passe par BarreEtape, sans barre collée écrite à la main', () => {
  for (const f of ETAPES_MIGREES) {
    const code = sansCommentaires(lire(f))
    assert.match(code, /<BarreEtape[\s>]/, f)
    assert.ok(!/sticky -?bottom-/.test(code), `${f} : une barre collée écrite à la main`)
  }
})

test('S10 : la barre du téléphone a une règle de hauteur (56 px), une seule ligne et une marge basse', () => {
  const commun = sansCommentaires(lire('src/components/project/BarreEtape.tsx'))
  assert.match(commun, /max-\[768px\]:h-14/, 'hauteur de 56 px')
  assert.match(commun, /max-\[768px\]:flex-nowrap/, 'une seule ligne')
  assert.match(commun, /mt-6/, 'marge de 24 px entre le contenu et la barre')
  assert.match(commun, /scrollPaddingBottom/, 'un champ qui prend le focus reste au-dessus de la barre')
  assert.match(commun, /export const HAUTEUR_BARRE_TEL = 56/)
})

test('S10 : rendu de la barre — une ligne, bouton principal court, boutons secondaires en icône avec aria-label', () => {
  const html = renderToStaticMarkup(
    h(BarreEtape, null,
      h(BilanBarre, { bureau: h('p', null, '8 exigences · 5 obligatoires'), tel: h('p', null, '8 exigences') }),
      h(ActionsBarre, null,
        h(BoutonSecondaire, { libelle: 'Retour', onClick: () => {} }),
        h(BoutonSuite, { etape: 'Pièces', onClick: () => {} }))),
  )
  assert.ok(html.includes('data-barre-etape'))
  assert.ok(html.includes('max-[768px]:h-14') && html.includes('max-[768px]:flex-nowrap'))
  assert.ok(html.includes('aria-label="Retour"'), 'le secondaire garde son nom accessible')
  assert.ok(html.includes('max-[768px]:h-11') && html.includes('max-[768px]:w-11'), 'cible de 44 px')
  assert.ok(html.includes('Étape suivante') && html.includes('>Suivant<') && html.includes('\u00a0: Pièces'), 'texte long sur ordinateur, court au téléphone')
  assert.equal((html.match(/signature-btn/g) ?? []).length, 1, 'un seul bouton principal')
  assert.ok(html.includes('8 exigences · 5 obligatoires') && html.includes('>8 exigences<'), 'bilan complet ou abrégé')
})

test('S10 : le menu « … » du téléphone est un bouton nommé, fermé au départ', () => {
  const html = renderToStaticMarkup(h(MenuPlus, { libelle: 'Autres formats' }, () => h('button', null, 'Mémoire PDF')))
  assert.ok(html.includes('aria-label="Autres formats"') && html.includes('aria-haspopup="menu"') && html.includes('aria-expanded="false"'))
  assert.ok(!html.includes('Mémoire PDF'), 'les sorties ne s\'affichent qu\'à l\'ouverture')
  assert.ok(html.includes('max-[768px]:block') && html.includes('hidden'), 'visible seulement au téléphone')
})

test('la barre d\'icônes est fixe et flottante : rien ne s\'ouvre au survol, le contenu ne saute pas', () => {
  const code = sansCommentaires(lire('src/components/layout/Sidebar.tsx'))
  assert.ok(!code.includes('hoverExpanded'))
  assert.ok(!/onMouseEnter/.test(code))
  assert.match(code, /fixed bottom-4 left-4 top-4/)
})
