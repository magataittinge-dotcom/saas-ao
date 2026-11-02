// « Relire mon mémoire » : le contrat de GET /api/projects/:id/memoire/relecture (services/relecture_memoire.py)
// et les petites règles d'affichage. Contrôle déterministe côté serveur, sans IA.

export type TypeLigne = 'sous_critere' | 'piece' | 'a_completer' | 'dtu' | 'longueur'

/** La source d'une ligne dans le dossier : une exigence (le panneau s'y ancre) ou un document et une page cités. */
export type SourceLigne =
  | { type: 'exigence'; id: string }
  | { type: 'champ'; document: string; page: number | null; excerpt: string | null }

export interface LigneRelecture {
  type: TypeLigne
  /** Mot positif : « À couvrir », « À citer », « À compléter », « Hors liste autorisée », « À resserrer ». */
  libelle: string
  texte: string
  /** « preambule » ou « sec-<clé> » : les ancres de l'écran du mémoire ; null = aucune partie (page de garde). */
  ancre: string | null
  section: string | null
  source: SourceLigne | null
  detail: string | null
  nombre?: number
  /** Route de l'application (ex. « Mon entreprise ») pour une ligne qui ne se corrige pas dans le mémoire. */
  lien?: string
}

export interface ReponseRelecture {
  lignes: LigneRelecture[]
  nombre: number
  message: string | null
  pages_estimees: number
  limite_pages: number | null
}

/** Le résumé du bouton une fois le contrôle fait. Mots positifs seulement. */
export function resumeRelecture(r: Pick<ReponseRelecture, 'nombre'> | null | undefined): string {
  if (!r) return 'Relire mon mémoire'
  if (r.nombre === 0) return 'Relu : rien à reprendre'
  return `${r.nombre} ${r.nombre > 1 ? 'points à reprendre' : 'point à reprendre'}`
}

/** Remonte au passage du mémoire (ancres de StepMemoire) ; false si l'ancre n'existe pas à l'écran. */
export function allerALAncre(ancre: string | null, doc: Pick<Document, 'getElementById'> = document, comportement: ScrollBehavior = 'smooth'): boolean {
  if (!ancre) return false
  const el = doc.getElementById(ancre)
  if (!el) return false
  el.scrollIntoView({ behavior: comportement, block: 'start' })
  return true
}
