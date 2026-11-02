// Le plan du mémoire (B1/B2) : lecture de la réponse du serveur (backend/services/plan_memoire.py, sans IA) et gestes
// du patron (retirer, remettre, renommer, déplacer, ajouter). Tout est pur : l'écran appelle ces fonctions, le serveur
// recalcule sous-critères, sources et propositions à chaque lecture.
import type { PartieId } from '@/lib/memoireSections'

export const MAX_PARTIES = 60
export const MAX_TITRE = 120
export const MAX_TEXTE_LIBRE = 1000

export interface SourcePlan {
  type?: 'exigence' | 'champ'
  id?: string
  document?: string | null
  page?: number | null
}

export interface FichePlan {
  /** null = fiche non touchée : la proposition préremplie s'affiche, rien ne part au modèle. */
  references: string[] | null
  personnes: string[] | null
  materiel: string[] | null
  voulu: string
}

export interface CaseProposee { id: string; libelle: string; detail: string | null; coche: boolean }

export interface PartiePlan {
  cle: string
  partie: PartieId
  titre: string
  titre_modele: string | null
  retiree: boolean
  attendue: string | null
  fiche: FichePlan
  sous_criteres: { critere: string; nom: string; poids: number | null }[]
  attendues: { id: string; libelle: string; source: SourcePlan }[]
  source: SourcePlan | null
  exigences: { id: string | null; texte: string; source: SourcePlan | null }[]
  propose: { references: CaseProposee[]; personnes: CaseProposee[]; materiel: CaseProposee[] }
}

export interface VuePlan {
  parties: PartiePlan[]
  a_couvrir: { critere: string; nom: string; poids: number | null }[]
  resume: {
    parties: number; retirees: number
    sous_criteres_total: number; sous_criteres_servis: number
    limite_pages: number | null; fiches_remplies: number
  }
  limite_pages: { pages: number; source: SourcePlan | null } | null
  enregistre: boolean
  valide: boolean
  valide_le: string | null
  version: number
}

export const PARTIES_PLAN: readonly PartieId[] = ['partie_a', 'partie_b', 'partie_c']

export const TITRES_PARTIES_PLAN: Record<PartieId, string> = {
  partie_a: 'PARTIE A — PRÉSENTATION GÉNÉRALE',
  partie_b: 'PARTIE B — PRÉSENTATION DE LA PRESTATION',
  partie_c: 'PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE',
}

/** Ce que le serveur accepte pour une partie (les sources, sous-critères et propositions sont recalculés par lui). */
export interface PartieEnvoyee {
  cle: string
  titre: string
  retiree: boolean
  attendue: string | null
  fiche: FichePlan
}

export function corpsPlan(parties: readonly PartiePlan[]): { parties: PartieEnvoyee[] } {
  return {
    parties: parties.map((p) => ({
      cle: p.cle, titre: p.titre.slice(0, MAX_TITRE), retiree: p.retiree, attendue: p.attendue,
      fiche: { ...p.fiche, voulu: p.fiche.voulu.slice(0, MAX_TEXTE_LIBRE) },
    })),
  }
}

const sansChange = <T,>(liste: readonly T[]): T[] => [...liste]

/** Retirer ou remettre une partie (elle reste dans la liste, grisée : on peut la remettre). */
export function basculerRetrait(parties: readonly PartiePlan[], cle: string): PartiePlan[] {
  const gardees = parties.filter((p) => !p.retiree).length
  return parties.map((p) => {
    if (p.cle !== cle) return p
    // la dernière partie gardée ne se retire pas : un plan garde au moins une partie
    if (!p.retiree && gardees <= 1) return p
    return { ...p, retiree: !p.retiree }
  })
}

export function renommer(parties: readonly PartiePlan[], cle: string, titre: string): PartiePlan[] {
  return parties.map((p) => (p.cle === cle ? { ...p, titre: titre.slice(0, MAX_TITRE) } : p))
}

/** Monter (-1) ou descendre (+1) d'un cran, parmi les parties GARDÉES de la même partie A/B/C. */
export function deplacer(parties: readonly PartiePlan[], cle: string, sens: -1 | 1): PartiePlan[] {
  const liste = sansChange(parties)
  const i = liste.findIndex((p) => p.cle === cle)
  if (i < 0) return liste
  let j = i + sens
  while (j >= 0 && j < liste.length && (liste[j].partie !== liste[i].partie || liste[j].retiree)) {
    if (liste[j].partie !== liste[i].partie) return liste
    j += sens
  }
  if (j < 0 || j >= liste.length || liste[j].partie !== liste[i].partie) return liste
  ;[liste[i], liste[j]] = [liste[j], liste[i]]
  return liste
}

export function peutDeplacer(parties: readonly PartiePlan[], cle: string, sens: -1 | 1): boolean {
  const apres = deplacer(parties, cle, sens)
  return apres.some((p, k) => p.cle !== parties[k]?.cle)
}

/** Ajoute une partie nouvelle à la fin de la partie A, B ou C. */
export function ajouter(parties: readonly PartiePlan[], partie: PartieId, titre: string): PartiePlan[] {
  if (parties.length >= MAX_PARTIES) return sansChange(parties)
  const utilises = parties
    .filter((p) => p.partie === partie && /\.ajout_\d+$/.test(p.cle))
    .map((p) => Number(p.cle.split('ajout_')[1]))
  const numero = Math.max(0, ...utilises) + 1
  const nouvelle: PartiePlan = {
    cle: `${partie}.ajout_${numero}`, partie, titre: titre.trim().slice(0, MAX_TITRE) || 'Nouvelle partie',
    titre_modele: null, retiree: false, attendue: null,
    fiche: { references: null, personnes: null, materiel: null, voulu: '' },
    sous_criteres: [], attendues: [], source: null, exigences: [], propose: { references: [], personnes: [], materiel: [] },
  }
  const dernier = parties.reduce((k, p, i) => (p.partie === partie ? i : k), -1)
  const liste = sansChange(parties)
  liste.splice(dernier + 1, 0, nouvelle)
  return liste
}

/** Supprime pour de bon une partie que le patron a ajoutée (une partie du modèle est seulement retirée). */
export function supprimerAjout(parties: readonly PartiePlan[], cle: string): PartiePlan[] {
  return parties.filter((p) => p.cle !== cle || !/\.ajout_\d+$/.test(p.cle))
}

export function changerFiche(parties: readonly PartiePlan[], cle: string, fiche: Partial<FichePlan>): PartiePlan[] {
  return parties.map((p) => (p.cle === cle ? { ...p, fiche: { ...p.fiche, ...fiche } } : p))
}

/** Les cases cochées d'une fiche : le choix du patron, sinon la proposition préremplie. */
export function casesCochees(choix: string[] | null, proposees: readonly CaseProposee[]): Set<string> {
  return new Set(choix ?? proposees.filter((c) => c.coche).map((c) => c.id))
}

/** Une fiche est « remplie » quand le patron y a fait un choix (case, ligne libre). */
export function ficheRemplie(f: FichePlan): boolean {
  return f.voulu.trim().length > 0 || f.references !== null || f.personnes !== null || f.materiel !== null
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

/** « 22 parties · 5 sur 5 sous-critères servis · limite 20 pages · 3 fiches remplies » — chaque morceau seulement s'il existe. */
export function resumeDuPlan(vue: Pick<VuePlan, 'resume'>): string {
  const r = vue.resume
  const morceaux = [pluriel(r.parties, 'partie', 'parties')]
  if (r.sous_criteres_total > 0) morceaux.push(`${r.sous_criteres_servis} sur ${r.sous_criteres_total} sous-critères servis`)
  if (r.limite_pages) morceaux.push(`limite ${r.limite_pages} pages`)
  if (r.fiches_remplies > 0) morceaux.push(pluriel(r.fiches_remplies, 'fiche remplie', 'fiches remplies'))
  return morceaux.join(' · ')
}

export const libellePoids = (nom: string, poids: number | null | undefined) => (poids == null ? nom : `${nom} · ${poids} %`)

/** Les parties du plan regroupées par A, B, C (dans l'ordre du plan). */
export function parGroupe(parties: readonly PartiePlan[]): { partie: PartieId; titre: string; parties: PartiePlan[] }[] {
  return PARTIES_PLAN.map((partie) => ({
    partie, titre: TITRES_PARTIES_PLAN[partie], parties: parties.filter((p) => p.partie === partie),
  }))
}

/** « 3. Qualité des ouvrages » : la numérotation est celle du Word (parmi les parties gardées de la partie). */
export function numeroDansLaPartie(parties: readonly PartiePlan[], cle: string): number | null {
  const cible = parties.find((p) => p.cle === cle)
  if (!cible || cible.retiree) return null
  return parties.filter((p) => p.partie === cible.partie && !p.retiree).findIndex((p) => p.cle === cle) + 1
}

/** Les états de la bande de résumé (voir components/etape/BandeResume) : constantes, pour ne pas répéter l'identifiant technique. */
export const ETAT_PRET = 'pret' as const
export const ETAT_A_VERIFIER = 'a-verifier' as const
