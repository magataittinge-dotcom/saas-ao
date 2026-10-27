// « Voir dans le DCE » : ce que montre le panneau selon le niveau de l'ancre et le format de la
// pièce (rendu statique, données inventées). Les images, pdf.js et les mesures à l'écran sont
// vérifiés par les captures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PanneauSourceVue } from '@/components/project/source/PanneauSource'
import { reponseDeChamp, type ReponseSource } from '@/lib/ancre'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const base = (sur: Partial<ReponseSource> = {}): ReponseSource => ({
  version: 1, doc_id: 'd1', page: 7, rotation: 0, rects: [[0.1, 0.2, 0.6, 0.25]], niveau: 'passage',
  citation: {
    avant: 'Les menuiseries seront livrées avec leurs vitrages.',
    passage: 'Le titulaire fournit les fiches techniques de tous les produits.',
    apres: 'Elles sont remises avant le démarrage.',
  },
  cadrage: [0, 0.1, 1, 0.4],
  document: { nom: 'cctp.pdf', url: '/api/files/view/a', origine: '/api/files/view/a', expire_dans: 900 },
  ...sur,
})

const rendre = (reponse: ReponseSource | null, sur: Partial<Parameters<typeof PanneauSourceVue>[0]> = {}) =>
  renderToStaticMarkup(
    <PanneauSourceVue
      exigenceId="e1" nombrePages={48} etat={reponse ? 'pret' : 'chargement'} reponse={reponse}
      onReessayer={() => {}} onFermer={() => {}} {...sur}
    />,
  )

const MOTS_INTERDITS = /manquant|incompl[eè]t|\babsente?s?\b|!/i
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ')

test('passage : citation (avant, passage surligné, après), loupe, trois onglets, Passage choisi', () => {
  const html = rendre(base())
  assert.ok(html.includes('<mark>Le titulaire fournit les fiches techniques de tous les produits.</mark>'), html)
  assert.ok(html.includes('Les menuiseries seront livrées') && html.includes('Elles sont remises'))
  assert.ok(html.includes('Passage retrouvé dans la page'))
  assert.ok(html.includes('page 7 sur 48'))
  assert.ok(html.includes('Sur la page') && html.includes('source-squelette'), 'la loupe est demandée au serveur')
  const onglets = [...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]])
  assert.deepEqual(onglets, [['Passage', 'true'], ['Page', 'false'], ['Document', 'false']])
  assert.ok(html.includes('Voir la page entière'), 'un toucher sur la loupe ouvre la vue Page')
})

test('la citation se lit aux lecteurs d\'écran : début et fin du passage annoncés, légende de la page', () => {
  const html = rendre(base())
  assert.ok(html.includes('aria-label="Passage cité"'))
  assert.ok(html.includes('Début du passage cité') && html.includes('Fin du passage cité'))
  assert.ok(html.includes('Texte exact de la page 7 · cctp.pdf'))
})

test('niveau « page » : pas de surlignage, « Page citée par l’analyse »', () => {
  const html = rendre(base({ niveau: 'page', rects: [], citation: null, cadrage: null }))
  assert.ok(html.includes('Page citée par l’analyse'), html)
  assert.ok(!html.includes('<mark>') && !html.includes('source-surligne'))
  assert.ok(html.includes('Sur la page'), 'la page citée reste montrée')
})

test('niveau « aucun » : texte positif sobre et lien vers la pièce, pas d’onglets', () => {
  const html = rendre(base({ niveau: 'aucun', page: null, rects: [], citation: null, cadrage: null }))
  assert.ok(html.includes('Cette exigence s’appuie sur la pièce dans son ensemble.'), html)
  assert.ok(html.includes('href="/api/files/view/a"') && html.includes('Ouvrir la pièce'))
  assert.ok(!html.includes('role="tab"'))
})

test('Word sans PDF converti : repli positif et lien vers la pièce déposée', () => {
  const html = rendre(base({
    niveau: 'aucun', page: null, rects: [], citation: null, cadrage: null,
    document: { nom: 'note.docx', url: null, origine: '/api/files/view/n.docx', expire_dans: 900 },
  }))
  assert.ok(html.includes('n’a pas d’aperçu à l’écran pour le moment'), html)
  assert.ok(html.includes('href="/api/files/view/n.docx"'))
  assert.ok(!html.includes('role="tab"'))
})

test('Word converti : la même chaîne que le PDF, le nom est celui du Word', () => {
  const html = rendre(base({ document: { nom: 'note.docx', url: '/api/files/view/n.pdf', origine: '/api/files/view/n.docx', expire_dans: 900 } }))
  assert.ok(html.includes('note.docx') && html.includes('role="tab"'))
  assert.ok(html.includes('href="/api/files/view/n.pdf#page=7"'), 'ouvre le PDF converti à la page citée')
})

test('PDF sans aperçu Document : deux onglets seulement', () => {
  const html = rendre(base({ document: { nom: 'x.pdf', url: null, origine: null, expire_dans: 900 } }))
  assert.equal([...html.matchAll(/role="tab"/g)].length, 2)
})

test('format tableur : aiguillé vers la vue de TAB ; sans elle, un texte positif', () => {
  const tableur = base({ format: 'tableur', niveau: 'passage' })
  const branche = rendre(tableur, { rendreTableur: (r) => <p data-test="tab">DPGF {r.doc_id}</p> })
  assert.ok(branche.includes('<p data-test="tab">DPGF d1</p>'), branche)
  assert.ok(!branche.includes('<mark>'))
  const repli = rendre(tableur)
  assert.ok(repli.includes('Cette pièce est un tableur'), repli)
})

test('format inconnu : texte positif, jamais une erreur', () => {
  const html = rendre(base({ format: 'schema-futur' }))
  assert.ok(html.includes('Cette exigence s’appuie sur la pièce') || html.includes('n’a pas d’aperçu'), html)
})

test('chargement et échec : dits en positif, « Réessayer » proposé', () => {
  assert.ok(rendre(null).includes('Recherche du passage dans la pièce'))
  const echec = rendre(null, { etat: 'echec' })
  assert.ok(echec.includes('n’a pas pu s’afficher') && echec.includes('Réessayer'))
})

test('source d’un champ du bandeau : extrait cité non surligné, pas de loupe, Passage et Document', () => {
  const r = reponseDeChamp({ id: 'd2', file_name: 'rc.pdf' }, { page: 3, excerpt: 'Remise des offres avant le 12 mars.' },
    { pdf: '/api/files/view/rc', origine: '/api/files/view/rc' })
  assert.equal(r.niveau, 'page')
  const html = rendre(r, { exigenceId: null })
  assert.ok(html.includes('Remise des offres avant le 12 mars.') && !html.includes('<mark>'))
  assert.ok(html.includes('Extrait cité par l’analyse') && html.includes('Page citée par l’analyse'))
  assert.ok(!html.includes('Sur la page'))
  assert.deepEqual([...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Passage', 'Document'])
  const sansPage = reponseDeChamp({ id: 'd2', file_name: 'rc.pdf' }, { page: null, excerpt: null }, { pdf: null, origine: '/o' })
  assert.equal(sansPage.niveau, 'aucun')
})

test('aucun texte du panneau ne dit « manquant », « incomplet », « absent » ni ne crie', () => {
  const cas = [
    rendre(base()), rendre(null), rendre(null, { etat: 'echec' }),
    rendre(base({ niveau: 'page', rects: [], citation: null })),
    rendre(base({ niveau: 'aucun', page: null, rects: [], citation: null })),
    rendre(base({ document: { nom: 'n.docx', url: null, origine: null, expire_dans: 900 }, niveau: 'aucun' })),
    rendre(base({ format: 'tableur' })), rendre(base({ format: 'x' })),
  ]
  for (const html of cas) assert.ok(!MOTS_INTERDITS.test(texte(html)), texte(html))
})

test('le panneau n’ajoute aucune couleur en dur : jetons seulement', () => {
  const fautes: string[] = []
  const fichiers = fichiersSource('src/components/project/source')
  for (const f of fichiers) {
    const code = sansCommentaires(lire(f))
    for (const m of code.matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g)) fautes.push(`${f} : ${m[0]}`)
  }
  assert.deepEqual(fautes, [])
})

test('vue Document : pdf.js lit par plages, sans pré-chargement ni flux complet (mesuré : le flux envoie le fichier en plus)', () => {
  const code = lire('src/components/project/source/VueDocument.tsx')
  assert.match(code, /disableAutoFetch:\s*true/)
  assert.match(code, /disableStream:\s*true/)
  assert.match(code, /rangeChunkSize:\s*65536/)
  assert.match(code, /renderTextLayer=\{false\}/, 'sans recherche : pas de couche de texte')
})
