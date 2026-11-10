// Export refait (lot b2) : une seule phrase pour le mémoire (la même que sur Rédiger), « à remplir » en ambre (A11),
// la phrase du dépôt sous le bouton (A12), « Je l'ai déposé » seulement après un téléchargement (B1), et une panne du
// serveur qui ne se lit jamais comme un dossier vide. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StepExport, { SuiteDepot, remiseDe } from '@/routes/project/StepExport'
import { phraseDepot } from '@/lib/exportDossier'
import { libellePassagesACompleter } from '@/lib/passagesACompleter'
import { choixStatut } from '@/lib/etatAO'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const PROJET = {
  id: 'ao-1', organization_id: 'org-test', name: 'Groupe scolaire', status: 'en_cours', current_step: 6,
  created_at: '2026-10-01T09:00:00', updated_at: '2026-10-02T09:00:00', echeance: { date: '2099-11-12', heure: '14h30' },
} as unknown as Project

const DETAIL = {
  compliance_total: 0, compliance_confirmed: 0, compliance_with_source: 0, checklist_total: 1, checklist_present: 0,
  has_memoire: true, has_dpgf: true, compliance_items: [],
  checklist_items: [{
    id: 'p1', document_type_required: 'Attestation de visite', status: 'manquant', details: null, linked_document_name: null,
    linked_document_id: null, source_kind: 'coffre', signature_confirmed: false, signature_required: false,
    document_group: 'fournir', jointe: false, piece_nom: null, valable_jusqu_au: null,
  }],
  project_documents: [], pieces_zip: [{ dossier: '02_Offre', nom: 'Memoire_technique.pdf', genre: 'memoire', document_projet_id: null }],
  memoire_info: { version: 2, generated_at: '2026-10-26T10:00:00', sections_count: 26, estimated_pages: 46, passages_a_completer: 136 },
  dpgf_info: { file_name: 'tableau.xlsx', file_id: 'd1' },
  dpgf_remplie: { file_name: 'tableau-rempli.xlsx', verification: { valid: false, warnings: [], total_ht: null, nb_lignes: 40, nb_lignes_remplies: 37, nb_lignes_vides: 3 } },
  naming_convention: null,
}

function rendre(preparer: (client: QueryClient) => void | Promise<void>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  return Promise.resolve(preparer(client)).then(() => renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter><StepExport project={PROJET} /></MemoryRouter></QueryClientProvider>))
}
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

test('comptes uniques : le mémoire dit la phrase de Rédiger, une fois dans le résumé et une fois dans sa section', async () => {
  const html = await rendre((c) => { c.setQueryData(['export-detail', 'ao-1'], DETAIL) })
  const phrase = libellePassagesACompleter(136)!
  assert.equal(phrase, '136 passages à compléter avant le dépôt')
  assert.equal(html.split(phrase).length - 1, 2, 'résumé et section : la même phrase')
  assert.doesNotMatch(texte(html), /100 %|Aucune partie à refaire/, 'plus de second compte qui dit le contraire')
  assert.equal((html.match(/<h1/g) ?? []).length, 1, 'un seul h1')
  assert.equal((html.match(/data-variante="principal"/g) ?? []).length, 1, 'un seul bouton principal')
})

test('A11 : une ligne restée vide se dit « à remplir », à l’encre ambre ; jamais « vides » en rouge', async () => {
  const html = await rendre((c) => { c.setQueryData(['export-detail', 'ao-1'], DETAIL) })
  assert.match(html, /<span class="[^"]*text-ambre-ink[^"]*">3 à remplir<\/span>/)
  assert.doesNotMatch(texte(html), /\bvides?\b/)
  const code = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.doesNotMatch(code, /nb_lignes_vides\}[^<]*vides/)
})

test('pièces demandées : des rangées à filet dans une seule carte, plus une carte par pièce', async () => {
  const html = await rendre((c) => { c.setQueryData(['export-detail', 'ao-1'], DETAIL) })
  assert.match(html, /<ul aria-label="Pièces demandées">/)
  assert.match(html, /<li class="[^"]*border-t border-bord[^"]*first:border-t-0/)
  for (const mot of ['manquant', 'incomplet', 'absent']) assert.ok(!texte(html).toLowerCase().includes(mot), mot)
  assert.doesNotMatch(texte(html), /!/)
})

test('A12 : la phrase du dépôt donne la date de remise à l’heure de Paris, et se tait sur une date passée', async () => {
  const debut = 'Dernière étape, hors Synorix : déposez ce dossier sur la plateforme de l’acheteur'
  assert.equal(phraseDepot(null), `${debut} avant la date de remise.`)
  assert.equal(phraseDepot({ jour: '12 novembre', heure: '14 h 30', passee: false }), `${debut} avant le 12 novembre à 14 h 30.`)
  assert.equal(phraseDepot({ jour: '12 novembre', heure: null, passee: false }), `${debut} avant le 12 novembre.`)
  assert.equal(phraseDepot({ jour: '10 avril', heure: '14 h', passee: true }), `${debut}.`)
  assert.equal(remiseDe(null), null)
  const r = remiseDe({ date: '2026-11-12', heure: '14h00' }, new Date('2026-11-01T08:00:00'))!
  assert.equal(r.passee, false)
  assert.match(r.jour, /12 novembre/)
  assert.equal(r.heure, '14 h')
  assert.equal(remiseDe({ date: '2026-04-10', heure: '14h00' }, new Date('2026-11-01T08:00:00'))!.passee, true)
  const html = await rendre((c) => { c.setQueryData(['export-detail', 'ao-1'], DETAIL) })
  assert.match(html, /<p data-phrase-depot=""[^>]*>Dernière étape, hors Synorix : déposez ce dossier sur la plateforme de l’acheteur avant le 12 novembre[^<]* à 14 h 30\.<\/p>/)
})

test('B1 : « Je l’ai déposé » n’apparaît qu’après un téléchargement du dossier ; le dialogue du socle envoie « soumis »', async () => {
  const rien = () => {}
  assert.equal(renderToStaticMarkup(<SuiteDepot telecharge={false} phrase="x" avertissements={[]} onDepose={rien} />), '')
  const apres = renderToStaticMarkup(<SuiteDepot telecharge phrase="Déposez ce dossier." avertissements={['Une pièce écartée']} onDepose={rien} />)
  assert.match(apres, /Dossier téléchargé/)
  assert.match(apres, /<button[^>]*>Je l’ai déposé<\/button>/)
  assert.match(apres, /Une pièce écartée/)
  // avant tout téléchargement, l'écran ne propose pas le bouton
  const html = await rendre((c) => { c.setQueryData(['export-detail', 'ao-1'], DETAIL) })
  assert.doesNotMatch(html, /Je l’ai déposé/)
  // le bouton n'est branché qu'au succès du téléchargement du dossier, et ouvre le dialogue de statut du socle
  const code = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.equal((code.match(/setTelecharge\(true\)/g) ?? []).length, 1)
  assert.match(code, /export\/zip[\s\S]*?setTelecharge\(true\)/)
  assert.match(code, /onDepose=\{\(\) => setStatutOuvert\(true\)\}/)
  assert.match(code, /<MettreAJourStatut projet=\{project\} ouvert=\{statutOuvert\} onOuvert=\{setStatutOuvert\} \/>/)
  // le dialogue propose « soumis » pour un AO en cours et l'envoie tel quel au serveur
  const choix = choixStatut('en_cours').find((c) => c.statut === 'soumis')
  assert.ok(choix, '« Je l’ai déposé » est un choix du dialogue')
  assert.match(choix!.libelle, /déposé/)
  assert.match(sansCommentaires(lire('src/components/common/MettreAJourStatut.tsx')), /api\.patch\(`\/projects\/\$\{projet\.id\}`, \{ status \}\)/)
})

test('une panne du serveur n’est jamais un dossier vide : « Réessayer », aucun texte d’état vide, aucun bouton de téléchargement', async () => {
  const html = await rendre(async (c) => {
    await c.prefetchQuery({ queryKey: ['export-detail', 'ao-1'], queryFn: () => Promise.reject(new Error('Request failed with status code 500')) })
  })
  const t = texte(html)
  assert.match(t, /Le dossier n’a pas pu s’ouvrir/)
  assert.match(t, /Réessayer/)
  assert.equal((html.match(/<h1/g) ?? []).length, 1, 'le titre de l’étape reste')
  for (const vide of ['La liste des pièces apparaît', 'Les pièces apparaissent ici', 'reste à rédiger', 'Télécharger le dossier', 'status code 500']) {
    assert.ok(!t.includes(vide), vide)
  }
})

test('AO neuf : chaque section dit ce qui apparaîtra ici ; le bouton attend qu’il y ait un dossier', async () => {
  const html = await rendre((c) => {
    c.setQueryData(['export-detail', 'ao-1'], {
      ...DETAIL, has_memoire: false, has_dpgf: false, checklist_items: [], pieces_zip: [], memoire_info: null, dpgf_info: null, dpgf_remplie: null,
    })
  })
  const t = texte(html)
  assert.match(t, /La liste des pièces apparaît après la lecture du/)
  assert.match(t, /Le mémoire technique reste à rédiger/)
  assert.match(t, /Les pièces apparaissent ici dès qu’elles sont jointes au dossier/)
  assert.match(html, /<button[^>]*data-variante="principal"[^>]*disabled=""|<button[^>]*disabled=""[^>]*data-variante="principal"/)
})
