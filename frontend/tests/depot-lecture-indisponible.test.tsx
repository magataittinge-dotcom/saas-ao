// G6 — la phrase « Lecture indisponible… » d'un dépôt qui n'a pas pu être lu se lit : pas en petit gris.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CaseDepotVue, type VueCase } from '@/components/entreprise/CasesDepot'
import type { CaseEtat } from '@/lib/entreprise/depots'

const PHRASE = 'Lecture indisponible : le fichier est dans votre coffre-fort, vous pouvez saisir à la main.'

const definition = {
  id: 'kbis', rubrique: 'identite', nom: 'Extrait Kbis', contenu: 'Votre extrait', usage: 'Synorix lit',
  plafond_mo: 20, plusieurs_fichiers: true, formats: ['.pdf'],
} as unknown as VueCase['definition']

const rendre = (etat: Partial<CaseEtat>) => renderToStaticMarkup(
  <CaseDepotVue vue={{ definition, envoi: false, erreur: null, etat: { id: 'kbis', fichiers: [], propositions: 0, vers_verifier: false, ...etat } as unknown as CaseEtat }}
    onFichiers={() => {}} onVerifier={() => {}} />)

test('lecture indisponible : la phrase est en texte courant lisible, pas en petit gris', () => {
  const html = rendre({ etat: 'echec', libelle_etat: 'Déposé dans le coffre-fort', note: PHRASE })
  assert.match(html, /<p class="text-sm leading-relaxed text-fg-2">Lecture indisponible : le fichier est dans votre coffre-fort, vous pouvez saisir à la main\.<\/p>/)
  assert.ok(!/text-xs text-fg-3">[^<]*Lecture indisponible/.test(html))
})

test('les autres notes restent discrètes', () => {
  const html = rendre({ etat: 'ocr_requis', libelle_etat: 'Déposé dans le coffre-fort', note: 'Image ou scan : lisible seulement avec un OCR.' })
  assert.match(html, /text-xs text-fg-3">Image ou scan/)
})
