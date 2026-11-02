// E3 — « Rédigée » / « À refaire » : un seul état par partie, choisi par le patron. Rien d'autre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocumentView } from '@/routes/project/StepMemoire'
import EtatPartieChoix from '@/components/memoire/EtatPartie'
import SommaireMemoire from '@/components/memoire/SommaireMemoire'
import { bilanARefaire, etatDe, etatsDuMemoire, LIBELLE_ETAT } from '@/lib/memoireEtats'
import { sommaireMemoire } from '@/lib/memoireSections'
import type { MemoireContent, Project } from '@/types'
import { lire } from './outils/sources'
import { textesAffiches } from './outils/textes'

const CONTENU = {
  preambule: 'Préambule.',
  partie_a: { implantation: 'Caen.' },
  partie_b: { dechets: 'Tri sélectif.', securite: 'Prévention.' },
  partie_c: { delai: 'Quatre mois.' },
  _etat_sections: { 'partie_b.dechets': 'a_refaire' },
} as unknown as MemoireContent

test('par défaut une partie est « Rédigée » ; « À refaire » seulement si le patron l’a choisi', () => {
  const etats = etatsDuMemoire(CONTENU)
  assert.equal(etatDe(etats, 'partie_b', 'dechets'), 'a_refaire')
  assert.equal(etatDe(etats, 'partie_b', 'securite'), 'redigee')
  assert.equal(etatDe(undefined, 'partie_a', 'implantation'), 'redigee')
  assert.deepEqual(etatsDuMemoire(null), {})
  assert.deepEqual(Object.values(LIBELLE_ETAT), ['Rédigée', 'À refaire'])      // deux états, pas un de plus
})

test('le bilan compte les parties à refaire', () => {
  assert.equal(bilanARefaire({ 'partie_b.dechets': 'a_refaire' }), '1 partie à refaire')
  assert.equal(bilanARefaire({ a: 'a_refaire', b: 'a_refaire' }), '2 parties à refaire')
  assert.equal(bilanARefaire({}), null)
})

test('le choix d’état a deux boutons exclusifs, l’état courant est marqué', () => {
  const html = renderToStaticMarkup(<EtatPartieChoix titre="Déchets" etat="a_refaire" onChange={() => {}} />)
  assert.equal((html.match(/<button/g) ?? []).length, 2)
  assert.match(html, /data-etat="redigee"[^>]*>Rédigée|aria-pressed="false"[^>]*data-etat="redigee"/)
  assert.match(html, /aria-pressed="true"[^>]*data-etat="a_refaire"/)
  assert.match(html, /aria-label="État de la partie Déchets"/)
})

test('chaque partie rédigée porte son choix d’état dans le document', () => {
  const html = renderToStaticMarkup(
    <DocumentView content={CONTENU} project={{ name: 'AO' } as Project} docRef={{ current: null }}
      etats={etatsDuMemoire(CONTENU)} onEtat={() => {}} />)
  assert.equal((html.match(/memoire-etat/g) ?? []).length, 4)
  assert.equal((html.match(/aria-pressed="true"[^>]*data-etat="a_refaire"/g) ?? []).length, 1)
  assert.equal((html.match(/aria-pressed="true"[^>]*data-etat="redigee"/g) ?? []).length, 3)
})

test('le sommaire repère les parties à refaire', () => {
  const html = renderToStaticMarkup(
    <SommaireMemoire entrees={sommaireMemoire(CONTENU as never)} activeSection="preambule" onNavigate={() => {}}
      etats={etatsDuMemoire(CONTENU)} />)
  assert.match(html, /1 partie à refaire/)
  assert.equal((html.match(/memoire-a-refaire/g) ?? []).length, 1)
})

test('aucune colonne de gestion : ni responsable, ni échéance, ni rôle, ni statut multiple', () => {
  const textes = ['src/components/memoire/EtatPartie.tsx', 'src/lib/memoireEtats.ts']
    .flatMap((f) => textesAffiches(f)).map((t) => t.texte.toLowerCase())
  for (const t of textes) assert.doesNotMatch(t, /responsable|échéance|echeance|assign|rôle|en cours|validé|relu/)
  const code = lire('src/lib/memoireEtats.ts')
  assert.match(code, /type EtatPartie = 'redigee' \| 'a_refaire'/)
})

test('aucun mot négatif ni point d’exclamation dans les états', () => {
  const fautes = ['src/components/memoire/EtatPartie.tsx', 'src/lib/memoireEtats.ts']
    .flatMap((f) => textesAffiches(f)).filter((t) => /manquant|incompl|absent|!/i.test(t.texte))
  assert.deepEqual(fautes, [])
})
