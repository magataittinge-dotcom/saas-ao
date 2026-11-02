// « Relire mon mémoire » (phase F) — la liste courte, ses mots positifs, ses liens vers la partie du mémoire et vers le dossier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ListeRelecture } from '@/components/memoire/RelectureMemoire'
import { allerALAncre, resumeRelecture, type ReponseRelecture } from '@/lib/relectureMemoire'
import { SECTIONS_MEMOIRE } from '@/lib/memoireSections'
import { lire, sansCommentaires } from './outils/sources'

const RIEN = () => {}
const rendre = (d: ReponseRelecture) => renderToStaticMarkup(<MemoryRouter><ListeRelecture donnees={d} onAller={RIEN} onSource={RIEN} /></MemoryRouter>)

const DONNEES: ReponseRelecture = {
  nombre: 3, message: null, pages_estimees: 12, limite_pages: null,
  lignes: [
    { type: 'sous_critere', libelle: 'À couvrir', texte: 'Gestion des déchets (inventé)', detail: 'Valeur technique', ancre: 'sec-dechets', section: 'Partie B · 6. Traitement des déchets', source: { type: 'champ', document: 'RC.pdf', page: 7, excerpt: null } },
    { type: 'a_completer', libelle: 'À compléter', texte: 'Raison sociale, page de garde', detail: null, ancre: null, section: null, source: null, nombre: 1, lien: '/company?rubrique=identite' },
    { type: 'dtu', libelle: 'Hors liste autorisée', texte: 'DTU 52.2', detail: null, ancre: 'sec-methodologie', section: 'Partie C · 1. Méthodologie détaillée', source: null },
  ],
}

test('la liste : une ligne par point, mots positifs, jamais de mot négatif', () => {
  const html = rendre(DONNEES)
  assert.equal((html.match(/data-ligne=/g) ?? []).length, 3)
  for (const mot of ['À couvrir', 'À compléter', 'Hors liste autorisée']) assert.ok(html.includes(mot), mot)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('chaque ligne renvoie à sa partie du mémoire ; « Voir dans le dossier » seulement avec une source', () => {
  const html = rendre(DONNEES)
  assert.equal((html.match(/Aller à : /g) ?? []).length, 2)               // la ligne de la page de garde n'a pas de partie
  assert.equal((html.match(/Voir dans le dossier/g) ?? []).length, 1)     // une seule ligne a une source
  assert.match(html, /href="\/company\?rubrique=identite"/)
})

test('tout va bien : une phrase sobre, aucune liste', () => {
  const html = rendre({ lignes: [], nombre: 0, message: 'Le mémoire nomme chaque sous-critère.', pages_estimees: 10, limite_pages: null })
  assert.match(html, /Le mémoire nomme chaque sous-critère\./)
  assert.doesNotMatch(html, /data-ligne=/)
})

test('le résumé du bouton', () => {
  assert.equal(resumeRelecture(null), 'Relire mon mémoire')
  assert.equal(resumeRelecture({ nombre: 0 }), 'Relu : rien à reprendre')
  assert.equal(resumeRelecture({ nombre: 1 }), '1 point à reprendre')
  assert.equal(resumeRelecture({ nombre: 4 }), '4 points à reprendre')
})

test('allerALAncre : défile jusqu’à l’ancre, false si elle n’existe pas', () => {
  const vus: string[] = []
  const doc = { getElementById: (id: string) => (id === 'sec-dechets' ? ({ scrollIntoView: () => vus.push(id) } as unknown as HTMLElement) : null) }
  assert.equal(allerALAncre('sec-dechets', doc, 'auto'), true)
  assert.equal(allerALAncre('sec-inconnue', doc, 'auto'), false)
  assert.equal(allerALAncre(null, doc, 'auto'), false)
  assert.deepEqual(vus, ['sec-dechets'])
})

test('les ancres du serveur sont celles de l’écran du mémoire (sec-<clé> et préambule)', () => {
  const ecran = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(ecran, /id="preambule"/)
  assert.match(ecran, /id=\{`sec-\$\{key\}`\}/)
  assert.ok(SECTIONS_MEMOIRE.length >= 25)    // les clés sont comparées à celles du serveur dans test_relecture_memoire.py
})

test('l’écran du mémoire n’ajoute que le bouton', () => {
  const ecran = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(ecran, /import RelectureMemoire from '@\/components\/memoire\/RelectureMemoire'/)
  assert.match(ecran, /<RelectureMemoire projectId=\{project\.id\} \/>/)
})
