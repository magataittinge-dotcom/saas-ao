// Décision du 3/11 : le plan signale les parties cochées qui servent le même sous-critère avec des titres proches
// (comparaison sans IA), sans rien retirer sans clic ; libellé « Aucune remplie ». Vague 1 (10/11) : « Valider le plan » n'est
// écrit qu'une fois (l'en-tête) ; les gestes d'une rangée sont dans son menu « … », en mots.
import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarrePlan, type EtatPlan } from '@/components/plan/ActionsPlan'
import MentionRecoupe from '@/components/plan/MentionRecoupe'
import PartiePlanCarte from '@/components/plan/PartiePlanCarte'
import { libelleFichesRemplies, libelleLongueur, type PartiePlan } from '@/lib/planMemoire'
import { recoupements, titresProches } from '@/lib/planRecoupe'
import { lire, sansCommentaires } from './outils/sources'

const p = (cle: string, titre: string, extra: Partial<PartiePlan> = {}): PartiePlan => ({
  cle, partie: cle.split('.')[0] as PartiePlan['partie'], titre, titre_modele: titre, retiree: false, attendue: null,
  fiche: { references: null, personnes: null, materiel: null, voulu: '' },
  sous_criteres: [], attendues: [], source: null, exigences: [],
  propose: { references: [], personnes: [], materiel: [] }, ...extra,
})
const SC = (nom: string) => ({ critere: 'valeur_technique', nom, poids: 20 })
const noop = () => {}

test('titres proches : « Matériel » et « Matériels dédiés » le sont (pluriel, mot vide, accents)', () => {
  assert.equal(titresProches('Matériel', 'Matériels dédiés'), true)
  assert.equal(titresProches('MATERIEL', 'le matériel détaillé'), true)
  assert.equal(titresProches('Moyens humains et matériels', 'Matériel'), true)
  assert.equal(titresProches('Gestion des déchets', 'Déchet de chantier'), true)
})

test('titres proches : un mot significatif en commun, ou l’un inclus dans l’autre ; sinon jamais', () => {
  assert.equal(titresProches('Qualité des ouvrages', 'Planning des travaux'), false)           // « des » seul : mot vide
  assert.equal(titresProches('Sécurité du chantier', 'Moyens matériels'), false)
  assert.equal(titresProches('Matériel', 'Personnel'), false)
  assert.equal(titresProches('', 'Matériel'), false)
  assert.equal(titresProches('Les des et', 'Du la le'), false)                                  // que des mots vides
  assert.equal(titresProches('Organisation de chantier', 'Chantier propre'), true)
})

test('recoupements : la seconde partie cochée de même sous-critère et de titre proche renvoie à la première', () => {
  const plan = [
    p('partie_b.a', 'Matériel', { sous_criteres: [SC('Moyens')] }),
    p('partie_b.b', 'Matériels dédiés', { sous_criteres: [SC('Moyens')] }),
    p('partie_c.c', 'Planning', { sous_criteres: [SC('Délais')] }),
  ]
  const r = recoupements(plan)
  assert.deepEqual([...r.keys()], ['partie_b.b'])
  assert.deepEqual(r.get('partie_b.b'), { cle: 'partie_b.a', titre: 'Matériel' })
})

test('recoupements : sous-critères différents, titres sans mot commun ou partie retirée : jamais signalé', () => {
  const memeTitre = [p('partie_b.a', 'Matériel', { sous_criteres: [SC('Moyens')] }), p('partie_b.b', 'Matériels dédiés', { sous_criteres: [SC('Délais')] })]
  assert.equal(recoupements(memeTitre).size, 0)                                               // titres proches mais autre sous-critère
  const autresTitres = [p('partie_b.a', 'Matériel', { sous_criteres: [SC('Moyens')] }), p('partie_b.b', 'Équipe de chantier', { sous_criteres: [SC('Moyens')] })]
  assert.equal(recoupements(autresTitres).size, 0)                                            // même sous-critère, titres sans mot commun
  const retiree = [p('partie_b.a', 'Matériel', { sous_criteres: [SC('Moyens')] }), p('partie_b.b', 'Matériels dédiés', { sous_criteres: [SC('Moyens')], retiree: true })]
  assert.equal(recoupements(retiree).size, 0)
  assert.equal(recoupements([p('partie_b.a', 'Matériel'), p('partie_b.b', 'Matériels dédiés')]).size, 0)   // aucun sous-critère servi
})

test('recoupements : l’ordre est celui de l’écran (A, B, C puis l’ordre du plan) et chaque partie renvoie à la première qui lui ressemble', () => {
  const plan = [
    p('partie_c.z', 'Matériel de chantier', { sous_criteres: [SC('Moyens')] }),
    p('partie_b.x', 'Matériel', { sous_criteres: [SC('Moyens')] }),
    p('partie_b.y', 'Matériels dédiés', { sous_criteres: [SC('Moyens')] }),
  ]
  const r = recoupements(plan)
  assert.deepEqual(r.get('partie_b.y'), { cle: 'partie_b.x', titre: 'Matériel' })
  assert.deepEqual(r.get('partie_c.z'), { cle: 'partie_b.x', titre: 'Matériel' })
  assert.equal(r.has('partie_b.x'), false)
})

const cherche = (el: unknown, quand: (e: ReactElement<{ onClick?: () => void }>) => boolean): ReactElement<{ onClick?: () => void }> | null => {
  if (!isValidElement(el)) return null
  const e = el as ReactElement<{ onClick?: () => void; children?: unknown }>
  if (quand(e)) return e
  const enfants = ([] as unknown[]).concat(e.props.children ?? [])
  for (const c of enfants) { const t = cherche(c, quand); if (t) return t }
  return null
}

test('la mention : « Se recoupe avec « <titre> » » et « Retirer cette partie » ; le lien fait ce que fait la croix', () => {
  const html = renderToStaticMarkup(<MentionRecoupe titre="Matériel" onRetirer={noop} />)
  assert.match(html, /Se recoupe avec «\s*Matériel\s*»/)
  assert.match(html, /Retirer cette partie/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
  let appels = 0
  const bouton = cherche(MentionRecoupe({ titre: 'Matériel', onRetirer: () => { appels += 1 } }), (e) => typeof e.props.onClick === 'function')
  assert.ok(bouton?.props.onClick)
  bouton.props.onClick()
  assert.equal(appels, 1)
})

const carte = (props: Partial<Parameters<typeof PartiePlanCarte>[0]> = {}) => renderToStaticMarkup(
  <PartiePlanCarte
    partie={p('partie_b.b', 'Matériels dédiés', { sous_criteres: [SC('Moyens')] })} numero={2} ouverte={false} peutMonter peutDescendre seulementGardee={false}
    onBasculerFiche={noop} onRenommer={noop} onRetirer={noop} onSupprimer={noop} onMonter={noop} onDescendre={noop} onFiche={noop} onVoirSource={noop}
    {...props} />)

test('la carte d’une partie : la mention sous la seconde seulement, le menu de la rangée reste là', () => {
  assert.match(carte({ recoupe: { cle: 'partie_b.a', titre: 'Matériel' } }), /Se recoupe avec «\s*Matériel\s*»/)
  assert.doesNotMatch(carte(), /Se recoupe/)
  assert.match(carte({ recoupe: { cle: 'partie_b.a', titre: 'Matériel' } }), /aria-label="Actions : Matériels dédiés"/)
})

test('l’écran du plan : calcule les recoupements et branche le lien sur le geste « retirer » existant', () => {
  const code = sansCommentaires(lire('src/routes/project/StepPlan.tsx'))
  assert.match(code, /recoupements\(/)
  assert.match(code, /recoupe=\{recoupes\.get\(p\.cle\)/)
  const carteCode = sansCommentaires(lire('src/components/plan/PartiePlanCarte.tsx'))
  assert.match(carteCode, /<MentionRecoupe titre=\{recoupe\.titre\} onRetirer=\{ajout \? onSupprimer : onRetirer\}/)
})

const base: EtatPlan = { valideEtAJour: false, valideLe: null, enregistre: false, modifie: false, enCours: false, enValidation: false }

test('barre du plan : « Valider le plan » n’y est écrit qu’une fois (le bouton du téléphone), jamais « Étape suivante » ; validé : « Rédiger le mémoire »', () => {
  const avant = renderToStaticMarkup(<BarrePlan etat={base} onValider={noop} onRediger={noop} />)
  assert.equal((avant.match(/Valider le plan/g) ?? []).length, 1)
  assert.doesNotMatch(avant, /Valider le plan et rédiger|Étape suivante/)
  const valide = renderToStaticMarkup(<BarrePlan etat={{ ...base, enregistre: true, valideEtAJour: true, valideLe: '2026-11-02T20:00:00' }} onValider={noop} onRediger={noop} />)
  assert.match(valide, /Rédiger le mémoire/)
  assert.doesNotMatch(valide, /Valider le plan/)
})

test('un seul appel de validation dans l’écran du plan', () => {
  const code = sansCommentaires(lire('src/routes/project/StepPlan.tsx'))
  assert.equal((code.match(/plan-memoire\/valider/g) ?? []).length, 1)
  assert.doesNotMatch(code, /onValiderEtRediger/)
})

test('libellés de la bande : « Aucune remplie », singulier et pluriel, « 1 page au plus »', () => {
  assert.equal(libelleFichesRemplies(0), 'Aucune remplie')
  assert.equal(libelleFichesRemplies(1), '1 remplie')
  assert.equal(libelleFichesRemplies(3), '3 remplies')
  assert.equal(libelleLongueur(1), '1 page au plus')
  assert.equal(libelleLongueur(20), '20 pages au plus')
})
