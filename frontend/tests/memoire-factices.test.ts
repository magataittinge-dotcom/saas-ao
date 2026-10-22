// 1.3 — Plus aucun contenu factice dans le mémoire ni au dépôt ; le Compagnon
// ne dit que des faits calculés sur le texte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compterMots, referencesRetrouvees, sectionsBreves, type SectionMemoire } from '@/lib/memoireControles'
import type { MemoireContent } from '@/types'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('aucun texte factice dans le code : suggestions, logo, référence, page, signature, intégrité', () => {
  const factices = [
    "Vous n'avez cité que 2 projets", 'chevauchement complexe en semaine 4', 'trop générique',
    '50-60', 'MT-SYN', '>LOGO<', 'LOGO\n', 'Synorix BTP SaaS', 'Page 1', 'Synorix Trust',
    'Signé numériquement', "vérifiés pour l'intégrité", 'DEFAULT_SUGGESTIONS', 'Focus IA',
  ]
  for (const f of fichiersSource()) {
    const code = sansCommentaires(lire(f))
    for (const t of factices) assert.ok(!code.includes(t), `${f} contient « ${t.trim()} »`)
  }
})

const contenu = (partieA: Record<string, string>, partieB: Record<string, string> = {}): MemoireContent =>
  ({ preambule: 'Préambule du mémoire.', partie_a: partieA, partie_b: partieB, partie_c: {} }) as unknown as MemoireContent

const SECTIONS: SectionMemoire[] = [
  { part: 'partie_a', cle: 'references', titre: '10. Références chantiers' },
  { part: 'partie_a', cle: 'fournisseurs', titre: '11. Fournisseurs' },
  { part: 'partie_b', cle: 'demarrage', titre: '1. Démarrage du chantier' },
]

test('compterMots ignore la mise en forme Markdown', () => {
  assert.equal(compterMots('## Titre\n\n- **un** mot, *deux* — trois'), 5)
  assert.equal(compterMots(''), 0)
})

test('sections brèves : seulement les sections rédigées sous le seuil, avec leur nombre de mots', () => {
  const long = Array.from({ length: 120 }, (_, i) => `mot${i}`).join(' ')
  const c = contenu({ references: long, fournisseurs: 'Trois fournisseurs locaux.' }, { demarrage: '' })
  assert.deepEqual(sectionsBreves(c, SECTIONS), [
    { part: 'partie_a', cle: 'fournisseurs', titre: '11. Fournisseurs', mots: 3 },
  ])
})

test('références : retrouvées telles quelles, sans tenir compte des accents, de la casse ni de la ponctuation', () => {
  const c = contenu({ references: '- Réhabilitation de 24 logements — Reims (2024)\n- Façade école Jean-Jaurès' })
  const refs = [
    { id: '1', intitule: 'REHABILITATION DE 24 LOGEMENTS - REIMS' },
    { id: '2', intitule: 'Façade école Jean Jaurès' },
    { id: '3', intitule: 'Gymnase municipal de Tinqueux' },
    { id: '4', intitule: 'Reims' }, // mot isolé : retrouvé seulement en entier
  ]
  const { retrouvees, nonRetrouvees } = referencesRetrouvees(c, refs)
  assert.deepEqual(retrouvees.map((r) => r.id), ['1', '2', '4'])
  assert.deepEqual(nonRetrouvees.map((r) => r.id), ['3'])
})
