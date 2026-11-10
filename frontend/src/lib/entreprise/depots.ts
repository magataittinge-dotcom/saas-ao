// Dépôt de documents par rubrique de « Mon entreprise » — la logique pure (aucun React, aucun réseau).
// Les cases (nom, ce qu'on y met, ce que Synorix en fera, formats, plafond) viennent du serveur
// (GET /api/entreprise/depots/cases) : le front n'en garde aucune copie. Ici : les contrôles avant envoi,
// les messages de refus, l'état de chaque case, les propositions cochées et leur source.
import type { RubriqueId } from '@/lib/entreprise/avancement'

export interface CaseDefinition {
  id: string
  rubrique: RubriqueId
  nom: string
  /** Ce qu'on y met. */
  contenu: string
  /** Ce que Synorix en fera. */
  usage: string
  formats: string[]
  plafond_mo: number
  plusieurs_fichiers: boolean
  max_fichiers: number
}

// « differee » : plafond de lecture atteint (appels du jour, dépense du mois, file) ; le fichier est au coffre-fort, la lecture reprendra.
export type EtatLecture = 'vide' | 'en_lecture' | 'lu' | 'traite' | 'coffre_seul' | 'differee' | 'ocr_requis' | 'echec'

export interface FichierCase {
  lecture_id: string
  document_id: string
  nom: string
  etat: string
  message: string | null
  propositions: number
  pages_lues: number | null
  pages_total: number | null
  plafond_atteint: boolean
}

export interface CaseEtat extends CaseDefinition {
  etat: EtatLecture
  libelle_etat: string | null
  vers_verifier: boolean
  propositions: number
  note: string | null
  plafond: string | null
  fichiers: FichierCase[]
}

export interface PropositionSource { fichier: string; page: number | null; lieu: string | null }

export interface Proposition {
  id: string
  lecture_id: string
  case: string
  case_nom: string
  rubrique: RubriqueId
  champ: string
  libelle: string
  affichage: string
  a_confirmer: boolean
  remplace: string | null
  source: PropositionSource
  extrait: string | null
}

export const MESSAGE_FORMAT = "Ce fichier n’est pas un PDF, un Word, un Excel ou une image JPEG/PNG."
export const MESSAGE_ANCIEN_FORMAT = 'Enregistrez le fichier au format .docx (ou .xlsx) puis redéposez-le.'
export const TYPES_ACCEPTES = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png'
// Les anciens formats Word et Excel (OLE2) sont refusés : ils peuvent porter des macros.
const ANCIENS_FORMATS = ['.doc', '.xls']

export const MO = 1024 * 1024

const extension = (nom: string): string => {
  const i = nom.lastIndexOf('.')
  return i < 0 ? '' : nom.slice(i).toLowerCase()
}

export interface FichierLocal { name: string; size: number }

export interface RefusLocal { nom: string; message: string }

/** Contrôle avant envoi : le serveur refait tous les contrôles ; ceci évite d'envoyer ce qui sera refusé à coup sûr. */
export function trierFichiers(
  fichiers: FichierLocal[],
  regle: Pick<CaseDefinition, 'formats' | 'plafond_mo' | 'max_fichiers'>,
): { acceptes: FichierLocal[]; refus: RefusLocal[] } {
  const acceptes: FichierLocal[] = []
  const refus: RefusLocal[] = []
  for (const f of fichiers) {
    if (ANCIENS_FORMATS.includes(extension(f.name))) refus.push({ nom: f.name, message: MESSAGE_ANCIEN_FORMAT })
    else if (!regle.formats.includes(extension(f.name))) refus.push({ nom: f.name, message: MESSAGE_FORMAT })
    else if (f.size > regle.plafond_mo * MO) refus.push({ nom: f.name, message: `Fichier trop volumineux (max ${regle.plafond_mo} Mo).` })
    else if (acceptes.length >= regle.max_fichiers) refus.push({ nom: f.name, message: `${regle.max_fichiers} fichiers au plus par envoi.` })
    else acceptes.push(f)
  }
  return { acceptes, refus }
}

/** Le message d'un refus du serveur : 415 -> le format, 413 -> la taille, sinon le détail donné. */
export function messageRefus(statut: number | undefined, detail: unknown): string {
  if (typeof detail === 'string' && detail === MESSAGE_ANCIEN_FORMAT) return detail
  if (statut === 415) return MESSAGE_FORMAT
  if (typeof detail === 'string' && detail.trim()) return detail
  if (statut === 413) return 'Fichier trop volumineux.'
  if (statut === 429) return 'Trop de dépôts à la suite : réessayez dans une minute.'
  return 'Ce fichier n’a pas pu être déposé. Réessayez.'
}

export const casesDeLaRubrique = <T extends { rubrique: RubriqueId }>(cases: T[], rubrique: RubriqueId): T[] =>
  cases.filter((c) => c.rubrique === rubrique)

/** Une lecture est en cours : l'écran interroge l'état de la case. */
export const lectureEnCours = (cases: Pick<CaseEtat, 'etat'>[]): boolean => cases.some((c) => c.etat === 'en_lecture')

/** Le texte « Formats : … » sous une case. */
export const ligneFormats = (c: Pick<CaseDefinition, 'plafond_mo' | 'plusieurs_fichiers'>): string =>
  `PDF, Word, Excel, JPEG, PNG · ${c.plafond_mo} Mo${c.plusieurs_fichiers ? ' · plusieurs fichiers' : ''}`

/** Source d'une proposition : « kbis.pdf · page 2 », « inventaire.xlsx · feuille « Matériel » », « fiche.docx ». */
export function sourceLisible(s: PropositionSource): string {
  if (s.page != null) return `${s.fichier} · page ${s.page}`
  if (s.lieu && !/^document/i.test(s.lieu)) return `${s.fichier} · ${s.lieu}`
  return s.fichier
}

/** « À confirmer : remplace … » quand la valeur du profil diffère. */
export const libelleAConfirmer = (p: Pick<Proposition, 'a_confirmer' | 'remplace'>): string | null =>
  p.a_confirmer ? `À confirmer : remplace ${p.remplace ? `« ${p.remplace} »` : 'la valeur actuelle'}` : null

/** Propositions rangées par lecture (un fichier), dans l'ordre d'arrivée. */
export function groupesParLecture(propositions: Proposition[]): { lecture_id: string; case_nom: string; source: string; propositions: Proposition[] }[] {
  const groupes = new Map<string, { lecture_id: string; case_nom: string; source: string; propositions: Proposition[] }>()
  for (const p of propositions) {
    const g = groupes.get(p.lecture_id) ?? { lecture_id: p.lecture_id, case_nom: p.case_nom, source: p.source.fichier, propositions: [] }
    g.propositions.push(p)
    groupes.set(p.lecture_id, g)
  }
  return [...groupes.values()]
}

/** Tout est coché au départ ; rien n'est écrit tant que le patron n'a pas cliqué sur « Valider ». */
export const cochesParDefaut = (propositions: Proposition[]): Set<string> => new Set(propositions.map((p) => p.id))

export function basculer(coches: Set<string>, id: string): Set<string> {
  const suite = new Set(coches)
  if (suite.has(id)) suite.delete(id)
  else suite.add(id)
  return suite
}

/** Les identifiants cochés qui existent encore (une proposition tranchée ailleurs disparaît de la liste). */
export const cochesPresentes = (coches: Set<string>, propositions: Proposition[]): string[] =>
  propositions.filter((p) => coches.has(p.id)).map((p) => p.id)

export const libelleValider = (n: number): string => (n === 0 ? 'Valider' : n === 1 ? 'Valider 1 information' : `Valider ${n} informations`)

/** Le bilan d'une validation, en une phrase positive. */
export function phraseBilan(b: { validees: number; ecartees: number; erreurs: { libelle: string; message: string }[] }): string {
  const ecrites = b.validees === 0 ? 'Aucune information ajoutée à votre profil' : b.validees === 1 ? '1 information ajoutée à votre profil' : `${b.validees} informations ajoutées à votre profil`
  const erreurs = b.erreurs.length > 0 ? ` · ${b.erreurs.map((e) => `${e.libelle} : ${e.message}`).join(' ; ')}` : ''
  return ecrites + erreurs
}
