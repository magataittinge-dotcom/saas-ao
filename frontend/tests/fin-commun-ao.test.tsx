// Jury, tour 1 (11/11/2026) — l'en-tête commun d'un AO (cité sur 27 écrans du lot b1 et sur tout le lot b2).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AplatCede, Bouton } from '@/components/ui/bouton'
import { Dialogue } from '@/components/ui/dialogue'
import EchecAction from '@/components/common/EchecAction'
import { gesteVisible } from '@/components/project/BarreEtape'
import { aoIntrouvable } from '@/routes/Project'
import { AOIntrouvable } from '@/components/public/EcransEtat'
import { MemoryRouter } from 'react-router-dom'
import { lire, sansCommentaires } from './outils/sources'

const projet = sansCommentaires(lire('src/routes/Project.tsx'))

test('remise passée : dite une seule fois (le bandeau, avec la date) ; la pastille de date ne s\'affiche pas en plus', () => {
  assert.match(projet, /const remisePassee = lecture\.etat === 'a_mettre_a_jour'/)
  assert.match(projet, /lecture\.echeance\.etat !== 'sans_date' && !remisePassee && \(\s*<PastilleEtat/)
  assert.match(projet, /Elle était fixée au \$\{jourRemise/)
})

test('remise passée : « Mettre à jour le statut » porte l\'aplat, l\'étape le lui cède (DESIGN.md : une seule action)', () => {
  assert.match(projet, /<Bouton variante=\{remisePassee \? 'principal' : 'secondaire'\}/)
  assert.match(projet, /<AplatCede\.Provider value=\{remisePassee\}>/)
  const cede = renderToStaticMarkup(<AplatCede.Provider value><Bouton variante="principal">Télécharger le dossier</Bouton></AplatCede.Provider>)
  assert.match(cede, /data-variante="secondaire"/)
  assert.match(cede, /data-aplat-cede=""/)
  assert.doesNotMatch(cede, /bg-accent-fill/)
  const garde = renderToStaticMarkup(<Bouton variante="principal">Télécharger le dossier</Bouton>)
  assert.match(garde, /data-variante="principal"/)
  // les autres variantes ne changent pas ; le bouton de la coquille non plus
  assert.match(renderToStaticMarkup(<AplatCede.Provider value><Bouton variante="danger">Retirer</Bouton></AplatCede.Provider>), /data-variante="danger"/)
  assert.match(renderToStaticMarkup(<AplatCede.Provider value><Bouton coquille variante="principal">Nouvel</Bouton></AplatCede.Provider>), /data-variante="principal"/)
})

test('un dialogue, un tiroir ouverts depuis une étape qui a cédé l\'aplat gardent le leur', () => {
  for (const f of ['src/components/ui/dialogue.tsx', 'src/components/ui/dialog.tsx', 'src/components/ui/sheet.tsx']) {
    assert.match(sansCommentaires(lire(f)), /<AplatCede\.Provider value=\{false\}>/, f)
  }
  assert.ok(Dialogue)
})

test('une alerte à la fois dans un AO : l\'alerte de l\'AO et le message de l\'étape ne s\'empilent pas (règle unique, index.css)', () => {
  const css = lire('src/index.css')
  assert.match(css, /\.page-ao:has\(\[data-message-etape\] \[data-message="erreur"\]\) \[data-alerte-ao\] \{ display: none; \}/)
  assert.match(css, /\.page-ao:has\(\[data-alerte-ao="attention"\]\) \[data-message-etape\]:not\(:has\(\[data-message="erreur"\]\)\) \{ display: none; \}/)
  assert.match(projet, /data-alerte-ao=\{remisePassee \? 'attention' : 'info'\}/)
  assert.match(sansCommentaires(lire('src/components/etape/GabaritEtape.tsx')), /data-message-etape=""/)
})

test('un échec d\'action est rouge, avec son icône : il ne se confond pas avec un avertissement', () => {
  const html = renderToStaticMarkup(<EchecAction message="Le dossier n’a pas pu être téléchargé." onReessayer={() => {}} />)
  assert.match(html, /data-message="erreur"/)
  assert.match(html, /role="alert"/)
  assert.match(html, /Réessayer/)
})

test('dans un AO, « Nouvel appel d\'offres » de la barre du haut est toujours au trait', () => {
  assert.match(sansCommentaires(lire('src/components/layout/Header.tsx')), /const auTrait = aplatsEcran > 0 \|\| Boolean\(idAO\)/)
})

test('AO introuvable : son écran (une phrase, une cause, pas de « Réessayer ») ; une panne garde l\'état d\'erreur', () => {
  assert.equal(aoIntrouvable({ response: { status: 404 } }), true)
  assert.equal(aoIntrouvable({ response: { status: 403 } }), true)
  assert.equal(aoIntrouvable({ response: { status: 500 } }), false)
  assert.equal(aoIntrouvable(new Error('Network Error')), false)
  assert.equal(aoIntrouvable(null), false)
  assert.match(projet, /aoIntrouvable\(requete\.error\) \? <AOIntrouvable \/>/)
  const html = renderToStaticMarkup(<MemoryRouter><AOIntrouvable /></MemoryRouter>)
  assert.doesNotMatch(html, /peut-être/)
  assert.doesNotMatch(html, /Réessayer/)
  assert.doesNotMatch(projet, /peut-être/)
})

test('la barre du bas d\'une étape se retire quand elle ne porte aucun geste visible', () => {
  const el = (boites: number) => ({ getClientRects: () => ({ length: boites }) })
  const barre = (els: ReturnType<typeof el>[]) => ({ querySelectorAll: () => els }) as unknown as HTMLElement
  assert.equal(gesteVisible(barre([])), false, 'un bilan seul')
  assert.equal(gesteVisible(barre([el(0), el(0)])), false, 'des actions réservées au téléphone, cachées sur ordinateur')
  assert.equal(gesteVisible(barre([el(0), el(1)])), true)
  assert.match(sansCommentaires(lire('src/components/project/BarreEtape.tsx')), /data-sans-geste=\{sansGeste \? '' : undefined\}/)
  assert.match(lire('src/index.css'), /\[data-barre-etape\]\[data-sans-geste\] \{ visibility: hidden; height: 0 !important;/)
})
