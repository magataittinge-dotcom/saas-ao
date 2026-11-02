// R12 + R13 — la page d'analyse n'a qu'un résumé (« L'AO en 30 secondes ») : la remise,
// la visite, le délai et les critères ne sont pas répétés dans un second bloc ;
// la visite se dit « Obligatoire » ou « Facultative », jamais « Possible ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CriticalBannerVue, type CriticalFieldsPayload } from '@/components/project/CriticalBanner'
import { lire, sansCommentaires } from './outils/sources'

const vide = { value: null, source: null }
const faits = (surcharge: Partial<CriticalFieldsPayload['fields']>): CriticalFieldsPayload => ({
  lot: null,
  fields: {
    date_limite_remise: { value: { date: '2027-03-12', heure: '12:00' }, source: null },
    date_limite_questions: { value: '2027-03-01', source: null },
    visite_site: { value: { statut: 'facultative', date: null }, source: null },
    criteres: { value: [{ nom: 'Valeur technique', poids: 50 }, { nom: 'Prix', poids: 50 }], source: null },
    penalites: { value: { retard: '1/1000 par jour', plafond: '5 %' }, source: null },
    delai_execution: { value: '6 mois', source: null },
    ...surcharge,
  } as CriticalFieldsPayload['fields'],
})
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('le bandeau ne répète ni la remise, ni la visite, ni le délai, ni les critères', () => {
  const t = texte(renderToStaticMarkup(<CriticalBannerVue data={faits({})} onOpenSource={() => {}} />))
  assert.ok(!/Remise des offres/.test(t), t)
  assert.ok(!/Visite/i.test(t), t)
  assert.ok(!/Délai d.exécution/.test(t), t)
  assert.ok(!/Critères|Valeur technique/.test(t), t)
  assert.ok(!/Possible/.test(t), t)
  // ce que la carte ne dit pas reste affiché : la date des questions (V3 : les pénalités ne sont détaillées que dans la trésorerie)
  assert.ok(!/énalit|1\/1000/.test(t), t)
  assert.ok(/Questions jusqu/.test(t))
})

test('rien à ajouter : le bandeau disparaît', () => {
  const data = faits({ date_limite_questions: vide } as never)
  assert.equal(renderToStaticMarkup(<CriticalBannerVue data={data} onOpenSource={() => {}} />), '')
})

test('la page d\'analyse n\'a plus de second résumé (objet, client, jauge des critères)', () => {
  const code = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.ok(!code.includes('infos.objet') && !code.includes('infos?.objet'))
  assert.ok(!code.includes('Critères de jugement'))
  assert.ok(!code.includes('maitre_ouvrage'))
  assert.ok(code.includes('exigences identifiées'), 'le décompte des exigences reste')
})

test('plus de « Possible » pour la visite nulle part', () => {
  const code = sansCommentaires(lire('src/components/project/CriticalBanner.tsx'))
  assert.ok(!code.includes('Possible'))
})

// V3 — les pénalités de retard ne sont détaillées qu'à un seul endroit : le bloc « Trésorerie du marché » (traduction du CCAP).
test('V3 : plus de tuile « Pénalités de retard » ; la décision ne garde qu’un lien « Voir les pénalités » vers la trésorerie', () => {
  const bandeau = sansCommentaires(lire('src/components/project/CriticalBanner.tsx'))
  assert.doesNotMatch(bandeau.replace(/penalites: Field<[^;]*>/, ''), /Pénalités de retard|f\.penalites/)
  const decision = sansCommentaires(lire('src/components/project/SynorixScoreCard.tsx'))
  assert.match(decision, /Voir les pénalités/)
  assert.match(decision, /voirTresorerie/)
  assert.match(decision, /comp\.id === PENALITES \? \(/, 'la ligne des pénalités n’affiche pas son explication chiffrée')
  const tresorerie = sansCommentaires(lire('src/components/project/TresorerieCard.tsx'))
  assert.match(tresorerie, /id=\{ID_TRESORERIE\}/, 'le bloc porte l’ancre vers laquelle le lien mène')
  assert.match(tresorerie, /scrollIntoView/)
})

test('V3 : la carte « L’AO en 30 secondes » ne dit jamais les pénalités', async () => {
  const { construireCarteAO } = await import('@/lib/carteAO')
  const faitsCarte = construireCarteAO({ projet: { name: 'AO inventé', infos_marche: { objet: 'Objet inventé' } }, champs: { delai_execution: { value: '8 mois', source: null } } })
  assert.ok(faitsCarte.length > 0)
  assert.ok(faitsCarte.every((f) => !/énalit/i.test(`${f.libelle} ${f.valeur} ${f.reste ?? ''}`)))
})
