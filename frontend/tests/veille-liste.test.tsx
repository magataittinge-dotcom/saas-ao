// B5 — la liste des avis : cartes, pastille « Nouveau », J−x, liens externes sûrs, filtres, états vides, « Élargir »,
// « Voir plus », source. Les avis sont inventés (acheteurs et objets fictifs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ListeAvis, { type PropsListeAvis } from '@/components/veille/ListeAvis'
import CarteAvis from '@/components/veille/CarteAvis'
import FiltresVeille from '@/components/veille/FiltresVeille'
import { FILTRES_PAR_DEFAUT, basculerValeur, jourMois, urlSure } from '@/lib/veille'
import { lire, sansCommentaires } from './outils/sources'
import type { AvisVeille } from '@/services/veille'

const plusJours = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const avis = (id: string, p: Partial<AvisVeille> = {}): AvisVeille => ({
  id, id_boamp: `SIM-${id}`, objet: `Réhabilitation d'un groupe scolaire ${id} (exemple)`, acheteur: 'Commune de Valmont-sur-Exemple',
  departements: ['69'], date_parution: plusJours(-2), date_limite: plusJours(12), procedure: 'adaptee', procedure_libelle: 'Procédure adaptée',
  famille: 'Travaux', metiers: ['facade_ite', 'menuiseries'], url_avis: 'https://exemple.invalid/avis/1', url_dossier: null, nouveau: false, ...p,
})
const METIERS = [
  { code: 'facade_ite', libelle: 'Façade et ITE' }, { code: 'menuiseries', libelle: 'Menuiseries' }, { code: 'cvc', libelle: 'CVC' },
  { code: 'peinture', libelle: 'Peinture' }, { code: 'plomberie', libelle: 'Plomberie' },
]
const NOMS = { '69': 'Rhône', '01': 'Ain' }

const base = (p: Partial<PropsListeAvis> = {}): PropsListeAvis => ({
  avis: [], total: 0, zoneVide: false, filtres: FILTRES_PAR_DEFAUT, onFiltres: () => {}, tri: 'date_limite', onTri: () => {}, metiers: METIERS,
  nomsDepartements: NOMS, aPlus: false, onVoirPlus: () => {}, peutElargir: true, onElargir: () => {}, onCreerAO: () => {}, ...p,
})

/** Parcourt un arbre d'éléments React (composants sans état appelés comme des fonctions) à la recherche d'un élément. */
function trouver(noeud: ReactNode, test: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(noeud)) { for (const n of noeud) { const r = trouver(n, test); if (r) return r } return null }
  if (!isValidElement(noeud)) return null
  const el = noeud as ReactElement<Record<string, unknown>>
  if (test(el)) return el
  return trouver(el.props.children as ReactNode, test)
}
const texteDe = (n: ReactNode): string => (Array.isArray(n) ? n.map(texteDe).join('') : typeof n === 'string' || typeof n === 'number' ? String(n) : isValidElement(n) ? texteDe((n.props as { children?: ReactNode }).children) : '')

test('une liste simulée : une carte par avis, objet, acheteur, département, procédure, métiers', () => {
  const liste = [avis('1'), avis('2', { departements: ['01'], metiers: ['cvc', 'plomberie', 'peinture', 'facade_ite'] }), avis('3')]
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: liste, total: 3 })} />)
  assert.equal((html.match(/<article/g) ?? []).length, 3)
  assert.ok(html.includes("Réhabilitation d&#x27;un groupe scolaire 1 (exemple)"))
  assert.ok(html.includes('Commune de Valmont-sur-Exemple'))
  assert.ok(html.includes('Rhône (69)') && html.includes('Ain (01)'))
  assert.ok(html.includes('Procédure adaptée'))
  assert.ok(html.includes('Façade et ITE') && html.includes('Menuiseries'))
  assert.ok(html.includes('>+1<'), 'un 4e métier se range derrière « +1 »')
  assert.ok(html.includes('3 avis ouverts dans cette zone'))
})

test('le délai s’affiche en J−x, avec la date limite en jour et mois', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1', { date_limite: plusJours(12) }), avis('2', { date_limite: plusJours(3) })], total: 2 })} />)
  assert.ok(html.includes('J−12'))
  assert.ok(html.includes('J−3'))
  assert.ok(html.includes(jourMois(plusJours(12))))
  assert.equal(jourMois('2026-11-12'), '12/11')
  assert.equal(jourMois(null), '')
})

test('la pastille « Nouveau » n’apparaît que sur les avis nouveaux', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1', { nouveau: true }), avis('2'), avis('3', { nouveau: true })], total: 3 })} />)
  assert.equal((html.match(/>Nouveau</g) ?? []).length, 2)
  assert.ok(/border-accent-tint-2 bg-accent-tint text-accent-text[^>]*>Nouveau</.test(html), 'pastille en accent, par les jetons')
})

test('« Voir l’avis » : lien externe sûr ; « Créer l’AO » : un bouton par avis', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1'), avis('2')], total: 2 })} />)
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, 2)
  assert.equal((html.match(/Créer l&#x27;AO/g) ?? []).length, 2)
  assert.ok(html.includes("s&#x27;ouvre dans un nouvel onglet"))
  const piege = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('9', { url_avis: 'javascript:alert(1)' })], total: 1 })} />)
  assert.ok(!piege.includes('javascript:') && !piege.includes('Voir l&#x27;avis'), 'un lien non http(s) n’est jamais proposé')
  assert.equal(urlSure('https://exemple.invalid/a'), 'https://exemple.invalid/a')
  assert.equal(urlSure('javascript:alert(1)'), null)
  assert.equal(urlSure('data:text/html,x'), null)
  assert.equal(urlSure('pas une url'), null)
  assert.equal(urlSure(null), null)
})

test('« Créer l’AO » remonte l’identifiant de l’avis', () => {
  const recus: string[] = []
  const el = CarteAvis({ avis: avis('42'), libellesMetiers: {}, nomsDepartements: NOMS, onCreerAO: (id) => recus.push(id) }) as ReactElement
  const bouton = trouver(el, (e) => typeof e.props.onClick === 'function' && texteDe(e.props.children).includes('Créer'))
  assert.ok(bouton, 'bouton trouvé')
  ;(bouton!.props.onClick as () => void)()
  assert.deepEqual(recus, ['42'])
})

test('création en cours et création non aboutie : textes positifs, bouton désactivé pendant la création', () => {
  const en = renderToStaticMarkup(<CarteAvis avis={avis('1')} libellesMetiers={{}} nomsDepartements={NOMS} onCreerAO={() => {}} enCreation />)
  assert.ok(en.includes('Création…') && /<button[^>]*disabled/.test(en))
  const err = renderToStaticMarkup(<CarteAvis avis={avis('1')} libellesMetiers={{}} nomsDepartements={NOMS} onCreerAO={() => {}} creationEnErreur />)
  assert.ok(err.includes("La création n&#x27;a pas abouti. Réessayez dans un instant."))
})

test('sans zone : « Choisissez une zone sur la carte »', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ zoneVide: true })} />)
  assert.ok(html.includes('Choisissez une zone sur la carte'))
  assert.ok(!html.includes('Élargir'))
})

test('zone sans avis : message positif et bouton « Élargir » ; il dit ce qu’il fait', () => {
  const sans = renderToStaticMarkup(<ListeAvis {...base()} />)
  assert.ok(sans.includes('Aucun avis ouvert dans cette zone pour ces filtres'))
  assert.ok(sans.includes('>Élargir<') && sans.includes('Élargir ajoute les départements voisins.'))
  const avec = renderToStaticMarkup(<ListeAvis {...base({ filtres: { ...FILTRES_PAR_DEFAUT, metiers: ['cvc'] } })} />)
  assert.ok(avec.includes('Élargir retire les filtres.'))
  const rien = renderToStaticMarkup(<ListeAvis {...base({ peutElargir: false })} />)
  assert.ok(rien.includes('Aucun avis ouvert') && !rien.includes('>Élargir<'))
  // le geste
  let appels = 0
  const el = ListeAvis(base({ onElargir: () => { appels += 1 } })) as ReactElement
  const b = trouver(el, (e) => texteDe(e.props.children) === 'Élargir' && typeof e.props.onClick === 'function')
  ;(b!.props.onClick as () => void)()
  assert.equal(appels, 1)
})

test('« Voir plus » seulement quand le serveur a donné un curseur ; chargement et erreur en termes positifs', () => {
  assert.ok(renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 40, aPlus: true })} />).includes('Voir plus'))
  assert.ok(!renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 1, aPlus: false })} />).includes('Voir plus'))
  assert.ok(renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 40, aPlus: true, chargePlus: true })} />).includes('Chargement…'))
  const chargement = renderToStaticMarkup(<ListeAvis {...base({ enCours: true })} />)
  assert.ok(chargement.includes('Chargement des avis') && !chargement.includes('Aucun avis ouvert'))
  const erreur = renderToStaticMarkup(<ListeAvis {...base({ enErreur: true })} />)
  assert.ok(erreur.includes('Les avis ne se chargent pas pour le moment') && erreur.includes('conservés'))
})

test('la source est nommée sous la liste', () => {
  const html = renderToStaticMarkup(<ListeAvis {...base({ avis: [avis('1')], total: 1 })} />)
  assert.ok(html.includes('Source : BOAMP – DILA, licence ouverte'))
})

test('les filtres : délai en groupe radio (« Toutes » par défaut), procédures en bascule, métier en panneau, mots-clés, tri', () => {
  const html = renderToStaticMarkup(<FiltresVeille filtres={{ ...FILTRES_PAR_DEFAUT, delai_jours: 15, procedures: ['adaptee'], metiers: ['cvc', 'peinture'] }} onFiltres={() => {}} tri="date_limite" onTri={() => {}} metiers={METIERS} />)
  assert.equal((html.match(/role="radio"/g) ?? []).length, 4)
  assert.ok(/aria-checked="true"[^>]*>15 jours</.test(html))
  for (const t of ['7 jours', '30 jours', 'Toutes']) assert.ok(html.includes(t), t)
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 6, 'six procédures')
  assert.ok(/aria-pressed="true"[^>]*>Adaptée</.test(html))
  assert.ok(html.includes('Métier (2)') && html.includes('aria-expanded="false"'))
  assert.ok(html.includes('Mots-clés') && html.includes('Trier par'))
  assert.ok(html.includes('Date limite') && html.includes('Parution récente'))
  const defaut = renderToStaticMarkup(<FiltresVeille filtres={FILTRES_PAR_DEFAUT} onFiltres={() => {}} tri="date_limite" onTri={() => {}} metiers={METIERS} />)
  assert.ok(/aria-checked="true"[^>]*>Toutes</.test(defaut))
})

test('les puces de procédure et de métier basculent ; chaque geste remonte son filtre', () => {
  assert.deepEqual(basculerValeur([], 'adaptee'), ['adaptee'])
  assert.deepEqual(basculerValeur(['adaptee', 'ouvert'], 'adaptee'), ['ouvert'])
  const code = sansCommentaires(lire('src/components/veille/FiltresVeille.tsx'))
  assert.match(code, /onFiltres\(\{ delai_jours: j \}\)/)
  assert.match(code, /onFiltres\(\{ procedures: basculerValeur\(filtres\.procedures, p\.code\) \}\)/)
  assert.match(code, /onFiltres\(\{ metiers: basculerValeur\(filtres\.metiers, m\.code\) \}\)/)
  assert.match(code, /onFiltres\(\{ mots_cles: v \}\)/)
  assert.match(code, /setTimeout\(\(\) => onChange\(local\.slice\(0, 120\)\), 400\)/, 'mots-clés : 400 ms et 120 caractères au plus')
})
