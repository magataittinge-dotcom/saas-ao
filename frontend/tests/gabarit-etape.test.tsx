// Le gabarit d'une étape (GabaritEtape, BandeResume, SectionEtape, EtatElement) : une seule action principale,
// le résumé en cartes égales, les sections en capitales, l'état en petit. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import {
  GabaritEtape, BandeResume, SectionEtape, EtatElement, BarreEtape, ActionsBarreTel, BoutonSuite,
} from '@/components/etape'
import { lire } from './outils/sources'

const CARTES = [
  { libelle: 'Pièces prêtes', valeur: '12', etat: 'pret' as const, jauge: { rempli: 12, total: 19 }, detail: 'sur 19 demandées' },
  { libelle: 'À joindre', valeur: '4', etat: 'a-verifier' as const },
  { libelle: 'À renouveler', valeur: '3' },
]

const page = (props: Partial<Parameters<typeof GabaritEtape>[0]> = {}) => renderToStaticMarkup(
  <MemoryRouter>
    <GabaritEtape
      titre="Plan du mémoire"
      utilite="Choisissez l'ordre des parties avant de rédiger."
      actionPrincipale={<button type="button" className="signature-btn">Valider le plan</button>}
      actionsSecondaires={<button type="button">Imprimer</button>}
      resume={<BandeResume cartes={CARTES} />}
      {...props}
    >
      <SectionEtape titre="Ce que le règlement note" colonnes={2}><p>Première colonne</p><p>Seconde colonne</p></SectionEtape>
      <SectionEtape titre="Vos parties"><p>Une partie</p></SectionEtape>
    </GabaritEtape>
  </MemoryRouter>,
)

test("l'en-tête porte le titre, une ligne d'utilité et une seule action principale", () => {
  const h = page()
  assert.match(h, /<h2[^>]*>Plan du mémoire<\/h2>/)
  assert.match(h, /Choisissez l(&#x27;|')ordre des parties avant de rédiger\./)
  assert.equal((h.match(/data-action-principale/g) ?? []).length, 1)
  assert.equal((h.match(/signature-btn/g) ?? []).length, 1)
})

test('le résumé rend une carte par fait, avec pastille, jauge et détail', () => {
  const h = page()
  assert.equal((h.match(/data-carte-resume/g) ?? []).length, 3)
  assert.match(h, /Pièces prêtes/)
  assert.match(h, /pill-vert[^>]*>Prêt</)
  assert.match(h, /pill-ambre[^>]*>À vérifier</)
  assert.match(h, /role="progressbar"[^>]*aria-valuenow="12"[^>]*aria-valuemax="19"|aria-valuemax="19"[^>]*aria-valuenow="12"/)
  assert.match(h, /sur 19 demandées/)
  // la carte neutre n'a aucune pastille
  assert.equal((h.match(/class="pill /g) ?? []).length, 2)
})

test('trois cartes : trois colonnes ; quatre cartes : 2 puis 4 colonnes ; une colonne au téléphone', () => {
  const trois = renderToStaticMarkup(<BandeResume cartes={CARTES} />)
  assert.match(trois, /md:grid-cols-3/)
  const quatre = renderToStaticMarkup(<BandeResume cartes={[...CARTES, { libelle: 'Total', valeur: '19' }]} />)
  assert.match(quatre, /sm:grid-cols-2 lg:grid-cols-4/)
  assert.doesNotMatch(trois, /(^|\s)grid-cols-[2-9]/)
  assert.equal(renderToStaticMarkup(<BandeResume cartes={[]} />), '')
})

test('les sections ont un sous-titre en capitales (h3) et choisissent leurs colonnes', () => {
  const h = page()
  assert.equal((h.match(/data-section-etape/g) ?? []).length, 2)
  assert.match(h, /<h3[^>]*uppercase[^>]*>Ce que le règlement note<\/h3>/)
  assert.match(h, /md:grid-cols-2/)
  const une = renderToStaticMarkup(<SectionEtape titre="Seule"><p>x</p></SectionEtape>)
  assert.doesNotMatch(une, /md:grid-cols-2/)
})

test("l'état d'un élément dit un mot, pas seulement une couleur, puis sa source", () => {
  const voir = () => undefined
  const pret = renderToStaticMarkup(<EtatElement etat="pret" source={{ libelle: 'RC · page 4', onVoir: voir }} />)
  assert.match(pret, /data-etat="pret"/)
  assert.match(pret, />Prêt</)
  assert.match(pret, /Source : RC · page 4/)
  assert.match(pret, /Voir dans le dossier/)
  assert.match(renderToStaticMarkup(<EtatElement etat="a-verifier" />), />À vérifier</)
  assert.match(renderToStaticMarkup(<EtatElement etat="a-couvrir" />), />À couvrir</)
  // sans fonction : la source s'écrit, aucun bouton
  const sans = renderToStaticMarkup(<EtatElement etat="pret" source={{ libelle: 'CCAP · page 2' }} />)
  assert.match(sans, /Source : CCAP · page 2/)
  assert.doesNotMatch(sans, /<button/)
})

test("avec une barre, l'action de l'en-tête s'efface au téléphone ; sans barre, elle reste", () => {
  const avec = page({ barre: <BarreEtape><ActionsBarreTel><BoutonSuite etape="Plan" onClick={() => undefined} /></ActionsBarreTel></BarreEtape> })
  assert.match(avec, /data-action-principale="" class="[^"]*max-\[768px\]:hidden/)
  assert.match(avec, /data-barre-etape/)
  assert.match(avec, /hidden[^"]*max-\[768px\]:flex/)
  assert.doesNotMatch(page(), /data-action-principale="" class="[^"]*max-\[768px\]:hidden/)
})

test('au téléphone : une colonne, boutons de l’en-tête pleine largeur, aucune couleur écrite dans le JSX', () => {
  const h = page()
  assert.match(h, /max-\[768px\]:w-full/)
  for (const f of ['GabaritEtape', 'BandeResume', 'SectionEtape', 'EtatElement']) {
    const src = lire(`src/components/etape/${f}.tsx`)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/, `${f} : une couleur écrite en dur`)
  }
})
