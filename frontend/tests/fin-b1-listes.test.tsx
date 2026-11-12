// Jury, tour 1 (11/11/2026), lot b1 — des listes au lieu de grilles de cartes, seule l'exception marquée ; les quatre frictions
// du testeur débutant sur le Dépôt. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { estAClasser, faitsDepot } from '@/lib/depotDossier'
import { phraseComptesUtiles, phraseResumePieces } from '@/lib/resumePieces'
import { nomPiece, sansNoteDeRegroupement } from '@/lib/nomsPieces'
import { sansJargonIA, titresDetailDocuments } from '@/lib/analyseLibelles'
import { construireCarteAO } from '@/lib/carteAO'
import { setPendingUpload, takePendingUpload } from '@/lib/pendingUpload'
import { RIEN_DECOMPTE } from '@/hooks/useLancerLecture'
import { ZoneDepot, SUITE_DEPOT } from '@/components/depot/ZoneDepot'
import { EtatDePiece, LignePiece, ListePieces } from '@/components/project/LignePiece'
import { redit } from '@/components/project/CandidatureSectionTemplates'
import AVerifierAvantEngagement from '@/components/project/AVerifierAvantEngagement'
import { statutPiece } from '@/lib/statutPiece'
import { lire, sansCommentaires } from './outils/sources'

const depot = sansCommentaires(lire('src/routes/project/StepUpload.tsx'))
const lecture = sansCommentaires(lire('src/hooks/useLancerLecture.ts'))

test('testeur (a) et (b) : un échec de lancement se montre là où est le doigt, et dit que rien n\'est décompté', () => {
  // l'écran défile jusqu'au message d'erreur dès qu'il est dit (au téléphone le bouton est dans la barre du bas)
  assert.match(lecture, /useEffect\(\(\) => \{\s*if \(!analysisError \|\| typeof document === 'undefined'\) return/)
  assert.match(lecture, /message\?\.scrollIntoView\(\{ block: 'center'/)
  // « rien n'a été décompté » : seulement pour les refus que le serveur prononce avant quota.consume, jamais sans réponse
  assert.match(lecture, /const REFUS_AVANT_DECOMPTE = \[400, 409, 422, 429, 503\]/)
  assert.match(lecture, /REFUS_AVANT_DECOMPTE\.includes\(err\.response\?\.status \?\? 0\)/)
  assert.match(RIEN_DECOMPTE, /^Rien n’a été décompté\s: ni unité de votre abonnement, ni appel d’offres offert\.$/)
  assert.doesNotMatch(RIEN_DECOMPTE, /illimit|usage raisonnable/)
  assert.equal(sansJargonIA('Service IA momentanément indisponible — réessayez dans quelques minutes.'), 'Synorix est momentanément indisponible. Réessayez dans quelques minutes.')
  assert.equal(sansJargonIA('Service IA momentanément indisponible. Réessayez dans quelques minutes.'), 'Synorix est momentanément indisponible. Réessayez dans quelques minutes.')
})

test('testeur (c) : plusieurs fichiers à la fois dès la création de l\'AO, sans avoir à les zipper', () => {
  const zone = sansCommentaires(lire('src/components/onboarding/ZoneDepotAO.tsx'))
  assert.match(zone, /multiple: true/)
  assert.match(zone, /'application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document': \['\.docx'\]/, 'les formats de l’étape de dépôt, pas seulement ZIP et PDF')
  assert.match(zone, /fichiers\.find\(\(f\) => f\.name\.toLowerCase\(\)\.endsWith\('\.zip'\)\) \?\? fichiers\[0\]/, 'le nom de l’AO vient du ZIP, sinon du premier fichier')
  const a = new File(['a'], 'a.pdf'); const b = new File(['b'], 'b.pdf')
  setPendingUpload([a, b])
  assert.deepEqual(takePendingUpload().map((f) => f.name), ['a.pdf', 'b.pdf'])
  assert.deepEqual(takePendingUpload(), [], 'consommé une seule fois')
  setPendingUpload(a)
  assert.equal(takePendingUpload().length, 1)
  assert.match(depot, /if \(pending\.length > 0\) onDrop\(pending\)/)
})

test('la zone de dépôt est une surface Synorix : trait plein, fond blanc, ce que Synorix fera du dossier ; ni pointillés ni nuage', () => {
  for (const f of ['src/components/depot/ZoneDepot.tsx', 'src/components/onboarding/ZoneDepotAO.tsx', 'src/routes/project/StepUpload.tsx']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /border-dashed|CloudUpload|bg-surface-1 hover/, f)
  }
  const html = renderToStaticMarkup(<ZoneDepot racine={{}} entree={null} survol={false} titre="Glissez ici le dossier de l’acheteur" formats="PDF ou ZIP, jusqu’à 2 Go par fichier" suite={SUITE_DEPOT} />)
  assert.match(html, /border-bord/)
  assert.match(html, /bg-surface-0/)
  assert.match(html, /Ensuite/)
  assert.equal((html.match(/<li/g) ?? []).length, 3)
  assert.match(html, /jusqu’à 2 Go par fichier/)
  // sur « Nouvel appel d'offres », le bouton de la barre du haut ne double pas le geste de la zone
  assert.match(sansCommentaires(lire('src/components/layout/Header.tsx')), /\{pathname !== '\/projects\/new' && \(/)
})

test('Dépôt : des faits en une phrase, les fichiers à classer en tête, le type en texte (la liste déroulante à la demande)', () => {
  const docs = [{ type: 'rc', file_size: 1024 * 1024 }, { type: 'ccap', file_size: 0 }, { type: 'autre', file_size: 0 }, { type: null, file_size: 0 }] as never[]
  assert.equal(faitsDepot(docs, { lots_detectes: [{ id: 'lot1', nom: 'Lot 1' }, { id: 'lot2', nom: 'Lot 2' }] } as never), '4 fichiers, 1,0 Mo. Synorix a reconnu le règlement et les clauses administratives. 2 lots repérés, à choisir à l’étape suivante.')
  assert.equal(faitsDepot([], null), '')
  assert.deepEqual(docs.map((d) => estAClasser(d)), [false, false, true, true])
  assert.match(depot, /if \(estAClasser\(d\)\) return -1/)
  assert.match(depot, /estAClasser\(doc\) \|\| typeEnEdition === doc\.id \? \(\s*<ListeDeroulante/)
  assert.match(depot, /<span className="text-fg-2">\{libelleType\(valeurListe\(doc\.type\)\)\}<\/span>/)
  assert.match(depot, /<MenuElement onSelect=\{\(\) => setTypeEnEdition\(doc\.id\)\}>/)
  assert.doesNotMatch(depot, /<BandeResume|cartesDepot\(/)
  // au téléphone : les premières lignes, puis « Afficher les N fichiers »
  assert.match(depot, /const lignesVisibles = toutAfficher \? lignes : lignes\.slice\(0, LIGNES_TEL\)/)
})

test('Pièces : une phrase de faits sans zéro, le nom sans la note du logiciel, « À joindre » en texte neutre', () => {
  assert.equal(phraseResumePieces({ pretes: 0, aJoindre: 14, aRenouveler: 0, total: 14, autres: 1 }), '14 pièces demandées au dépôt, à joindre · 1 facultative ou pour l’attribution.')
  assert.equal(phraseResumePieces({ pretes: 3, aJoindre: 9, aRenouveler: 2, total: 14, autres: 0 }), '3 pièces prêtes sur 14 pièces demandées au dépôt · 2 à renouveler avant la remise.')
  assert.equal(phraseResumePieces({ pretes: 2, aJoindre: 0, aRenouveler: 0, total: 2, autres: 0 }), '2 pièces demandées au dépôt : toutes sont prêtes.')
  assert.equal(phraseComptesUtiles({ pretes: 0, aJoindre: 14, aRenouveler: 0, total: 14, autres: 1 }), '14 à joindre')
  for (const p of [phraseResumePieces({ pretes: 0, aJoindre: 14, aRenouveler: 0, total: 14, autres: 0 }), phraseComptesUtiles({ pretes: 0, aJoindre: 3, aRenouveler: 0, total: 3, autres: 0 })]) {
    assert.doesNotMatch(p, /\b0\b|Aucune|manquant|incomplet|absent/)
  }
  assert.equal(nomPiece('pouvoir', 'Pouvoir / habilitation à signer (2 exigences du RC regroupées)'), 'Pouvoir / habilitation à signer')
  assert.equal(sansNoteDeRegroupement('Références (1 exigence du RC regroupée)'), 'Références')
  assert.equal(redit('DC1 — Lettre de candidature', 'Lettre de candidature (DC1)'), true)
  assert.equal(redit('Attestation de visite du site', 'Attestation de visite'), false)
  const html = renderToStaticMarkup(
    <ListePieces>
      <LignePiece id="a" nom="Attestation inventée" etat={<EtatDePiece statut={statutPiece({ status: 'manquant' })} />} />
      <LignePiece id="b" nom="Kbis inventé" etat={<EtatDePiece statut={statutPiece({ status: 'present', jointe: true })} />} />
    </ListePieces>)
  assert.match(html, /data-liste-pieces=""/)
  assert.match(html, /<span data-etat="a-joindre" class="whitespace-nowrap text-sm text-fg-2">À joindre<\/span>/)
  assert.match(html, /data-etat="pret"/)
  assert.doesNotMatch(html, /text-bleu-ink|a-couvrir/)
  const pieces = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.doesNotMatch(pieces, /<BandeResume|colonnes=\{2\}|role="progressbar"|étape Mémoire"/)
})

test('Décider : « à vérifier » en liste sans pastille, jamais « 0 prête », titres du détail au même mot', () => {
  const html = renderToStaticMarkup(<AVerifierAvantEngagement points={[
    { id: 'delai', libelle: 'Délai d’exécution', valeur: '8 mois', source: { document: 'CCAP-demo.pdf', page: 3, excerpt: null } },
    { id: 'validite', libelle: 'Validité de l’offre', valeur: '120 jours', source: null },
  ]} onVoir={() => undefined} />)
  assert.match(html, /data-liste-a-verifier=""/)
  assert.equal((html.match(/data-a-verifier=/g) ?? []).length, 2)
  assert.doesNotMatch(html, /data-etat=|À vérifier<|md:grid-cols-2/)
  assert.match(html, /CCAP-demo\.pdf · page 3/)
  const faits = construireCarteAO({ projet: { name: 'AO inventé' }, champs: null, pieces: [{ status: 'manquant' }, { status: 'manquant' }], maintenant: new Date(2026, 10, 10, 9) })
  assert.equal(faits.find((f) => f.id === 'pieces')?.valeur, '2 pièces à joindre')
  assert.deepEqual(titresDetailDocuments(35, 58), { analyses: '35 documents analysés pour ce lot', ecartes: '58 documents laissés de côté' })
  const css = lire('src/styles/pieces.css')
  assert.doesNotMatch(css.match(/\.carte-ao-30s__titre \{[^}]*\}/)?.[0] ?? '', /uppercase|letter-spacing/)
})
