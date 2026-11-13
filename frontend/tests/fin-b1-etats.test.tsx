// Jury, tour 1 (11/11/2026), lot b1 — les deux bloquants et les états des étapes Lots, Décider et Pièces.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LotCard } from '@/routes/project/StepLotSelection'
import { EtapeSansAnalyse } from '@/components/project/EtapeSansAnalyse'
import { SqueletteListe } from '@/components/project/SqueletteListe'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
const decider = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
const pieces = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
const LOT = { id: 'lot5', nom: 'Lot 5 — Bardage inventé', sources: ['rc_table'], confidence: 95 }
const rien = () => undefined

test('bloquant « 0 pièce lue » : la liste des lots n\'existe pas tant que les pièces du dossier ne sont pas comptées', () => {
  // la liste ne s'initialise qu'une fois les pièces lues : pendant le chargement, c'est le squelette, sans aucune valeur
  assert.match(lots, /if \(!lotsInitialized && requeteDocuments\.isSuccess && !lotsLoading && allDetected\.length > 0\)/)
  assert.match(lots, /enDetection \? \(\s*<SqueletteListe phrase="Synorix repère les lots du dossier et compte les pièces de chacun\." \/>/)
  const squelette = renderToStaticMarkup(<SqueletteListe phrase="Synorix repère les lots du dossier et compte les pièces de chacun." />)
  assert.match(squelette, /role="status"/)
  assert.doesNotMatch(squelette.replace(/<p[^>]*>[^<]*<\/p>/, ''), />[^<]*\d[^<]*</, 'aucun chiffre dans le squelette')
  // une ligne sans pièces comptées n'écrit jamais « 0 pièce », ni « Prêt »
  for (const p of [undefined, []]) {
    const html = renderToStaticMarkup(<LotCard lot={LOT} selected={false} onSelect={rien} pieces={p} />)
    assert.doesNotMatch(html, /0 pièce|pièce lue|Prêt|Source :/)
  }
  const html = renderToStaticMarkup(<LotCard lot={LOT} selected onSelect={rien} pieces={[{ file_name: 'a.pdf' }, { file_name: 'b.pdf' }]} />)
  assert.match(html, /2 pièces lues/)
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(html, /Prêt|Source :|data-etat=/, 'un lot sans réserve ne porte aucune marque d’état')
})

test('la liste des lots ne marque que l\'exception ; « tout le dossier » ne dit pas « pour ce lot »', () => {
  const douteux = renderToStaticMarkup(<LotCard lot={{ ...LOT, confidence: 40 }} selected={false} onSelect={rien} pieces={[{ file_name: 'a.pdf' }]} />)
  assert.match(douteux, /data-etat="a-verifier"/)
  assert.match(douteux, /À vérifier/)
  const tout = renderToStaticMarkup(<LotCard lot={{ id: 'all', nom: 'Analyser l’ensemble du dossier (tous les lots)' }} selected={false} onSelect={rien} pieces={[{ file_name: 'a.pdf' }, { file_name: 'b.pdf' }]} />)
  // COR-B1 : « dans le dossier » est déjà dit par l'intitulé de la rangée ; la rangée tient dans la carte à 390 px
  assert.match(tout, /2 pièces lues</)
  assert.doesNotMatch(tout, /pour ce lot/)
  // une liste (une surface, des filets), plus une grille de cartes ; plus de bande de cases avec une jauge
  assert.match(lots, /<ListeLots>\{lots\.map\(carteLot\)\}<\/ListeLots>/)
  assert.doesNotMatch(lots, /colonnes=\{2\}|<BandeResume|jauge:/)
  // l'erreur ne garde ni résumé ni barre, et ne se dit qu'une fois
  assert.doesNotMatch(lots, /Les lots n’ont pas pu être lus|Aucun dossier déposé|ne sont pas touchés|n’est pas touché/)
  assert.match(lots, /barre=\{!peutLire \? undefined : \(/)
})

const projet = (plus: Partial<Project>) => ({ id: 'ao-invente', name: 'AO inventé', status: 'draft', current_step: 1, completed_steps: {}, processing_status: 'ready', ...plus }) as unknown as Project

test('bloquant « Le dossier est bien enregistré… Relancer » : un AO sans dossier dit « déposer le dossier », sur les trois étapes', () => {
  assert.doesNotMatch(decider, /Le dossier est bien enregistré|L’analyse n’a pas démarré"|>Relancer</)
  assert.match(decider, /const sansDepot = documentsLus && projectDocs\.length === 0/)
  assert.match(decider, /if \(items\.length === 0 && sansDepot && !analysisRunning\) return \(\s*<GabaritEtape[^>]*>\s*<EtapeSansAnalyse project=\{project\} cas="sans-depot"/)
  assert.ok(decider.indexOf('cas="sans-depot"') < decider.indexOf('lectureNonDemarree({'), 'sans dossier : dit tout de suite, avant le délai de grâce')
  assert.match(lots, /<EtapeSansAnalyse project=\{project\} cas="sans-depot"/)
  assert.match(pieces, /<EtapeSansAnalyse project=\{project\} cas=\{actionEtape\(project\)\.segment === 'upload' \? 'sans-depot' : 'analyse-non-lancee'\}/)
  const neuf = renderToStaticMarkup(<MemoryRouter><EtapeSansAnalyse project={projet({})} cas="sans-depot" viendra={['La décision']}>Phrase de repli.</EtapeSansAnalyse></MemoryRouter>)
  assert.match(neuf, /data-lecture-non-faite/)
  assert.match(neuf, /href="\/projects\/ao-invente\/upload"/)
  assert.match(neuf, /Déposer le dossier/)
  assert.doesNotMatch(neuf, /Relancer|bien enregistré|Phrase de repli/)
  assert.equal((neuf.match(/data-variante="principal"/g) ?? []).length, 1, 'un seul bouton plein')
  // un dossier est là, l'analyse n'est pas lancée : le geste est de choisir les lots
  const depose = renderToStaticMarkup(<MemoryRouter><EtapeSansAnalyse project={projet({ current_step: 2 })} cas="analyse-non-lancee" viendra={[]}>Le dossier est déposé.</EtapeSansAnalyse></MemoryRouter>)
  assert.match(depose, /href="\/projects\/ao-invente\/lots"/)
  assert.match(depose, /Choisir les lots à analyser/)
  assert.match(depose, /data-synorix-parle/)
})

test('chargement et erreur : un squelette du système et une phrase, « restent en place » (plus « ne sont pas touchés »)', () => {
  assert.match(decider, /Synorix ouvre l’analyse du dossier\./)
  assert.match(decider, /<SqueletteCorpsEtape cases=\{2\} \/>/)
  assert.match(pieces, /<SqueletteListe phrase="Synorix ouvre la liste des pièces demandées par le règlement\." \/>/)
  for (const src of [lots, decider, pieces]) {
    assert.doesNotMatch(src, /pas touché|<Squelette className="h-(28|32|56)/)
  }
})

test('états restants : la décision à prendre se dit sur Pièces, une analyse arrêtée ne donne pas un compte certain, l\'attente ne dit pas « 0 % »', async () => {
  // Pièces sans décision prise : une phrase du résumé et le geste (pas une alerte de plus : une alerte à la fois dans un AO)
  assert.match(pieces, /const decisionPrise = project\.completed_steps\?\.\['3'\] === true \|\| project\.status === 'sans_suite'/)
  assert.match(pieces, /\{!decisionPrise && \(\s*<p data-decision-a-prendre=""/)
  assert.match(pieces, /Revenir à Décider/)
  // Décider après une analyse arrêtée : « Au moins N exigences », et la réserve à côté du chiffre
  assert.match(decider, /\{analysisFailed \? 'Au moins ' : ''\}\{items\.length\} exigences identifiées/)
  // Lots : les documents illisibles en une phrase, avec un geste ; le motif du serveur n'est pas recopié cinq fois
  assert.match(lots, /<Message ton="info"\s+titre=\{extractionWarnings\.length > 1/)
  assert.match(lots, /Déposer une version lisible/)
  assert.doesNotMatch(lots, /\{w\.warning\}/)
  // l'écran d'attente : « Démarrage » tant que rien n'a avancé, la première étape en cours, le bouton dit où il mène
  const { default: ProgressDisplay } = await import('@/components/common/ProgressDisplay')
  const etapes = [{ key: 'a', label: 'Analyse des documents', estimated_s: 60 }, { key: 'b', label: 'Mise en ordre', estimated_s: 5 }]
  const html = renderToStaticMarkup(<ProgressDisplay variant="page" title="Synorix analyse votre dossier" steps={etapes} currentStep={null} progress={0} phase="pending" onArrierePlan={() => undefined} libelleArrierePlan="Revenir à l’accueil" />)
  assert.match(html, />Démarrage</)
  assert.doesNotMatch(html, />0\s%</)
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1)
  assert.match(html, /Revenir à l’accueil/)
  assert.doesNotMatch(decider, /Je lis vos documents/)
})
