// B9 — les fichiers du dossier, contrôlés avant le dépôt (GET /projects/{id}/export/controle-fichiers) : des lignes
// « À relire », jamais bloquantes, chacune avec son fichier et sa source. Zéro ligne : rien à l'écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListeControleFichiers } from '@/components/project/ControleFichiers'
import { nomCourt, sourceControle, type LigneControle } from '@/lib/controleFichiers'
import { espacesFr } from '@/lib/espacesFr'
import { lire, sansCommentaires } from './outils/sources'

const REGLE = { type: 'regle' as const, texte: 'Prérequis techniques de la plateforme e-marchespublics.com (version du 25/09/2014), point 9', url: 'https://e-marchespublics.com/prerequis' }
const LIGNES: LigneControle[] = [
  { type: 'a_completer', libelle: 'À relire', fichier: 'Reponse_AO_essai/02_Offre/Memoire_technique.pdf',
    texte: '12 passages « [À COMPLÉTER » restent dans le mémoire : complétez-les à l’étape Rédiger avant le dépôt.',
    source: { type: 'memoire', fichier: 'Reponse_AO_essai/02_Offre/Memoire_technique.pdf' }, nombre: 12, pages: [] },
  { type: 'a_completer', libelle: 'À relire', fichier: 'Reponse_AO_essai/01_Candidature/DC1_essai.pdf',
    texte: '2 passages « [À COMPLÉTER » restent (pages 1, 3) : complétez-les avant le dépôt.',
    source: { type: 'fichier', fichier: 'Reponse_AO_essai/01_Candidature/DC1_essai.pdf' }, nombre: 2, pages: [1, 3] },
  { type: 'chemin', libelle: 'À relire', fichier: 'Reponse_AO_essai/01_Candidature/Un_nom_tres_long.pdf',
    texte: 'Chemin de 162 caractères : certaines plateformes n’acceptent pas plus de 150 caractères.', source: REGLE },
  { type: 'taille', libelle: 'À relire', fichier: null,
    texte: 'Le dossier pèse 14 Mo pour 10 Mo au plus selon le règlement : allégez les fichiers les plus lourds avant le dépôt.',
    source: { type: 'exigence', id: 'e1', document: 'RC', page: 12 }, octets: 14_000_000 },
]

test('le nom court d’un fichier : son dernier segment, jamais le chemin du ZIP', () => {
  assert.equal(nomCourt('Reponse_AO_essai/02_Offre/Memoire_technique.pdf'), 'Memoire_technique.pdf')
  assert.equal(nomCourt('seul.pdf'), 'seul.pdf')
  assert.equal(nomCourt(null), null)
})

test('chaque ligne a sa source : le fichier, la règle (avec son lien), l’exigence du règlement', () => {
  assert.deepEqual(sourceControle(LIGNES[0]), { libelle: 'votre mémoire technique, tel qu’il est rédigé', url: null })
  assert.deepEqual(sourceControle(LIGNES[1]), { libelle: 'le texte du fichier joint au dossier', url: null })
  assert.deepEqual(sourceControle(LIGNES[2]), { libelle: REGLE.texte, url: REGLE.url })
  assert.deepEqual(sourceControle(LIGNES[3]), { libelle: 'RC · page 12', url: null })
  assert.equal(sourceControle({ ...LIGNES[3], source: null }), null)
  // un lien qui n'est pas en https ne s'ouvre pas
  assert.equal(sourceControle({ ...LIGNES[2], source: { ...REGLE, url: 'javascript:alert(1)' } })?.url, null)
})

test('espaces insécables du français dans un texte du serveur', () => {
  assert.equal(espacesFr('« [À COMPLÉTER » restent : relisez ; prêt ?'), '« [À COMPLÉTER » restent : relisez ; prêt ?')
})

test('la liste : « À relire », le nom court, la phrase, la source ; jamais bloquant', () => {
  const html = renderToStaticMarkup(<ListeControleFichiers lignes={LIGNES} />)
  assert.match(html, /À relire/)
  assert.match(html, /4 points avant le dépôt/)
  assert.match(html, /Memoire_technique\.pdf/)
  assert.doesNotMatch(html, /Reponse_AO_essai\//, 'le chemin du ZIP ne s’affiche pas')
  assert.match(html, /Le dossier entier/)
  assert.match(html, /RC · page 12/)
  assert.match(html, /href="https:\/\/e-marchespublics\.com\/prerequis"/)
  assert.match(html, /rel="noreferrer noopener"/)
  assert.match(html, /téléchargement reste possible/)
  assert.equal((html.match(/Source :/g) ?? []).length, 4, 'une source par ligne')
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('zéro ligne : rien (pas de message vide)', () => {
  assert.equal(renderToStaticMarkup(<ListeControleFichiers lignes={[]} />), '')
})

test('l’écran d’export appelle le contrôle en une ligne, sur la route du serveur', () => {
  assert.match(sansCommentaires(lire('src/routes/project/StepExport.tsx')), /<ControleFichiers projectId=\{project\.id\} \/>/)
  const composant = sansCommentaires(lire('src/components/project/ControleFichiers.tsx'))
  assert.match(sansCommentaires(lire('src/lib/controleFichiers.ts')), /\/export\/controle-fichiers/)
  // une panne du contrôle ne se tait pas et ne dit pas « tout va bien »
  assert.match(composant, /Réessayer/)
})
