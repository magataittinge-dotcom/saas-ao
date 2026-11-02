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
  // ce que la carte ne dit pas reste affiché
  assert.ok(/Pénalités de retard/.test(t) && /1\/1000 par jour/.test(t))
  assert.ok(/Questions jusqu/.test(t))
})

test('rien à ajouter : le bandeau disparaît', () => {
  const data = faits({ penalites: vide, date_limite_questions: vide } as never)
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
