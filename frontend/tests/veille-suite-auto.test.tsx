// DEFIL T2 — la suite des avis se charge en bas de la liste : bouton « Afficher plus » + chargement automatique quand le bouton
// entre dans la zone visible (IntersectionObserver, racine = le conteneur qui défile). Les avis sont inventés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ListeAvis, { ancetreDefilant, creerDeclencheurSuite, observerSuite, type PropsListeAvis } from '@/components/veille/ListeAvis'
import { FILTRES_PAR_DEFAUT } from '@/lib/veille'
import { lire, sansCommentaires } from './outils/sources'
import type { AvisVeille } from '@/services/veille'

const avis = (id: string): AvisVeille => ({
  id, id_boamp: `SIM-${id}`, objet: `Réhabilitation d'un groupe scolaire ${id} (exemple)`, acheteur: 'Commune de Valmont-sur-Exemple',
  departements: ['69'], date_parution: '2026-10-30', date_limite: '2026-12-15', procedure: 'adaptee', procedure_libelle: 'Procédure adaptée',
  famille: 'Travaux', metiers: ['cvc'], url_avis: 'https://exemple.invalid/avis/1', url_dossier: null, nouveau: false,
})
const base = (p: Partial<PropsListeAvis> = {}): PropsListeAvis => ({
  avis: [], total: 0, zoneVide: false, filtres: FILTRES_PAR_DEFAUT, onFiltres: () => {}, tri: 'date_limite', onTri: () => {}, metiers: [],
  nomsDepartements: { '69': 'Rhône' }, aPlus: false, onVoirPlus: () => {}, peutElargir: true, onElargir: () => {}, onCreerAO: () => {}, ...p,
})

test('le bouton s’appelle « Afficher plus » (plus aucun « Voir plus »), reste un vrai bouton et se désactive pendant le chargement', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 40, aPlus: true })} />)
  assert.ok(html.includes('>Afficher plus<') && !html.includes('Voir plus'))
  assert.ok(/<button[^>]*data-suite[^>]*>Afficher plus<\/button>/.test(html) || /<button[^>]*>Afficher plus<\/button>/.test(html))
  assert.ok(!/<button[^>]*data-suite[^>]*disabled/.test(html), 'actif au repos')
  const en = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 40, aPlus: true, chargePlus: true })} />)
  assert.ok(/<button[^>]*disabled[^>]*>Chargement…<\/button>/.test(en))
  assert.ok(!sansCommentaires(lire('src/components/veille/ListeAvis.tsx')).includes('Voir plus'))
})

test('un seul chargement même si l’observateur se déclenche plusieurs fois, y compris pendant un chargement', () => {
  let etat = { aPlus: true, chargePlus: false }
  let appels = 0
  const d = creerDeclencheurSuite(() => etat, () => { appels += 1 })
  d.demander(); d.demander(); d.demander()
  assert.equal(appels, 1, 'trois déclenchements dans le même instant : un seul chargement')
  etat = { aPlus: true, chargePlus: true }
  d.demander()
  assert.equal(appels, 1, 'pendant le chargement : rien')
  etat = { aPlus: true, chargePlus: false }
  d.relacher()
  d.demander()
  assert.equal(appels, 2, 'la page suivante est arrivée : un nouveau chargement est permis')
  etat = { aPlus: false, chargePlus: false }
  d.relacher(); d.demander()
  assert.equal(appels, 2, 'plus de suite côté serveur : rien')
})

test('l’observateur : racine = le conteneur qui défile, déclenchement seulement quand le bouton entre dans la zone visible, nettoyage', () => {
  const vus: { racine: unknown; options: Record<string, unknown>; cibles: unknown[]; fin: number; rappel: (e: { isIntersecting: boolean }[]) => void }[] = []
  class Faux {
    cibles: unknown[] = []; fin = 0
    constructor(public rappel: (e: { isIntersecting: boolean }[]) => void, public options: Record<string, unknown>) { vus.push(this as never) }
    observe(c: unknown) { this.cibles.push(c) }
    disconnect() { this.fin += 1 }
  }
  const racine = { nom: 'main' } as unknown as Element
  const bouton = { nom: 'bouton' } as unknown as Element
  let n = 0
  const fin = observerSuite(bouton, racine, () => { n += 1 }, Faux as unknown as typeof IntersectionObserver)
  assert.ok(fin)
  assert.equal(vus.length, 1)
  assert.equal(vus[0].options.root, racine)
  assert.deepEqual(vus[0].cibles, [bouton])
  vus[0].rappel([{ isIntersecting: false }]); assert.equal(n, 0, 'hors zone : rien')
  vus[0].rappel([{ isIntersecting: true }]); assert.equal(n, 1, 'dans la zone : charge')
  fin!(); assert.equal(vus[0].fin, 1, 'nettoyé au démontage')
})

test('sans IntersectionObserver (rendu serveur, vieux navigateur) : pas d’erreur, le bouton reste le repli', () => {
  assert.equal(observerSuite({} as Element, null, () => {}, undefined), null)
  assert.equal(observerSuite({} as Element, null, () => {}, null), null)
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 40, aPlus: true })} />)
  assert.ok(html.includes('Afficher plus'), 'rendu serveur sans observateur')
})

test('le conteneur qui défile est le plus proche ancêtre en overflow auto ou scroll (null = la fenêtre)', () => {
  const main = { overflow: 'auto', parentElement: null } as { overflow: string; parentElement: unknown }
  const bloc = { overflow: 'visible', parentElement: main }
  const bouton = { overflow: 'visible', parentElement: bloc }
  const lireOverflow = (e: Element) => (e as unknown as { overflow: string }).overflow
  assert.equal(ancetreDefilant(bouton as unknown as Element, lireOverflow), main)
  const nu = { overflow: 'visible', parentElement: { overflow: 'hidden', parentElement: null } }
  assert.equal(ancetreDefilant(nu as unknown as Element, lireOverflow), null)
})
