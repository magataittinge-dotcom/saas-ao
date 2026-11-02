// E1 — le sommaire du mémoire montre, pour chaque partie, les sous-critères du RC qu'elle traite,
// et « À couvrir » pour ceux qu'aucune partie ne traite (critères et textes inventés).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import SommaireMemoire from '@/components/memoire/SommaireMemoire'
import { sommaireMemoire } from '@/lib/memoireSections'
import { bilanCriteres, libelleSousCritere, parSection, type RattachementCriteres } from '@/lib/memoireCriteres'
import type { MemoireContent } from '@/types'
import { textesAffiches } from './outils/textes'

const CONTENU = {
  preambule: 'Préambule.',
  partie_a: { roles_missions: 'Le chef de chantier encadre l’équipe.' },
  partie_b: { dechets: 'Les déchets sont triés.' },
  partie_c: { effectifs: 'Quatre compagnons.' },
} as unknown as MemoireContent

const RATTACHEMENT: RattachementCriteres = {
  sous_criteres: [
    { critere: 'Valeur technique', nom: 'Équipe affectée', poids: 15, sections: ['partie_a.roles_missions', 'partie_c.effectifs'], traite: true },
    { critere: 'Valeur technique', nom: 'Gestion des déchets', poids: 5, sections: ['partie_b.dechets'], traite: true },
    { critere: 'Valeur technique', nom: 'Interfaces entre corps d’état', poids: 10, sections: [], traite: false },
  ],
  a_couvrir: [{ critere: 'Valeur technique', nom: 'Interfaces entre corps d’état', poids: 10 }],
}

const rendre = (props: Partial<Parameters<typeof SommaireMemoire>[0]> = {}) =>
  renderToStaticMarkup(
    <SommaireMemoire
      entrees={sommaireMemoire(CONTENU as never)} activeSection="preambule" onNavigate={() => {}}
      criteres={RATTACHEMENT} {...props} />)

test('le libellé d’un sous-critère porte son poids', () => {
  assert.equal(libelleSousCritere('Moyens humains', 10), 'Moyens humains · 10 %')
  assert.equal(libelleSousCritere('Moyens humains', null), 'Moyens humains')
})

test('parSection range les sous-critères sous chaque partie qui les traite', () => {
  const p = parSection(RATTACHEMENT)
  assert.deepEqual(p['partie_c.effectifs'].map((s) => s.nom), ['Équipe affectée'])
  assert.deepEqual(p['partie_b.dechets'].map((s) => s.nom), ['Gestion des déchets'])
  assert.equal(p['partie_a.activites'], undefined)
  assert.deepEqual(parSection(null), {})
})

test('le bilan compte les sous-critères traités', () => {
  assert.equal(bilanCriteres(RATTACHEMENT), '2 sur 3 sous-critères du règlement traités')
  assert.equal(bilanCriteres({ sous_criteres: [], a_couvrir: [] }), null)
  assert.equal(bilanCriteres(null), null)
})

test('le sommaire affiche, sous chaque section, les sous-critères qu’elle traite avec leur poids', () => {
  const html = rendre().replace(/&#x27;/g, "'")
  assert.match(html, /Équipe affectée · 15&nbsp;%|Équipe affectée · 15 %/)
  assert.equal((html.match(/Équipe affectée/g) ?? []).length, 2)   // deux parties la traitent
  assert.match(html, /Gestion des déchets · 5/)
})

test('un sous-critère sans partie est « À couvrir » avec « Voir dans le dossier » quand la source est connue', () => {
  const sans = rendre()
  assert.match(sans, /À couvrir/)
  assert.match(sans, /Interfaces entre corps d(’|&#x27;)état · 10/)
  assert.doesNotMatch(sans, /Voir dans le dossier/)          // pas de source : pas de lien
  const avec = rendre({ sourceCriteres: { document: 'RC.pdf', page: 4, excerpt: 'x' }, onOpenSource: () => {} })
  assert.match(avec, /Voir dans le dossier/)
})

test('tout traité : le bilan le dit sans rien à couvrir', () => {
  const html = rendre({ criteres: { sous_criteres: RATTACHEMENT.sous_criteres.slice(0, 2), a_couvrir: [] } })
  assert.match(html, /2 sur 2 sous-critères du règlement traités/)
  assert.doesNotMatch(html, /À couvrir/)
})

test('sans lecture des critères, le sommaire reste celui du mémoire', () => {
  const html = rendre({ criteres: null })
  assert.doesNotMatch(html, /Critères du règlement|À couvrir/)
  assert.match(html, /Partie A/)
})

test('sur téléphone le sommaire est replié, avec le nombre de critères à couvrir', () => {
  const html = rendre({ repliable: true })
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /1 à couvrir/)
  assert.doesNotMatch(html, /Partie A/)                      // fermé : seul l'en-tête
})

test('aucun mot négatif ni point d’exclamation sur le sommaire des critères', () => {
  const textes = ['src/components/memoire/SommaireMemoire.tsx', 'src/lib/memoireCriteres.ts']
    .flatMap((f) => textesAffiches(f))
    .filter((t) => /manquant|incompl|absent|!/i.test(t.texte))
  assert.deepEqual(textes, [])
})
